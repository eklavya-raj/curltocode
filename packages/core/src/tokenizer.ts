import { CurlTokenizeError } from "./errors.js";

export interface ShellToken {
  readonly value: string;
  readonly start: number;
  readonly end: number;
  readonly line: number;
  readonly column: number;
}

type Quote = "single" | "double" | undefined;

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
      `Unclosed ${quote} quote near line ${tokenLine}.`,
      tokenLine,
      tokenColumn,
    );
  }
  closeToken(input.length);
  return tokens;
}
