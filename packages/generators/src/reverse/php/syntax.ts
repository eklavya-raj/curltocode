import { TokenReader, tokenize } from "../shared/clike.js";
import type { Token } from "../shared/clike.js";
import type { StaticEntry, StaticValue } from "../shared/values.js";

/**
 * A reader for the subset of PHP that expresses an HTTP request.
 *
 * This is not a PHP interpreter. It resolves literals, array literals, static
 * concatenation, and variables bound once to a static value. Anything else is
 * reported as unresolved so a limitation can quote it, rather than guessed at.
 */

const PHP_TRAITS = {
  identifierPrefixes: ["$"],
  literalStringQuotes: ["'"],
  lineComments: ["#"],
} as const;

export interface PhpCall {
  /** Dotted or arrow-separated callee, such as `curl_setopt_array`. */
  readonly callee: string;
  /** Receiver variable for a method call, such as `$client`. */
  readonly receiver?: string;
  readonly method?: string;
  readonly args: readonly StaticValue[];
  readonly start: number;
}

const KEYWORD_VALUES: ReadonlyMap<string, StaticValue> = new Map([
  ["true", { kind: "boolean", value: true }],
  ["false", { kind: "boolean", value: false }],
  ["null", { kind: "null" }],
]);

function unresolved(source: string, from: number, to: number): StaticValue {
  return { kind: "unresolved", source: source.slice(from, to).trim() };
}

/** Parse one expression, stopping before `,` `)` `]` `;` or `=>`. */
function parseExpression(
  reader: TokenReader,
  source: string,
  bindings?: ReadonlyMap<string, StaticValue>,
): StaticValue {
  const start = reader.peek()?.start ?? 0;
  let value = parsePrimary(reader, source, bindings);
  // PHP concatenates with `.`. Operands are resolved through their bindings
  // first, so `$base . "/items"` folds when `$base` is a known string.
  while (reader.atOperator(".")) {
    reader.next();
    const right = parsePrimary(reader, source, bindings);
    const left = bindings === undefined ? value : resolve(value, bindings);
    const other = bindings === undefined ? right : resolve(right, bindings);
    if (left.kind === "string" && other.kind === "string") {
      value = { kind: "string", value: left.value + other.value };
      continue;
    }
    const end = reader.peek()?.start ?? source.length;
    return unresolved(source, start, end);
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
  if (reader.atOperator("["))
    return parseArray(reader, source, "[", "]", bindings);
  if (reader.atOperator("-")) {
    // A negative numeric literal.
    const after = reader.peek(1);
    if (after?.kind === "number") {
      reader.next();
      reader.next();
      return { kind: "number", value: -Number(after.value) };
    }
  }
  if (token.kind === "name") {
    const lower = token.value.toLowerCase();
    if (lower === "array" && reader.atOperator("(", 1)) {
      reader.next();
      return parseArray(reader, source, "(", ")", bindings);
    }
    const keyword = KEYWORD_VALUES.get(lower);
    if (keyword !== undefined) {
      reader.next();
      return keyword;
    }
    // A constant, a class name, or a variable. Anything followed by a call or
    // an index is an expression this reader will not evaluate.
    reader.next();
    if (
      reader.atOperator("(") ||
      reader.atOperator("[") ||
      reader.atOperator("->") ||
      reader.atOperator("::")
    ) {
      const end = skipBalanced(reader);
      return unresolved(source, token.start, end);
    }
    return { kind: "identifier", name: token.value };
  }
  // Anything else is an expression shape this reader does not evaluate.
  const end = skipBalanced(reader);
  return unresolved(source, token.start, end);
}

/** Skip forward past a balanced expression, returning the end offset. */
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

function parseArray(
  reader: TokenReader,
  source: string,
  open: string,
  close: string,
  bindings?: ReadonlyMap<string, StaticValue>,
): StaticValue {
  reader.eatOperator(open);
  const entries: StaticEntry[] = [];
  const items: StaticValue[] = [];
  let keyed = false;
  while (!reader.atOperator(close)) {
    if (reader.peek() === undefined) break;
    const first = parseExpression(reader, source, bindings);
    if (reader.eatOperator("=>")) {
      keyed = true;
      entries.push({
        key: first,
        value: parseExpression(reader, source, bindings),
      });
    } else {
      items.push(first);
      entries.push({
        key: { kind: "number", value: items.length - 1 },
        value: first,
      });
    }
    if (!reader.eatOperator(",")) break;
  }
  reader.eatOperator(close);
  return keyed ? { kind: "map", entries } : { kind: "list", items };
}

/**
 * Variables assigned exactly once to a static value.
 *
 * A name assigned more than once is deliberately left out: without following
 * control flow there is no way to know which value reaches the request.
 */
function collectBindings(
  tokens: readonly Token[],
  source: string,
): ReadonlyMap<string, StaticValue> {
  const seen = new Map<string, StaticValue | undefined>();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (
      token?.kind !== "name" ||
      !token.value.startsWith("$") ||
      next?.kind !== "op" ||
      next.value !== "="
    ) {
      continue;
    }
    // Only a statement-initial assignment counts, so an `=` buried inside a
    // larger expression is not mistaken for one. A statement starts after a
    // terminator, after a block brace, or on a fresh line.
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

/** Replace variable references with their bound values, one level deep. */
export function resolve(
  value: StaticValue,
  bindings: ReadonlyMap<string, StaticValue>,
  depth = 0,
): StaticValue {
  if (depth > 8) return value;
  if (value.kind === "identifier" && value.name.startsWith("$")) {
    const bound = bindings.get(value.name);
    return bound === undefined
      ? { kind: "unresolved", source: value.name }
      : resolve(bound, bindings, depth + 1);
  }
  if (value.kind === "list") {
    return {
      kind: "list",
      items: value.items.map((item) => resolve(item, bindings, depth + 1)),
    };
  }
  if (value.kind === "map") {
    return {
      kind: "map",
      entries: value.entries.map((entry) => ({
        key: resolve(entry.key, bindings, depth + 1),
        value: resolve(entry.value, bindings, depth + 1),
      })),
    };
  }
  return value;
}

export interface PhpSource {
  readonly calls: readonly PhpCall[];
  readonly bindings: ReadonlyMap<string, StaticValue>;
}

/** Read every call in the source, with its arguments resolved to values. */
export function readPhp(source: string): PhpSource {
  const tokens = tokenize(source, PHP_TRAITS);
  const bindings = collectBindings(tokens, source);
  const calls: PhpCall[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.kind !== "name") continue;
    const next = tokens[index + 1];

    // `$receiver->method(` and `Class::method(`
    if (
      next?.kind === "op" &&
      (next.value === "->" || next.value === "::") &&
      tokens[index + 2]?.kind === "name" &&
      tokens[index + 3]?.kind === "op" &&
      tokens[index + 3]?.value === "("
    ) {
      const method = tokens[index + 2]?.value ?? "";
      const reader = new TokenReader(tokens);
      reader.seek(index + 3);
      calls.push({
        callee: `${token.value}${next.value}${method}`,
        receiver: token.value,
        method,
        args: parseCallArguments(reader, source, bindings),
        start: token.start,
      });
      continue;
    }

    // A plain function call, or a step in a fluent chain such as
    // `Http::withHeaders([...])->withBody(...)`, whose receiver is the previous
    // call's result rather than a name.
    if (next?.kind === "op" && next.value === "(") {
      const previous = tokens[index - 1];
      const arrow =
        previous?.kind === "op" &&
        (previous.value === "->" || previous.value === "::");
      // A `$receiver->method(` call was already recorded at the receiver, so
      // recording it again here would double every argument it carries.
      if (arrow && tokens[index - 2]?.kind === "name") continue;
      const reader = new TokenReader(tokens);
      reader.seek(index + 1);
      calls.push({
        callee: token.value,
        ...(arrow ? { method: token.value } : {}),
        args: parseCallArguments(reader, source, bindings),
        start: token.start,
      });
    }
  }
  return { calls, bindings };
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
