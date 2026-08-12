/**
 * Shared source-literal escaping for the compiled-language generators.
 *
 * Iteration is by code point rather than UTF-16 code unit so that non-BMP
 * characters are emitted as whole characters. Emitting them literally is
 * correct because every target language reads UTF-8 source, and it avoids the
 * lone-surrogate escapes that `JSON.stringify` would otherwise produce.
 */
export interface LiteralOptions {
  readonly quote: string;
  /** Literal character replacements applied before any control-code handling. */
  readonly escapes: Readonly<Record<string, string>>;
  /** Escape for C0 control characters and DEL. */
  readonly controlEscape: (code: number) => string;
}

export function stringLiteral(value: string, options: LiteralOptions): string {
  let result = options.quote;
  for (const character of value) {
    const replacement = options.escapes[character];
    if (replacement !== undefined) {
      result += replacement;
      continue;
    }
    const code = character.codePointAt(0) ?? 0;
    result +=
      code < 0x20 || code === 0x7f ? options.controlEscape(code) : character;
  }
  return result + options.quote;
}

const hex2 = (code: number): string =>
  code.toString(16).padStart(2, "0").toUpperCase();

const C_LIKE_ESCAPES: Readonly<Record<string, string>> = {
  "\\": "\\\\",
  '"': '\\"',
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
};

/** Go, Java, C#, and Rust share C-style double-quoted literal syntax. */
export function goString(value: string): string {
  return stringLiteral(value, {
    quote: '"',
    escapes: C_LIKE_ESCAPES,
    controlEscape: (code) => `\\x${hex2(code)}`,
  });
}

export function javaString(value: string): string {
  return stringLiteral(value, {
    quote: '"',
    escapes: C_LIKE_ESCAPES,
    controlEscape: (code) => `\\u${code.toString(16).padStart(4, "0")}`,
  });
}

export function csharpString(value: string): string {
  return stringLiteral(value, {
    quote: '"',
    escapes: C_LIKE_ESCAPES,
    controlEscape: (code) => `\\u${code.toString(16).padStart(4, "0")}`,
  });
}

export function rustString(value: string): string {
  return stringLiteral(value, {
    quote: '"',
    escapes: C_LIKE_ESCAPES,
    // Rust requires the braced form for its unicode escape.
    controlEscape: (code) => `\\u{${code.toString(16)}}`,
  });
}

/**
 * PHP double-quoted strings interpolate `$`, so it must be escaped alongside
 * the usual characters.
 */
export function phpString(value: string): string {
  return stringLiteral(value, {
    quote: '"',
    escapes: { ...C_LIKE_ESCAPES, $: "\\$" },
    controlEscape: (code) => `\\x${hex2(code)}`,
  });
}

/**
 * Ruby double-quoted strings interpolate `#{...}`, so `#` is escaped to keep
 * an adjacent brace from starting an interpolation.
 */
export function rubyString(value: string): string {
  return stringLiteral(value, {
    quote: '"',
    escapes: { ...C_LIKE_ESCAPES, "#": "\\#" },
    controlEscape: (code) => `\\x${hex2(code)}`,
  });
}
