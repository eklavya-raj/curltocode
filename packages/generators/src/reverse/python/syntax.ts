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
  const node = parsePrimary(reader, source);

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
    if (combined !== node.value) return { kind: "string", value: combined };
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

/**
 * Module-level `NAME = <expression>` bindings, in source order. Only the last
 * assignment before a given call is visible to it, and a name assigned more
 * than once before the call is dropped entirely rather than guessed at.
 */
export function collectBindings(
  source: string,
): ReadonlyMap<string, PythonNode> {
  const tokens = tokenize(source);
  const reader = new Reader(tokens, source);
  const bindings = new Map<string, PythonNode>();
  const reassigned = new Set<string>();

  while (reader.peek().kind !== "end") {
    reader.skipNewlines();
    if (reader.peek().kind === "end") break;
    if (
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
