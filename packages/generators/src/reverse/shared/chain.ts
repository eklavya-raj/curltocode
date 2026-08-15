import { TokenReader, tokenize } from "./clike.js";
import type { DialectTraits, Token } from "./clike.js";
import type { StaticEntry, StaticValue } from "./values.js";

/**
 * A reader for fluent, builder-style request code.
 *
 * Java, C#, Ruby, and Rust all express a request as a chain of method calls,
 * optionally interleaved with assignments. That shape is common enough across
 * the four that scanning for it once is far more reliable than writing four
 * nearly identical scanners, and it keeps every language's own knowledge
 * confined to a mapping from method name to request field.
 */

export interface SourceCall {
  /** Final segment, which is what identifies the operation. */
  readonly method: string;
  /**
   * Fully qualified path when the receiver is a name, such as
   * `Net::HTTP::Post.new`. A chained call whose receiver is another call's
   * result has no path, and carries just its method.
   */
  readonly path: string;
  readonly args: readonly StaticValue[];
  readonly start: number;
}

export interface SourceAssignment {
  /** Left-hand side, such as `request.body` or `request["X-Token"]`. */
  readonly target: string;
  /** Index expression for a subscript assignment, already decoded. */
  readonly index?: string;
  readonly value: StaticValue;
  readonly start: number;
}

export interface ChainSource {
  readonly calls: readonly SourceCall[];
  readonly assignments: readonly SourceAssignment[];
  readonly bindings: ReadonlyMap<string, StaticValue>;
  readonly source: string;
}

export interface ChainTraits extends DialectTraits {
  /**
   * Calls that merely wrap a payload and can be read through to their first
   * argument, such as `URI.create` or `RequestBody.create`.
   */
  readonly transparentCalls?: readonly string[];
  /** Operators that concatenate strings, folded when both sides are static. */
  readonly concatOperators?: readonly string[];
  /** Keywords introducing a binding, such as `let`, `var`, or `final`. */
  readonly bindingKeywords?: readonly string[];
}

const NULL_NAMES = new Set(["null", "nil", "none", "undefined"]);

function pathEndingAt(
  tokens: readonly Token[],
  index: number,
): { readonly path: string; readonly start: number } {
  // Walk backwards across `a.b::c` so the call keeps its qualified name.
  let cursor = index;
  let path = tokens[index]?.value ?? "";
  let start = tokens[index]?.start ?? 0;
  while (cursor >= 2) {
    const separator = tokens[cursor - 1];
    const previous = tokens[cursor - 2];
    if (
      separator?.kind !== "op" ||
      (separator.value !== "." && separator.value !== "::") ||
      previous?.kind !== "name"
    ) {
      break;
    }
    path = `${previous.value}${separator.value}${path}`;
    start = previous.start;
    cursor -= 2;
  }
  return { path, start };
}

export function readChain(
  source: string,
  traits: ChainTraits = {},
): ChainSource {
  const tokens = tokenize(source, traits);
  const transparent = new Set(traits.transparentCalls ?? []);
  const concat = traits.concatOperators ?? ["+"];
  const bindingKeywords = new Set(traits.bindingKeywords ?? []);

  function parseExpression(
    reader: TokenReader,
    bindings?: ReadonlyMap<string, StaticValue>,
  ): StaticValue {
    const start = reader.peek()?.start ?? 0;
    let value = parsePrimary(reader, bindings);
    while (concat.some((operator) => reader.atOperator(operator))) {
      reader.next();
      const right = parsePrimary(reader, bindings);
      const left =
        bindings === undefined ? value : resolveValue(value, bindings);
      const other =
        bindings === undefined ? right : resolveValue(right, bindings);
      if (left.kind === "string" && other.kind === "string") {
        value = { kind: "string", value: left.value + other.value };
        continue;
      }
      return {
        kind: "unresolved",
        source: source
          .slice(start, reader.peek()?.start ?? source.length)
          .trim(),
      };
    }
    return value;
  }

  function parsePrimary(
    reader: TokenReader,
    bindings?: ReadonlyMap<string, StaticValue>,
  ): StaticValue {
    return parsePostfix(parseAtom(reader, bindings), reader, bindings);
  }

  /**
   * Consume suffixes applied to a value, such as `"get".to_sym`, `.to_string()`,
   * `.await`, and Rust's `?`.
   *
   * Without this an argument list stops at the first suffix, silently dropping
   * every argument after it.
   */
  function parsePostfix(
    value: StaticValue,
    reader: TokenReader,
    bindings?: ReadonlyMap<string, StaticValue>,
  ): StaticValue {
    let current = value;
    while (true) {
      if (reader.atOperator("?")) {
        reader.next();
        continue;
      }
      if (!reader.atOperator(".") || reader.peek(1)?.kind !== "name") break;
      const name = reader.peek(1)?.value ?? "";
      const isCall =
        reader.peek(2)?.kind === "op" && reader.peek(2)?.value === "(";
      if (!isCall) {
        // A bare suffix such as `.await` or Ruby's `.to_sym` leaves the value
        // unchanged; anything else ends the postfix run.
        if (name !== "await" && !transparent.has(name)) break;
        reader.next();
        reader.next();
        continue;
      }
      reader.next();
      reader.next();
      parseArguments(reader, bindings);
      // A suffix conversion transforms its receiver, so the value is the
      // receiver rather than an argument. That is the opposite of a prefix
      // wrapper such as `Some(x)`, which carries its payload as an argument.
      if (transparent.has(name)) continue;
      current = { kind: "unresolved", source: name };
    }
    return current;
  }

  function parseAtom(
    reader: TokenReader,
    bindings?: ReadonlyMap<string, StaticValue>,
  ): StaticValue {
    const token = reader.peek();
    if (token === undefined) return { kind: "unresolved", source: "" };

    if (token.kind === "string") {
      reader.next();
      return { kind: "string", value: token.text ?? "" };
    }
    // A one-letter prefix touching a string is a literal prefix, as in Rust's
    // byte string b"POST" and raw string r"...". The payload is the string.
    if (
      token.kind === "name" &&
      /^[A-Za-z]$/u.test(token.value) &&
      reader.peek(1)?.kind === "string" &&
      reader.peek(1)?.start === token.end
    ) {
      reader.next();
      const literal = reader.next();
      return { kind: "string", value: literal?.text ?? "" };
    }
    if (token.kind === "number") {
      reader.next();
      return { kind: "number", value: Number(token.value.replaceAll("_", "")) };
    }
    // Borrow, dereference, and Rust's `?` are transparent to the value.
    if (reader.atOperator("&") || reader.atOperator("*")) {
      reader.next();
      return parsePrimary(reader, bindings);
    }
    if (reader.atOperator("(")) {
      reader.next();
      const inner = parseExpression(reader, bindings);
      reader.eatOperator(")");
      return inner;
    }
    if (reader.atOperator("[")) return parseList(reader, bindings);
    if (reader.atOperator("{")) return parseMap(reader, bindings);
    if (reader.atOperator("-")) {
      const after = reader.peek(1);
      if (after?.kind === "number") {
        reader.next();
        reader.next();
        return { kind: "number", value: -Number(after.value) };
      }
    }
    if (token.kind !== "name") {
      const end = skipBalanced(reader);
      return {
        kind: "unresolved",
        source: source.slice(token.start, end).trim(),
      };
    }

    // `new Type(...)` constructs, which several of these languages require.
    if (token.value === "new") {
      reader.next();
      return parsePrimary(reader, bindings);
    }
    const path = readForwardPath(reader);
    if (reader.atOperator("(")) {
      const args = parseArguments(reader, bindings);
      if (
        transparent.has(path) ||
        transparent.has(path.split(/[.:]+/u).at(-1) ?? "")
      ) {
        // A wrapper contributes nothing of its own; its payload is the value.
        return args[0] ?? { kind: "null" };
      }
      return {
        kind: "unresolved",
        source: source
          .slice(token.start, reader.peek()?.start ?? source.length)
          .trim(),
      };
    }
    // A brace immediately after a type name is an initializer or struct literal.
    if (reader.atOperator("{")) return parseMap(reader, bindings);
    const lower = path.toLowerCase();
    if (lower === "true") return { kind: "boolean", value: true };
    if (lower === "false") return { kind: "boolean", value: false };
    if (NULL_NAMES.has(lower)) return { kind: "null" };
    return { kind: "identifier", name: path };
  }

  function readForwardPath(reader: TokenReader): string {
    let path = reader.next()?.value ?? "";
    while (
      (reader.atOperator(".") || reader.atOperator("::")) &&
      reader.peek(1)?.kind === "name"
    ) {
      const separator = reader.next()?.value ?? ".";
      path += `${separator}${reader.next()?.value ?? ""}`;
    }
    return path;
  }

  function parseArguments(
    reader: TokenReader,
    bindings?: ReadonlyMap<string, StaticValue>,
  ): readonly StaticValue[] {
    reader.eatOperator("(");
    const args: StaticValue[] = [];
    while (!reader.atOperator(")")) {
      if (reader.peek() === undefined) break;
      // A named argument such as Ruby's `use_ssl:` carries its label first.
      if (reader.peek()?.kind === "name" && reader.atOperator(":", 1)) {
        reader.next();
        reader.next();
      }
      args.push(parseExpression(reader, bindings));
      if (!reader.eatOperator(",")) break;
    }
    reader.eatOperator(")");
    return args;
  }

  function parseList(
    reader: TokenReader,
    bindings?: ReadonlyMap<string, StaticValue>,
  ): StaticValue {
    reader.eatOperator("[");
    const items: StaticValue[] = [];
    while (!reader.atOperator("]")) {
      if (reader.peek() === undefined) break;
      items.push(parseExpression(reader, bindings));
      if (!reader.eatOperator(",")) break;
    }
    reader.eatOperator("]");
    return { kind: "list", items };
  }

  function parseMap(
    reader: TokenReader,
    bindings?: ReadonlyMap<string, StaticValue>,
  ): StaticValue {
    reader.eatOperator("{");
    const entries: StaticEntry[] = [];
    while (!reader.atOperator("}")) {
      if (reader.peek() === undefined) break;
      const field = reader.peek();
      const key: StaticValue | undefined =
        field?.kind === "name" &&
        (reader.atOperator("=", 1) || reader.atOperator(":", 1))
          ? { kind: "identifier", name: field.value }
          : undefined;
      if (key !== undefined) {
        reader.next();
        reader.next();
        entries.push({ key, value: parseExpression(reader, bindings) });
      } else {
        const first = parseExpression(reader, bindings);
        if (reader.eatOperator("=>") || reader.eatOperator(":")) {
          entries.push({
            key: first,
            value: parseExpression(reader, bindings),
          });
        } else {
          entries.push({
            key: { kind: "number", value: entries.length },
            value: first,
          });
        }
      }
      if (!reader.eatOperator(",") && !reader.eatOperator(";")) break;
    }
    reader.eatOperator("}");
    return { kind: "map", entries };
  }

  function skipBalanced(reader: TokenReader): number {
    let depth = 0;
    let end = reader.peek()?.end ?? 0;
    while (true) {
      const token = reader.peek();
      if (token === undefined) break;
      if (token.kind === "op") {
        if ("([{".includes(token.value)) depth += 1;
        else if (")]}".includes(token.value)) {
          if (depth === 0) break;
          depth -= 1;
        } else if (
          depth === 0 &&
          (token.value === "," || token.value === ";")
        ) {
          break;
        }
      }
      end = token.end;
      reader.next();
    }
    return end;
  }

  // Bindings are collected first so later expressions can resolve through them.
  const seen = new Map<string, StaticValue | undefined>();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.kind !== "name") continue;
    const next = tokens[index + 1];
    if (next?.kind !== "op" || next.value !== "=") continue;
    // A binding is either statement-initial or introduced by a keyword.
    const previous = tokens[index - 1];
    const keyword =
      previous?.kind === "name" && bindingKeywords.has(previous.value);
    const startsStatement =
      previous === undefined ||
      keyword ||
      (previous.kind === "op" &&
        (previous.value === ";" ||
          previous.value === "{" ||
          previous.value === "}")) ||
      source.slice(previous.end, token.start).includes("\n");
    if (!startsStatement) continue;
    // `==` and `=>` are not assignments.
    if (tokens[index + 2]?.kind === "op" && tokens[index + 2]?.value === "=")
      continue;
    const reader = new TokenReader(tokens);
    reader.seek(index + 2);
    const value = parseExpression(reader);
    seen.set(token.value, seen.has(token.value) ? undefined : value);
  }
  const bindings = new Map<string, StaticValue>();
  for (const [name, value] of seen)
    if (value !== undefined) bindings.set(name, value);

  const calls: SourceCall[] = [];
  const assignments: SourceAssignment[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.kind !== "name") continue;
    const next = tokens[index + 1];

    if (next?.kind === "op" && next.value === "(") {
      const { path, start } = pathEndingAt(tokens, index);
      const reader = new TokenReader(tokens);
      reader.seek(index + 1);
      calls.push({
        method: token.value,
        path,
        args: parseArguments(reader, bindings),
        start,
      });
      continue;
    }

    // `target.field = value` and `target["key"] = value`.
    if (next?.kind === "op" && (next.value === "." || next.value === "[")) {
      const reader = new TokenReader(tokens);
      reader.seek(index);
      const target = readForwardPath(reader);
      let indexValue: string | undefined;
      if (reader.atOperator("[")) {
        reader.next();
        const key = parseExpression(reader, bindings);
        reader.eatOperator("]");
        if (key.kind === "string") indexValue = key.value;
      }
      if (reader.atOperator("=") && !reader.atOperator("=", 1)) {
        reader.next();
        assignments.push({
          target,
          ...(indexValue === undefined ? {} : { index: indexValue }),
          value: parseExpression(reader, bindings),
          start: token.start,
        });
      }
    }
  }
  return { calls, assignments, bindings, source };
}

/** Replace identifiers with their bound values. */
export function resolveValue(
  value: StaticValue,
  bindings: ReadonlyMap<string, StaticValue>,
  depth = 0,
): StaticValue {
  if (depth > 8) return value;
  if (value.kind === "identifier") {
    const bound = bindings.get(value.name);
    return bound === undefined
      ? value
      : resolveValue(bound, bindings, depth + 1);
  }
  if (value.kind === "list") {
    return {
      kind: "list",
      items: value.items.map((item) => resolveValue(item, bindings, depth + 1)),
    };
  }
  if (value.kind === "map") {
    return {
      kind: "map",
      entries: value.entries.map((entry) => ({
        key: resolveValue(entry.key, bindings, depth + 1),
        value: resolveValue(entry.value, bindings, depth + 1),
      })),
    };
  }
  return value;
}
