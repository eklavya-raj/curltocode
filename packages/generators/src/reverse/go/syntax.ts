import { TokenReader, tokenize } from "../shared/clike.js";
import type { Token } from "../shared/clike.js";
import type { StaticValue } from "../shared/values.js";

/**
 * A reader for the subset of Go that expresses an HTTP request.
 *
 * Go builds a request across statements rather than in one expression, so the
 * reader collects every call in order together with the variables bound to a
 * static value. Nothing is evaluated: a value that is not a literal, a known
 * body constructor, or a once-bound variable is reported as unresolved.
 */

const GO_TRAITS = {
  // Go's raw string literals are backquoted and process no escapes.
  rawStringQuotes: ["`"],
} as const;

export interface GoCall {
  /** Dotted callee, such as `http.NewRequest` or `req.Header.Add`. */
  readonly callee: string;
  readonly args: readonly StaticValue[];
  readonly start: number;
}

/**
 * Calls that wrap a payload for the request body. Each takes the payload as
 * its only meaningful argument, so reading through them yields the bytes.
 */
const BODY_WRAPPERS = new Set([
  "strings.NewReader",
  "bytes.NewBufferString",
  "bytes.NewBuffer",
  "bytes.NewReader",
  "[]byte",
]);

function unresolved(source: string, from: number, to: number): StaticValue {
  return { kind: "unresolved", source: source.slice(from, to).trim() };
}

/** Read a dotted path such as `req.Header.Add`, starting at a name token. */
function readDottedName(
  tokens: readonly Token[],
  index: number,
): { readonly name: string; readonly next: number } | undefined {
  const first = tokens[index];
  if (first?.kind !== "name") return undefined;
  let name = first.value;
  let cursor = index + 1;
  while (
    tokens[cursor]?.kind === "op" &&
    tokens[cursor]?.value === "." &&
    tokens[cursor + 1]?.kind === "name"
  ) {
    name += `.${tokens[cursor + 1]?.value ?? ""}`;
    cursor += 2;
  }
  return { name, next: cursor };
}

function parseExpression(
  reader: TokenReader,
  source: string,
  bindings?: ReadonlyMap<string, StaticValue>,
): StaticValue {
  const start = reader.peek()?.start ?? 0;
  let value = parsePrimary(reader, source, bindings);
  // Go concatenates strings with `+`. Operands are resolved through their
  // bindings first, so `base + "/items"` folds when `base` is a known string.
  while (reader.atOperator("+")) {
    reader.next();
    const right = parsePrimary(reader, source, bindings);
    const left = bindings === undefined ? value : resolve(value, bindings);
    const other = bindings === undefined ? right : resolve(right, bindings);
    if (left.kind === "string" && other.kind === "string") {
      value = { kind: "string", value: left.value + other.value };
      continue;
    }
    return unresolved(source, start, reader.peek()?.start ?? source.length);
  }
  return value;
}

function parsePrimary(
  reader: TokenReader,
  source: string,
  bindings?: ReadonlyMap<string, StaticValue>,
): StaticValue {
  const token = reader.peek();
  if (token === undefined) return { kind: "unresolved", source: "" };

  if (token.kind === "string") {
    reader.next();
    return { kind: "string", value: token.text ?? "" };
  }
  if (token.kind === "number") {
    reader.next();
    return { kind: "number", value: Number(token.value.replaceAll("_", "")) };
  }
  // `&value` takes an address, which does not change the value itself.
  if (reader.atOperator("&")) {
    reader.next();
    return parsePrimary(reader, source, bindings);
  }
  if (reader.atOperator("[") && reader.atOperator("]", 1)) {
    const after = reader.peek(2);
    // A `[]byte(...)` conversion reads as its argument.
    if (after?.kind === "name" && after.value === "byte") {
      reader.next();
      reader.next();
      reader.next();
      if (reader.eatOperator("(")) {
        const inner = parseExpression(reader, source, bindings);
        reader.eatOperator(")");
        return inner;
      }
    }
    // A slice literal such as `[]string{"a", "b"}`.
    if (after?.kind === "name" && reader.atOperator("{", 3)) {
      reader.next();
      reader.next();
      reader.next();
      return parseCompositeLiteral(reader, source, false, bindings);
    }
  }
  if (token.kind === "name") {
    const dotted = readDottedName(reader.tokens, reader.index);
    if (dotted === undefined) {
      reader.next();
      return { kind: "identifier", name: token.value };
    }
    const afterName = reader.tokens[dotted.next];
    const isCall = afterName?.kind === "op" && afterName.value === "(";
    // A composite literal such as `http.Cookie{Name: "s", Value: "1"}`.
    if (afterName?.kind === "op" && afterName.value === "{") {
      reader.seek(dotted.next + 1);
      return parseCompositeLiteral(reader, source, true, bindings);
    }
    if (!isCall) {
      reader.seek(dotted.next);
      if (dotted.name === "nil") return { kind: "null" };
      if (dotted.name === "true") return { kind: "boolean", value: true };
      if (dotted.name === "false") return { kind: "boolean", value: false };
      return { kind: "identifier", name: dotted.name };
    }
    reader.seek(dotted.next);
    if (BODY_WRAPPERS.has(dotted.name)) {
      // Reading through the wrapper yields the payload it carries.
      reader.eatOperator("(");
      const inner = parseExpression(reader, source, bindings);
      reader.eatOperator(")");
      return inner;
    }
    const end = skipBalanced(reader);
    return unresolved(source, token.start, end);
  }
  const end = skipBalanced(reader);
  return unresolved(source, token.start, end);
}

/**
 * Read the body of a composite literal, the brace already consumed.
 *
 * Go writes both keyed structs (`http.Cookie{Name: "s"}`) and plain slices
 * (`[]string{"a"}`) this way, so the shape is decided by whether the first
 * element carries a field name.
 */
function parseCompositeLiteral(
  reader: TokenReader,
  source: string,
  braceConsumed = false,
  bindings?: ReadonlyMap<string, StaticValue>,
): StaticValue {
  if (!braceConsumed) reader.eatOperator("{");
  const entries: { key: StaticValue; value: StaticValue }[] = [];
  const items: StaticValue[] = [];
  let keyed = false;
  while (!reader.atOperator("}")) {
    if (reader.peek() === undefined) break;
    const field = reader.peek();
    if (field?.kind === "name" && reader.atOperator(":", 1)) {
      keyed = true;
      reader.next();
      reader.next();
      entries.push({
        key: { kind: "identifier", name: field.value },
        value: parseExpression(reader, source, bindings),
      });
    } else {
      items.push(parseExpression(reader, source, bindings));
    }
    if (!reader.eatOperator(",")) break;
  }
  reader.eatOperator("}");
  return keyed ? { kind: "map", entries } : { kind: "list", items };
}

/** Skip a balanced expression, returning its end offset. */
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
      } else if (depth === 0 && (token.value === "," || token.value === ";")) {
        break;
      }
    }
    end = token.end;
    reader.next();
  }
  return end;
}

function parseCallArguments(
  reader: TokenReader,
  source: string,
  bindings?: ReadonlyMap<string, StaticValue>,
): readonly StaticValue[] {
  reader.eatOperator("(");
  const args: StaticValue[] = [];
  while (!reader.atOperator(")")) {
    if (reader.peek() === undefined) break;
    args.push(parseExpression(reader, source, bindings));
    if (!reader.eatOperator(",")) break;
  }
  reader.eatOperator(")");
  return args;
}

/**
 * Variables assigned exactly once, through either `:=` or `=`.
 *
 * A name assigned more than once is left out: without following control flow
 * there is no way to know which value reaches the request.
 */
function collectBindings(
  tokens: readonly Token[],
  source: string,
): ReadonlyMap<string, StaticValue> {
  const seen = new Map<string, StaticValue | undefined>();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (token?.kind !== "name" || next?.kind !== "op") continue;
    if (next.value !== ":=" && next.value !== "=") continue;
    // Go statements end at a newline, so a binding starts one.
    const previous = tokens[index - 1];
    const startsStatement =
      previous === undefined ||
      (previous.kind === "op" &&
        (previous.value === ";" ||
          previous.value === "{" ||
          previous.value === "}")) ||
      source.slice(previous.end, token.start).includes("\n");
    if (!startsStatement) continue;
    const reader = new TokenReader(tokens);
    reader.seek(index + 2);
    const value = parseExpression(reader, source);
    seen.set(token.value, seen.has(token.value) ? undefined : value);
  }
  const bindings = new Map<string, StaticValue>();
  for (const [name, value] of seen)
    if (value !== undefined) bindings.set(name, value);
  return bindings;
}

export function resolve(
  value: StaticValue,
  bindings: ReadonlyMap<string, StaticValue>,
  depth = 0,
): StaticValue {
  if (depth > 8) return value;
  if (value.kind === "identifier") {
    const bound = bindings.get(value.name);
    if (bound !== undefined) return resolve(bound, bindings, depth + 1);
    return value;
  }
  if (value.kind === "list") {
    return {
      kind: "list",
      items: value.items.map((item) => resolve(item, bindings, depth + 1)),
    };
  }
  return value;
}

export interface GoSource {
  readonly calls: readonly GoCall[];
  readonly bindings: ReadonlyMap<string, StaticValue>;
  readonly source: string;
}

export function readGo(source: string): GoSource {
  const tokens = tokenize(source, GO_TRAITS);
  const bindings = collectBindings(tokens, source);
  const calls: GoCall[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.kind !== "name") continue;
    const dotted = readDottedName(tokens, index);
    if (dotted === undefined) continue;
    const after = tokens[dotted.next];
    if (after?.kind !== "op" || after.value !== "(") continue;
    const reader = new TokenReader(tokens);
    reader.seek(dotted.next);
    calls.push({
      callee: dotted.name,
      args: parseCallArguments(reader, source, bindings),
      start: token.start,
    });
    // Continue past the name so its segments are not re-read as new calls.
    index = dotted.next;
  }
  return { calls, bindings, source };
}
