/**
 * A deliberately small Python reader.
 *
 * Reverse conversion only ever needs to recover *static* values from a request
 * call: strings, numbers, booleans, collections, and keyword arguments. It does
 * not need to understand Python. So rather than ship a grammar for the whole
 * language, this reads the subset that can be resolved with certainty and
 * refuses everything else by construction.
 *
 * Anything whose value depends on runtime — an f-string with a placeholder,
 * `.format(...)`, `%` interpolation, a comprehension, a function call in a
 * value position — parses into an `unresolved` node carrying its source text.
 * The extractor turns those into reported issues rather than guesses, matching
 * how the JavaScript side already behaves.
 */

export type PythonNode =
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "none" }
  | { readonly kind: "list"; readonly items: readonly PythonNode[] }
  | { readonly kind: "tuple"; readonly items: readonly PythonNode[] }
  | { readonly kind: "dict"; readonly entries: readonly PythonEntry[] }
  | { readonly kind: "name"; readonly value: string }
  | {
      readonly kind: "call";
      readonly callee: string;
      readonly args: PythonArguments;
    }
  /** A `+` chain, folded once its operands are resolved against bindings. */
  | {
      readonly kind: "concat";
      readonly operands: readonly PythonNode[];
      readonly source: string;
    }
  /** A static value converted to bytes with `.encode(...)`. */
  | {
      readonly kind: "encoded";
      readonly value: PythonNode;
      readonly encoding?: string;
    }
  /** Anything outside the supported subset. `source` is shown to the user. */
  | { readonly kind: "unresolved"; readonly source: string };

export interface PythonEntry {
  readonly key: PythonNode;
  readonly value: PythonNode;
}

export interface PythonArguments {
  readonly positional: readonly PythonNode[];
  readonly keyword: ReadonlyMap<string, PythonNode>;
}

export interface PythonCall {
  /** Dotted callee, e.g. `requests.get` or `session.post`. */
  readonly callee: string;
  readonly args: PythonArguments;
  /** Byte offset of the call, used to order it against assignments. */
  readonly start: number;
  readonly source: string;
}

type TokenKind = "string" | "number" | "name" | "op" | "newline" | "end";

interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  readonly start: number;
  readonly end: number;
  /** Set on string tokens whose value could not be resolved statically. */
  readonly dynamic?: boolean;
}

const KEYWORD_VALUES = new Set(["True", "False", "None"]);

function isNameStart(char: string): boolean {
  return /[A-Za-z_]/u.test(char);
}

function isNamePart(char: string): boolean {
  return /[A-Za-z0-9_]/u.test(char);
}

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

/**
 * Decode a Python string literal body. Returns `undefined` when the literal
 * cannot be represented statically, which is how f-strings with placeholders
 * are rejected.
 */
function decodeString(
  raw: string,
  quote: string,
  prefix: string,
): string | undefined {
  const lower = prefix.toLowerCase();
  // An f-string is static only when it contains no replacement field at all.
  if (lower.includes("f") && /(?<!\{)\{(?!\{)/u.test(raw)) return undefined;
  if (lower.includes("r")) return raw;

  let out = "";
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (char !== "\\") {
      out += char;
      continue;
    }
    index += 1;
    const escape = raw[index];
    if (escape === undefined) return undefined;
    switch (escape) {
      case "n":
        out += "\n";
        break;
      case "t":
        out += "\t";
        break;
      case "r":
        out += "\r";
        break;
      case "0":
        out += "\0";
        break;
      case "\\":
        out += "\\";
        break;
      case "'":
        out += "'";
        break;
      case '"':
        out += '"';
        break;
      case "\n":
        break;
      case "x": {
        const hex = raw.slice(index + 1, index + 3);
        if (!/^[0-9a-fA-F]{2}$/u.test(hex)) return undefined;
        out += String.fromCharCode(Number.parseInt(hex, 16));
        index += 2;
        break;
      }
      case "u": {
        const hex = raw.slice(index + 1, index + 5);
        if (!/^[0-9a-fA-F]{4}$/u.test(hex)) return undefined;
        out += String.fromCharCode(Number.parseInt(hex, 16));
        index += 4;
        break;
      }
      default:
        // An unknown escape is left as written, which is Python's behaviour.
        out += `\\${escape}`;
    }
  }
  if (quote === "") return out;
  return out;
}

function tokenize(source: string): readonly Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index] ?? "";

    if (char === "#") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }

    if (char === "\n") {
      tokens.push({
        kind: "newline",
        value: "\n",
        start: index,
        end: index + 1,
      });
      index += 1;
      continue;
    }

    if (char === " " || char === "\t" || char === "\r") {
      index += 1;
      continue;
    }

    // A backslash at end of line continues the logical line.
    if (char === "\\" && source[index + 1] === "\n") {
      index += 2;
      continue;
    }

    // String literal, with optional prefix such as r, b, f, rb.
    const prefixMatch = /^([A-Za-z]{0,2})(?:'''|"""|'|")/u.exec(
      source.slice(index, index + 5),
    );
    if (
      prefixMatch !== null &&
      (prefixMatch[1] === "" || /^[rbfuRBFU]+$/u.test(prefixMatch[1] ?? ""))
    ) {
      const prefix = prefixMatch[1] ?? "";
      const afterPrefix = index + prefix.length;
      const triple =
        source.startsWith("'''", afterPrefix) ||
        source.startsWith('"""', afterPrefix);
      const quote = triple
        ? source.slice(afterPrefix, afterPrefix + 3)
        : (source[afterPrefix] ?? "");
      if (quote !== "") {
        const bodyStart = afterPrefix + quote.length;
        let cursor = bodyStart;
        let closed = false;
        while (cursor < source.length) {
          if (source[cursor] === "\\" && !prefix.toLowerCase().includes("r")) {
            cursor += 2;
            continue;
          }
          if (source.startsWith(quote, cursor)) {
            closed = true;
            break;
          }
          cursor += 1;
        }
        if (!closed) break;
        const body = source.slice(bodyStart, cursor);
        const decoded = decodeString(body, quote, prefix);
        tokens.push({
          kind: "string",
          value: decoded ?? source.slice(index, cursor + quote.length),
          start: index,
          end: cursor + quote.length,
          ...(decoded === undefined ? { dynamic: true } : {}),
        });
        index = cursor + quote.length;
        continue;
      }
    }

    if (isDigit(char) || (char === "-" && isDigit(source[index + 1] ?? ""))) {
      let cursor = index + 1;
      while (
        cursor < source.length &&
        /[0-9._eExXa-fA-F+-]/u.test(source[cursor] ?? "")
      ) {
        // Stop before an operator that is not part of an exponent.
        const current = source[cursor] ?? "";
        const previous = source[cursor - 1] ?? "";
        if (
          (current === "+" || current === "-") &&
          previous !== "e" &&
          previous !== "E"
        )
          break;
        cursor += 1;
      }
      tokens.push({
        kind: "number",
        value: source.slice(index, cursor),
        start: index,
        end: cursor,
      });
      index = cursor;
      continue;
    }

    if (isNameStart(char)) {
      let cursor = index + 1;
      while (cursor < source.length && isNamePart(source[cursor] ?? ""))
        cursor += 1;
      tokens.push({
        kind: "name",
        value: source.slice(index, cursor),
        start: index,
        end: cursor,
      });
      index = cursor;
      continue;
    }

    tokens.push({ kind: "op", value: char, start: index, end: index + 1 });
    index += 1;
  }

  tokens.push({
    kind: "end",
    value: "",
    start: source.length,
    end: source.length,
  });
  return tokens;
}

class Reader {
  private position = 0;

  constructor(
    private readonly tokens: readonly Token[],
    private readonly source: string,
  ) {}

  peek(offset = 0): Token {
    return (
      this.tokens[this.position + offset] ?? {
        kind: "end",
        value: "",
        start: this.source.length,
        end: this.source.length,
      }
    );
  }

  next(): Token {
    const token = this.peek();
    this.position += 1;
    return token;
  }

  at(value: string): boolean {
    const token = this.peek();
    return (
      (token.kind === "op" || token.kind === "name") && token.value === value
    );
  }

  eat(value: string): boolean {
    if (!this.at(value)) return false;
    this.position += 1;
    return true;
  }

  skipNewlines(): void {
    while (this.peek().kind === "newline") this.position += 1;
  }

  get index(): number {
    return this.position;
  }

  set index(value: number) {
    this.position = value;
  }

  /**
   * Consume a balanced bracketed run and return its source, used to describe an
   * expression this reader deliberately does not understand.
   */
  skipBalanced(open: string, close: string): string {
    const start = this.peek().start;
    let depth = 0;
    for (;;) {
      const token = this.peek();
      if (token.kind === "end") break;
      if (token.kind === "op" && token.value === open) depth += 1;
      if (token.kind === "op" && token.value === close) {
        depth -= 1;
        this.next();
        if (depth === 0) break;
        continue;
      }
      this.next();
    }
    return this.source.slice(start, this.peek(-1).end);
  }
}

function parseDottedName(reader: Reader): string | undefined {
  if (reader.peek().kind !== "name") return undefined;
  let name = reader.next().value;
  while (reader.at(".") && reader.peek(1).kind === "name") {
    reader.next();
    name += `.${reader.next().value}`;
  }
  return name;
}

function parseArguments(reader: Reader, source: string): PythonArguments {
  const positional: PythonNode[] = [];
  const keyword = new Map<string, PythonNode>();
  reader.eat("(");
  reader.skipNewlines();
  while (!reader.at(")") && reader.peek().kind !== "end") {
    reader.skipNewlines();
    if (reader.at(")")) break;
    // Keyword argument: NAME = value, but not NAME == value.
    if (
      reader.peek().kind === "name" &&
      reader.peek(1).kind === "op" &&
      reader.peek(1).value === "=" &&
      !(reader.peek(2).kind === "op" && reader.peek(2).value === "=")
    ) {
      const name = reader.next().value;
      reader.next();
      keyword.set(name, parseExpression(reader, source));
    } else {
      positional.push(parseExpression(reader, source));
    }
    reader.skipNewlines();
    if (!reader.eat(",")) break;
    reader.skipNewlines();
  }
  reader.skipNewlines();
  reader.eat(")");
  return { positional, keyword };
}

function parseExpression(reader: Reader, source: string): PythonNode {
  const start = reader.peek().start;
  let node = parsePrimary(reader, source);

  // Adjacent string literals concatenate in Python.
  if (node.kind === "string") {
    let combined = node.value;
    while (reader.peek().kind === "string") {
      const token = reader.next();
      if (token.dynamic === true) {
        return { kind: "unresolved", source: source.slice(start, token.end) };
      }
      combined += token.value;
    }
    if (combined !== node.value) node = { kind: "string", value: combined };
  }

  // Generated Python uses `"bytes".encode("utf-8")` for inline binary
  // payloads. Consume any method call here so the argument reader continues to
  // later keywords; only encode has a static meaning in this subset.
  if (
    reader.at(".") &&
    reader.peek(1).kind === "name" &&
    reader.peek(2).value === "("
  ) {
    reader.next();
    const method = reader.next().value;
    const args = parseArguments(reader, source);
    const end = reader.peek(-1).end;
    // `b"".join([...])` is how a multipart message is assembled by hand, so the
    // literal parts are folded here. A part this reader cannot evaluate leaves
    // the whole payload unresolved rather than being silently skipped.
    if (
      method === "join" &&
      args.keyword.size === 0 &&
      node.kind === "string"
    ) {
      const items = args.positional[0];
      if (
        args.positional.length === 1 &&
        items !== undefined &&
        (items.kind === "list" || items.kind === "tuple")
      ) {
        const pieces: string[] = [];
        let foldable = true;
        for (const item of items.items) {
          if (item.kind === "string") {
            pieces.push(item.value);
            continue;
          }
          if (item.kind === "encoded" && item.value.kind === "string") {
            pieces.push(item.value.value);
            continue;
          }
          foldable = false;
          break;
        }
        if (foldable) {
          return { kind: "string", value: pieces.join(node.value) };
        }
      }
      return { kind: "unresolved", source: source.slice(start, end) };
    }
    if (method === "encode" && args.keyword.size === 0) {
      const encodingNode = args.positional[0];
      const encoding =
        encodingNode?.kind === "string" ? encodingNode.value : undefined;
      const normalizedEncoding = encoding?.toLowerCase().replaceAll("_", "-");
      if (
        args.positional.length <= 1 &&
        (normalizedEncoding === undefined ||
          normalizedEncoding === "utf-8" ||
          normalizedEncoding === "utf8")
      ) {
        return {
          kind: "encoded",
          value: node,
          ...(encoding === undefined ? {} : { encoding }),
        };
      }
    }
    return { kind: "unresolved", source: source.slice(start, end) };
  }

  // `+` folds when every operand is a statically known string, which is how
  // "Bearer " + TOKEN is recovered. Any other operator, or a `+` over something
  // this reader cannot evaluate, leaves the static subset.
  if (reader.at("+")) {
    const operands: PythonNode[] = [node];
    while (reader.eat("+")) operands.push(parsePrimary(reader, source));
    const end = reader.peek(-1).end;
    return {
      kind: "concat",
      operands,
      source: source.slice(start, end),
    };
  }

  const following = reader.peek();
  if (
    following.kind === "op" &&
    ["-", "*", "/", "%", "|"].includes(following.value)
  ) {
    while (
      reader.peek().kind !== "end" &&
      reader.peek().kind !== "newline" &&
      !reader.at(",") &&
      !reader.at(")") &&
      !reader.at("]") &&
      !reader.at("}")
    ) {
      reader.next();
    }
    return {
      kind: "unresolved",
      source: source.slice(start, reader.peek(-1).end),
    };
  }

  return node;
}

function parsePrimary(reader: Reader, source: string): PythonNode {
  const token = reader.peek();

  if (token.kind === "string") {
    reader.next();
    return token.dynamic === true
      ? { kind: "unresolved", source: token.value }
      : { kind: "string", value: token.value };
  }

  if (token.kind === "number") {
    reader.next();
    const value = Number(token.value);
    return Number.isFinite(value)
      ? { kind: "number", value }
      : { kind: "unresolved", source: token.value };
  }

  if (token.kind === "op" && token.value === "[") {
    reader.next();
    const items = parseSequence(reader, source, "]");
    return { kind: "list", items };
  }

  if (token.kind === "op" && token.value === "(") {
    reader.next();
    const items = parseSequence(reader, source, ")");
    return items.length === 1
      ? (items[0] as PythonNode)
      : { kind: "tuple", items };
  }

  if (token.kind === "op" && token.value === "{") {
    const restore = reader.index;
    reader.next();
    const entries: PythonEntry[] = [];
    reader.skipNewlines();
    while (!reader.at("}") && reader.peek().kind !== "end") {
      reader.skipNewlines();
      if (reader.at("}")) break;
      const key = parseExpression(reader, source);
      if (!reader.eat(":")) {
        // A set literal or comprehension; neither is a supported value shape.
        reader.index = restore;
        return { kind: "unresolved", source: reader.skipBalanced("{", "}") };
      }
      const value = parseExpression(reader, source);
      entries.push({ key, value });
      reader.skipNewlines();
      if (!reader.eat(",")) break;
      reader.skipNewlines();
    }
    reader.skipNewlines();
    reader.eat("}");
    return { kind: "dict", entries };
  }

  if (token.kind === "name") {
    if (KEYWORD_VALUES.has(token.value)) {
      reader.next();
      if (token.value === "None") return { kind: "none" };
      return { kind: "boolean", value: token.value === "True" };
    }
    const name = parseDottedName(reader);
    if (name === undefined) {
      reader.next();
      return { kind: "unresolved", source: token.value };
    }
    if (reader.at("(")) {
      const args = parseArguments(reader, source);
      return { kind: "call", callee: name, args };
    }
    if (reader.at("[")) {
      // Subscripting a name is a lookup this reader cannot resolve.
      const subscript = reader.skipBalanced("[", "]");
      return { kind: "unresolved", source: `${name}${subscript}` };
    }
    return { kind: "name", value: name };
  }

  reader.next();
  return { kind: "unresolved", source: source.slice(token.start, token.end) };
}

function parseSequence(
  reader: Reader,
  source: string,
  close: string,
): readonly PythonNode[] {
  const items: PythonNode[] = [];
  reader.skipNewlines();
  while (!reader.at(close) && reader.peek().kind !== "end") {
    reader.skipNewlines();
    if (reader.at(close)) break;
    items.push(parseExpression(reader, source));
    reader.skipNewlines();
    if (!reader.eat(",")) break;
    reader.skipNewlines();
  }
  reader.skipNewlines();
  reader.eat(close);
  return items;
}

interface SourceScopes {
  readonly lineStarts: readonly number[];
  readonly paths: readonly (readonly number[])[];
}

function indentationOf(line: string): number {
  let indentation = 0;
  for (const character of line) {
    if (character === " ") indentation += 1;
    else if (character === "\t") indentation += 8;
    else break;
  }
  return indentation;
}

/**
 * Assign a stable scope path to every physical line using Python indentation.
 * This is deliberately conservative: a binding is visible only when its block
 * path is an ancestor of the request call's path. Values from sibling branches
 * or unrelated functions therefore cannot leak into a conversion.
 */
function sourceScopes(source: string, tokens: readonly Token[]): SourceScopes {
  const lineStarts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") lineStarts.push(index + 1);
  }

  const paths: (readonly number[])[] = [];
  const stack: { readonly id: number; readonly indentation: number }[] = [];
  let nextScopeId = 1;
  let tokenIndex = 0;
  let bracketDepth = 0;
  let continuationIndentation: number | undefined;

  for (let lineIndex = 0; lineIndex < lineStarts.length; lineIndex += 1) {
    const start = lineStarts[lineIndex] ?? 0;
    const end = lineStarts[lineIndex + 1] ?? source.length;
    const line = source.slice(start, end);
    const indentation = indentationOf(line);
    const lineTokens: Token[] = [];

    while (
      tokenIndex < tokens.length &&
      (tokens[tokenIndex]?.start ?? source.length) < end
    ) {
      const token = tokens[tokenIndex];
      tokenIndex += 1;
      if (
        token !== undefined &&
        token.start >= start &&
        token.kind !== "newline" &&
        token.kind !== "end"
      ) {
        lineTokens.push(token);
      }
    }

    const depthBefore = bracketDepth;
    const hasStatement = lineTokens.length > 0;
    if (hasStatement && depthBefore === 0) {
      while (
        stack.length > 0 &&
        indentation <= (stack[stack.length - 1]?.indentation ?? -1)
      ) {
        stack.pop();
      }
      continuationIndentation = indentation;
    }

    paths.push(stack.map(({ id }) => id));

    for (const token of lineTokens) {
      if (token.kind !== "op") continue;
      if (["(", "[", "{"].includes(token.value)) bracketDepth += 1;
      else if ([")", "]", "}"].includes(token.value)) {
        bracketDepth = Math.max(0, bracketDepth - 1);
      }
    }

    const last = lineTokens[lineTokens.length - 1];
    if (
      hasStatement &&
      bracketDepth === 0 &&
      last?.kind === "op" &&
      last.value === ":"
    ) {
      stack.push({
        id: nextScopeId,
        indentation: continuationIndentation ?? indentation,
      });
      nextScopeId += 1;
    }
  }

  return { lineStarts, paths };
}

function lineIndexAt(offset: number, lineStarts: readonly number[]): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const start = lineStarts[middle] ?? 0;
    const next = lineStarts[middle + 1] ?? Number.POSITIVE_INFINITY;
    if (offset < start) high = middle - 1;
    else if (offset >= next) low = middle + 1;
    else return middle;
  }
  return Math.max(0, Math.min(low, lineStarts.length - 1));
}

function isPathPrefix(
  candidate: readonly number[],
  destination: readonly number[],
): boolean {
  return (
    candidate.length <= destination.length &&
    candidate.every((scope, index) => destination[index] === scope)
  );
}

/**
 * Static `NAME = <expression>` bindings visible to one request call. Keyword
 * arguments inside a multiline call are excluded by bracket depth, and a name
 * assigned more than once in the visible path is dropped rather than guessed.
 */
export function collectBindings(
  source: string,
  beforeOffset: number,
): ReadonlyMap<string, PythonNode> {
  const tokens = tokenize(source);
  const reader = new Reader(tokens, source);
  const bindings = new Map<string, PythonNode>();
  const reassigned = new Set<string>();
  const scopes = sourceScopes(source, tokens);
  const callPath =
    scopes.paths[lineIndexAt(beforeOffset, scopes.lineStarts)] ?? [];
  const bracketDepthAtToken: number[] = [];
  let bracketDepth = 0;
  for (const token of tokens) {
    bracketDepthAtToken.push(bracketDepth);
    if (token.kind !== "op") continue;
    if (["(", "[", "{"].includes(token.value)) bracketDepth += 1;
    else if ([")", "]", "}"].includes(token.value)) {
      bracketDepth = Math.max(0, bracketDepth - 1);
    }
  }

  while (reader.peek().kind !== "end") {
    reader.skipNewlines();
    if (reader.peek().kind === "end") break;
    if (reader.peek().start >= beforeOffset) break;
    const candidatePath =
      scopes.paths[lineIndexAt(reader.peek().start, scopes.lineStarts)] ?? [];
    if (
      bracketDepthAtToken[reader.index] === 0 &&
      isPathPrefix(candidatePath, callPath) &&
      reader.peek().kind === "name" &&
      reader.peek(1).kind === "op" &&
      reader.peek(1).value === "=" &&
      !(reader.peek(2).kind === "op" && reader.peek(2).value === "=")
    ) {
      const name = reader.next().value;
      reader.next();
      const value = parseExpression(reader, source);
      if (bindings.has(name)) reassigned.add(name);
      bindings.set(name, value);
      continue;
    }
    // Skip to the next logical line.
    while (reader.peek().kind !== "newline" && reader.peek().kind !== "end") {
      reader.next();
    }
  }

  for (const name of reassigned) bindings.delete(name);
  return bindings;
}

/** Every call expression in the source, in source order. */
export function collectCalls(source: string): readonly PythonCall[] {
  const tokens = tokenize(source);
  const reader = new Reader(tokens, source);
  const calls: PythonCall[] = [];

  while (reader.peek().kind !== "end") {
    const token = reader.peek();
    if (token.kind === "name" && !KEYWORD_VALUES.has(token.value)) {
      const start = token.start;
      const restore = reader.index;
      const callee = parseDottedName(reader);
      if (callee !== undefined && reader.at("(")) {
        const args = parseArguments(reader, source);
        calls.push({
          callee,
          args,
          start,
          source: source.slice(start, reader.peek(-1).end),
        });
        continue;
      }
      reader.index = restore + 1;
      continue;
    }
    reader.next();
  }

  return calls;
}

/**
 * Resolve names and `+` chains throughout a value, not just at its root.
 *
 * A header dict is the common case: the dict itself is a literal, but its
 * values may be bound names or concatenations, and the extractor reads those
 * without knowing how they were written.
 */
export function deepResolve(
  node: PythonNode,
  bindings: ReadonlyMap<string, PythonNode>,
): PythonNode {
  const resolved = resolve(node, bindings);
  switch (resolved.kind) {
    case "list":
      return {
        kind: "list",
        items: resolved.items.map((item) => deepResolve(item, bindings)),
      };
    case "tuple":
      return {
        kind: "tuple",
        items: resolved.items.map((item) => deepResolve(item, bindings)),
      };
    case "dict":
      return {
        kind: "dict",
        entries: resolved.entries.map((entry) => ({
          key: deepResolve(entry.key, bindings),
          value: deepResolve(entry.value, bindings),
        })),
      };
    case "encoded":
      return {
        kind: "encoded",
        value: deepResolve(resolved.value, bindings),
        ...(resolved.encoding === undefined
          ? {}
          : { encoding: resolved.encoding }),
      };
    default:
      return resolved;
  }
}

/** Resolve a bare name through the collected bindings, one hop at a time. */
export function resolve(
  node: PythonNode,
  bindings: ReadonlyMap<string, PythonNode>,
  seen: ReadonlySet<string> = new Set(),
): PythonNode {
  if (node.kind === "concat") {
    let combined = "";
    for (const operand of node.operands) {
      const value = resolve(operand, bindings, seen);
      if (value.kind !== "string")
        return { kind: "unresolved", source: node.source };
      combined += value.value;
    }
    return { kind: "string", value: combined };
  }
  if (node.kind !== "name") return node;
  if (seen.has(node.value)) return { kind: "unresolved", source: node.value };
  const bound = bindings.get(node.value);
  if (bound === undefined) return { kind: "unresolved", source: node.value };
  return resolve(bound, bindings, new Set([...seen, node.value]));
}
