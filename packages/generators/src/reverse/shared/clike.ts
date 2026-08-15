import { CodeParseError } from "../types.js";

/**
 * A tokenizer for the C-family languages this project reads back.
 *
 * Go, PHP, Java, C#, and Rust differ in grammar but agree almost entirely on
 * lexical structure: `//` and `/* *\/` comments, double-quoted strings with
 * backslash escapes, and the same operator set. The differences that do exist
 * are narrow enough to express as traits rather than as separate tokenizers.
 */
export interface DialectTraits {
  /** Characters that may start an identifier beyond letters and `_`. */
  readonly identifierPrefixes?: readonly string[];
  /** Quote characters that produce a string with no escape processing. */
  readonly rawStringQuotes?: readonly string[];
  /**
   * Quote characters whose only escapes are the quote itself and a backslash,
   * which is how PHP and Ruby treat single-quoted strings.
   */
  readonly literalStringQuotes?: readonly string[];
  /** Additional line-comment markers, such as PHP's `#`. */
  readonly lineComments?: readonly string[];
}

export type TokenKind = "string" | "number" | "name" | "op";

export interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  /** Decoded text, for string tokens. */
  readonly text?: string;
  readonly start: number;
  readonly end: number;
}

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  n: "\n",
  r: "\r",
  t: "\t",
  b: "\b",
  f: "\f",
  v: "\v",
  "0": "\0",
  "\\": "\\",
  '"': '"',
  "'": "'",
  "`": "`",
  $: "$",
};

/** Multi-character operators, longest first so matching is greedy. */
const OPERATORS: readonly string[] = [
  "...",
  "->",
  "=>",
  "::",
  ":=",
  "==",
  "!=",
  "&&",
  "||",
  "<=",
  ">=",
  "++",
  "--",
  "+=",
  "-=",
  ".",
  ",",
  ";",
  ":",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  "=",
  "+",
  "-",
  "*",
  "/",
  "%",
  "&",
  "|",
  "!",
  "<",
  ">",
  "?",
  "@",
  "#",
  "~",
  "^",
  // PHP separates namespaces with a backslash, as in `GuzzleHttp\Client`.
  "\\",
];

function decodeEscape(
  source: string,
  index: number,
): { readonly text: string; readonly length: number } {
  const next = source[index + 1];
  if (next === undefined) return { text: "\\", length: 1 };
  const simple = SIMPLE_ESCAPES[next];
  if (simple !== undefined) return { text: simple, length: 2 };
  if (next === "x" || next === "u" || next === "U") {
    const width = next === "x" ? 2 : next === "u" ? 4 : 8;
    // Go and Rust also spell a code point as \u{...}.
    if (source[index + 2] === "{") {
      const close = source.indexOf("}", index + 3);
      if (close > 0) {
        const code = Number.parseInt(source.slice(index + 3, close), 16);
        if (Number.isFinite(code) && code <= 0x10ffff) {
          return {
            text: String.fromCodePoint(code),
            length: close - index + 1,
          };
        }
      }
    }
    const digits = source.slice(index + 2, index + 2 + width);
    if (new RegExp(`^[0-9A-Fa-f]{${width}}$`, "u").test(digits)) {
      const code = Number.parseInt(digits, 16);
      if (code <= 0x10ffff) {
        return { text: String.fromCodePoint(code), length: 2 + width };
      }
    }
  }
  // An unrecognised escape keeps the escaped character, which is what every
  // language in this family does in practice.
  return { text: next, length: 2 };
}

export function tokenize(
  source: string,
  traits: DialectTraits = {},
): readonly Token[] {
  const tokens: Token[] = [];
  const identifierPrefixes = new Set(traits.identifierPrefixes ?? []);
  const rawQuotes = new Set(traits.rawStringQuotes ?? []);
  const literalQuotes = new Set(traits.literalStringQuotes ?? []);
  const lineComments = ["//", ...(traits.lineComments ?? [])];

  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (character === undefined) break;

    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }
    const lineComment = lineComments.find((marker) =>
      source.startsWith(marker, index),
    );
    if (lineComment !== undefined) {
      const newline = source.indexOf("\n", index);
      index = newline < 0 ? source.length : newline;
      continue;
    }
    if (source.startsWith("/*", index)) {
      const close = source.indexOf("*/", index + 2);
      index = close < 0 ? source.length : close + 2;
      continue;
    }

    if (rawQuotes.has(character)) {
      const close = source.indexOf(character, index + 1);
      if (close < 0) {
        throw new CodeParseError("Unterminated raw string literal.");
      }
      tokens.push({
        kind: "string",
        value: source.slice(index, close + 1),
        text: source.slice(index + 1, close),
        start: index,
        end: close + 1,
      });
      index = close + 1;
      continue;
    }

    if (character === '"' || literalQuotes.has(character)) {
      const literal = character !== '"';
      let cursor = index + 1;
      let text = "";
      while (cursor < source.length) {
        const current = source[cursor];
        if (current === undefined) break;
        if (current === character) break;
        if (current === "\\") {
          if (literal) {
            // Only the quote and the backslash itself are escapes here.
            const next = source[cursor + 1];
            if (next === character || next === "\\") {
              text += next;
              cursor += 2;
              continue;
            }
            text += "\\";
            cursor += 1;
            continue;
          }
          const escape = decodeEscape(source, cursor);
          text += escape.text;
          cursor += escape.length;
          continue;
        }
        text += current;
        cursor += 1;
      }
      if (source[cursor] !== character) {
        throw new CodeParseError("Unterminated string literal.");
      }
      tokens.push({
        kind: "string",
        value: source.slice(index, cursor + 1),
        text,
        start: index,
        end: cursor + 1,
      });
      index = cursor + 1;
      continue;
    }

    if (/[0-9]/u.test(character)) {
      const match = /^[0-9][0-9_]*(?:\.[0-9_]+)?(?:[eE][+-]?[0-9]+)?/u.exec(
        source.slice(index),
      );
      const value = match?.[0] ?? character;
      tokens.push({
        kind: "number",
        value,
        start: index,
        end: index + value.length,
      });
      index += value.length;
      continue;
    }

    if (/[A-Za-z_]/u.test(character) || identifierPrefixes.has(character)) {
      let cursor = index;
      if (identifierPrefixes.has(character)) cursor += 1;
      while (
        cursor < source.length &&
        /[A-Za-z0-9_]/u.test(source[cursor] ?? "")
      )
        cursor += 1;
      const value = source.slice(index, cursor);
      tokens.push({ kind: "name", value, start: index, end: cursor });
      index = cursor;
      continue;
    }

    const operator = OPERATORS.find((candidate) =>
      source.startsWith(candidate, index),
    );
    if (operator !== undefined) {
      tokens.push({
        kind: "op",
        value: operator,
        start: index,
        end: index + operator.length,
      });
      index += operator.length;
      continue;
    }
    // An unknown character cannot be interpreted; skipping it would silently
    // change the program's meaning.
    throw new CodeParseError(
      `Unexpected character in source: ${JSON.stringify(character)}`,
    );
  }
  return tokens;
}

/** A cursor over a token list, shared by the per-language parsers. */
export class TokenReader {
  private position = 0;

  constructor(readonly tokens: readonly Token[]) {}

  get index(): number {
    return this.position;
  }

  seek(position: number): void {
    this.position = position;
  }

  peek(offset = 0): Token | undefined {
    return this.tokens[this.position + offset];
  }

  next(): Token | undefined {
    const token = this.tokens[this.position];
    this.position += 1;
    return token;
  }

  atOperator(value: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token?.kind === "op" && token.value === value;
  }

  eatOperator(value: string): boolean {
    if (!this.atOperator(value)) return false;
    this.position += 1;
    return true;
  }

  atName(value: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token?.kind === "name" && token.value === value;
  }
}
