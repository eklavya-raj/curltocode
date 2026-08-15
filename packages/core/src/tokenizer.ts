import { CurlTokenizeError } from "./errors.js";

export interface ShellToken {
  readonly value: string;
  readonly start: number;
  readonly end: number;
  readonly line: number;
  readonly column: number;
}

type Quote = "single" | "double" | "ansi" | undefined;

/**
 * Single-character escapes recognised inside bash ANSI-C quoting (`$'...'`).
 *
 * Browsers reach for this form whenever a copied header value contains a
 * newline, a single quote, or a non-ASCII character, so a converter that does
 * not decode it silently corrupts real requests.
 */
const ANSI_C_ESCAPES: Readonly<Record<string, string>> = {
  a: "",
  b: "\b",
  e: "",
  E: "",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
  v: "\v",
  "\\": "\\",
  "'": "'",
  '"': '"',
  "?": "?",
};

interface DecodedEscape {
  readonly value: string;
  /** Characters consumed after the leading backslash. */
  readonly length: number;
}

function readRadixEscape(
  input: string,
  start: number,
  radix: 8 | 16,
  maxDigits: number,
): DecodedEscape | undefined {
  const pattern = radix === 8 ? /[0-7]/u : /[0-9A-Fa-f]/u;
  let digits = "";
  while (digits.length < maxDigits) {
    const character = input[start + digits.length];
    if (character === undefined || !pattern.test(character)) break;
    digits += character;
  }
  if (digits.length === 0) return undefined;
  const code = Number.parseInt(digits, radix);
  // Octal and \x escapes address a single byte; the wider \u/\U forms address a
  // code point. Anything above the Unicode range is not representable.
  if (code > 0x10ffff) return undefined;
  return { value: String.fromCodePoint(code), length: digits.length };
}

/**
 * Decode one ANSI-C escape sequence that starts after `backslashIndex`.
 * Returns `undefined` when the sequence is not recognised, in which case bash
 * keeps the backslash literally.
 */
function decodeAnsiEscape(
  input: string,
  backslashIndex: number,
): DecodedEscape | undefined {
  const next = input[backslashIndex + 1];
  if (next === undefined) return undefined;
  const simple = ANSI_C_ESCAPES[next];
  if (simple !== undefined) return { value: simple, length: 1 };
  const start = backslashIndex + 2;
  if (next === "x") {
    const escape = readRadixEscape(input, start, 16, 2);
    return escape === undefined
      ? undefined
      : { value: escape.value, length: escape.length + 1 };
  }
  if (next === "u" || next === "U") {
    const escape = readRadixEscape(input, start, 16, next === "u" ? 4 : 8);
    return escape === undefined
      ? undefined
      : { value: escape.value, length: escape.length + 1 };
  }
  if (/[0-7]/u.test(next)) {
    const escape = readRadixEscape(input, backslashIndex + 1, 8, 3);
    return escape;
  }
  if (next === "c") {
    const controlled = input[start];
    if (controlled === undefined) return undefined;
    // \cX is the control character produced by masking off the upper bits.
    const code = controlled.toUpperCase().codePointAt(0) ?? 0;
    return { value: String.fromCodePoint(code & 0x1f), length: 2 };
  }
  return undefined;
}

function continuationLength(input: string, backslashIndex: number): 0 | 1 | 2 {
  if (input[backslashIndex + 1] === "\n") return 1;
  if (
    input[backslashIndex + 1] === "\r" &&
    input[backslashIndex + 2] === "\n"
  ) {
    return 2;
  }
  return 0;
}

export function tokenizeCurl(input: string): readonly ShellToken[] {
  const tokens: ShellToken[] = [];
  let value = "";
  let quote: Quote;
  let tokenStart = 0;
  let tokenLine = 1;
  let tokenColumn = 1;
  let tokenOpen = false;
  let line = 1;
  let column = 1;

  const openToken = (index: number): void => {
    if (!tokenOpen) {
      tokenOpen = true;
      tokenStart = index;
      tokenLine = line;
      tokenColumn = column;
    }
  };

  const closeToken = (end: number): void => {
    if (tokenOpen) {
      tokens.push({
        value,
        start: tokenStart,
        end,
        line: tokenLine,
        column: tokenColumn,
      });
      value = "";
      tokenOpen = false;
    }
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === undefined) continue;

    if (quote === "single") {
      if (character === "'") quote = undefined;
      else value += character;
    } else if (quote === "ansi") {
      if (character === "'") {
        quote = undefined;
      } else if (character === "\\") {
        const escape = decodeAnsiEscape(input, index);
        if (escape === undefined) {
          // Bash keeps an unrecognised sequence, backslash included.
          value += character;
        } else {
          value += escape.value;
          index += escape.length;
          column += escape.length;
        }
      } else {
        value += character;
      }
    } else if (quote === "double") {
      if (character === '"') {
        quote = undefined;
      } else if (character === "\\") {
        const continuation = continuationLength(input, index);
        if (continuation > 0) {
          index += continuation;
          line += 1;
          column = 1;
          continue;
        }
        const next = input[index + 1];
        if (next === undefined) {
          throw new CurlTokenizeError(
            "CURL_DANGLING_ESCAPE",
            `Dangling escape near line ${line}.`,
            line,
            column,
          );
        }
        if ('"\\$`'.includes(next)) {
          value += next;
          index += 1;
          column += 1;
        } else {
          value += `\\${next}`;
          index += 1;
          column += 1;
        }
      } else {
        value += character;
      }
    } else if (/\s/u.test(character)) {
      closeToken(index);
    } else if (
      character === "$" &&
      (input[index + 1] === "'" || input[index + 1] === '"')
    ) {
      // `$'...'` is ANSI-C quoting and `$"..."` is locale translation, which
      // bash otherwise treats as an ordinary double-quoted string.
      openToken(index);
      quote = input[index + 1] === "'" ? "ansi" : "double";
      index += 1;
      column += 1;
    } else if (character === "'") {
      openToken(index);
      quote = "single";
    } else if (character === '"') {
      openToken(index);
      quote = "double";
    } else if (character === "\\") {
      const continuation = continuationLength(input, index);
      if (continuation > 0) {
        index += continuation;
        line += 1;
        column = 1;
        continue;
      }
      const next = input[index + 1];
      if (next === undefined) {
        throw new CurlTokenizeError(
          "CURL_DANGLING_ESCAPE",
          `Dangling escape near line ${line}.`,
          line,
          column,
        );
      }
      index += 1;
      column += 1;
      openToken(index - 1);
      value += next;
    } else {
      openToken(index);
      value += character;
    }

    if (character === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }

  if (quote !== undefined) {
    throw new CurlTokenizeError(
      "CURL_UNCLOSED_QUOTE",
      `Unclosed ${quote === "double" ? "double" : "single"} quote near line ${tokenLine}.`,
      tokenLine,
      tokenColumn,
    );
  }
  closeToken(input.length);
  return tokens;
}
