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

/**
 * Kotlin string templates expand `$name` and `${expr}`, so a literal dollar
 * sign has to be escaped or the compiler reads the next identifier as a
 * template reference.
 */
export function kotlinString(value: string): string {
  return stringLiteral(value, {
    quote: '"',
    escapes: { ...C_LIKE_ESCAPES, $: "\\$" },
    controlEscape: (code) => `\\u${code.toString(16).padStart(4, "0")}`,
  });
}

/**
 * Swift interpolates with `\(...)`. Escaping the backslash already prevents an
 * interpolation from forming, so only the usual characters need handling.
 */
export function swiftString(value: string): string {
  return stringLiteral(value, {
    quote: '"',
    escapes: { ...C_LIKE_ESCAPES, "\0": "\\0" },
    controlEscape: (code) => `\\u{${code.toString(16)}}`,
  });
}

/**
 * Dart string literals are written with single quotes by convention and
 * interpolate `$`, so both the quote and the dollar sign are escaped.
 */
export function dartString(value: string): string {
  return stringLiteral(value, {
    quote: "'",
    escapes: {
      "\\": "\\\\",
      "'": "\\'",
      "\n": "\\n",
      "\r": "\\r",
      "\t": "\\t",
      $: "\\$",
    },
    controlEscape: (code) => `\\u{${code.toString(16)}}`,
  });
}

/**
 * Plain C string literals, shared by C, C++, and Objective-C.
 *
 * `\x` in C consumes every hex digit that follows it and would silently absorb
 * an adjacent character, so the three-digit octal form is used instead: it has
 * a fixed length and cannot run on.
 */
export function cString(value: string): string {
  return stringLiteral(value, {
    quote: '"',
    escapes: C_LIKE_ESCAPES,
    controlEscape: (code) => `\\${code.toString(8).padStart(3, "0")}`,
  });
}

/**
 * Python string literals accept the JSON escape set, and Python 3 source is
 * UTF-8, so non-ASCII text is emitted as characters rather than escapes.
 */
export function pythonString(value: string): string {
  return stringLiteral(value, {
    quote: '"',
    escapes: C_LIKE_ESCAPES,
    controlEscape: (code) => `\\x${hex2(code)}`,
  });
}

/** Clojure strings take the Java escape set. */
export function clojureString(value: string): string {
  return javaString(value);
}

/** Elixir strings interpolate `#{...}`, exactly as Ruby's do. */
export function elixirString(value: string): string {
  return rubyString(value);
}

/**
 * Perl prefers single quotes for literal data, and so does this generator: a
 * single-quoted string interpolates nothing, so `$` and `@` — both common
 * inside passwords and tokens — stay as themselves rather than being escaped
 * into something a reader has to decode.
 *
 * A value carrying a control character other than a newline or tab cannot be
 * written that way, because single quotes have no escape for one. Those fall
 * back to the double-quoted form, where both sigils do have to be escaped.
 */
export function perlString(value: string): string {
  const needsDoubleQuotes = Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return (
      (code < 0x20 && character !== "\n" && character !== "\t") || code === 0x7f
    );
  });
  if (!needsDoubleQuotes) {
    return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
  }
  return stringLiteral(value, {
    quote: '"',
    escapes: { ...C_LIKE_ESCAPES, $: "\\$", "@": "\\@" },
    // The braced hex form has an explicit end, unlike bare `\x41`.
    controlEscape: (code) => `\\x{${code.toString(16)}}`,
  });
}

/** R strings take the C escape set with a four-digit unicode escape. */
export function rString(value: string): string {
  return javaString(value);
}

/** Julia strings interpolate `$name`, and `\u` takes up to four hex digits. */
export function juliaString(value: string): string {
  return stringLiteral(value, {
    quote: '"',
    escapes: { ...C_LIKE_ESCAPES, $: "\\$" },
    controlEscape: (code) => `\\u${code.toString(16).padStart(4, "0")}`,
  });
}

/**
 * Lua's `\xHH` escape arrived in 5.2, while the three-digit decimal form works
 * in every version, so that is what is emitted.
 */
export function luaString(value: string): string {
  return stringLiteral(value, {
    quote: '"',
    escapes: C_LIKE_ESCAPES,
    controlEscape: (code) => `\\${code.toString(10).padStart(3, "0")}`,
  });
}

/** OCaml strings use decimal escapes of exactly three digits. */
export function ocamlString(value: string): string {
  return stringLiteral(value, {
    quote: '"',
    escapes: C_LIKE_ESCAPES,
    controlEscape: (code) => `\\${code.toString(10).padStart(3, "0")}`,
  });
}

/** Nim's `\xHH` takes exactly two hex digits, so it cannot run on. */
export function nimString(value: string): string {
  return stringLiteral(value, {
    quote: '"',
    escapes: C_LIKE_ESCAPES,
    controlEscape: (code) => `\\x${hex2(code)}`,
  });
}

/**
 * MATLAB character arrays have no escape sequences at all and cannot span
 * lines: `'it''s'` is the only escape there is. A value carrying a control
 * character therefore has to go through `sprintf`, which does interpret
 * escapes — and there `%` and `\` become significant in turn.
 */
export function matlabString(value: string): string {
  const quoted = (text: string): string => `'${text.replaceAll("'", "''")}'`;
  const needsFormat = Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f;
  });
  if (!needsFormat) return quoted(value);
  const escaped = Array.from(value)
    .map((character) => {
      if (character === "\\") return "\\\\";
      if (character === "%") return "%%";
      if (character === "\n") return "\\n";
      if (character === "\r") return "\\r";
      if (character === "\t") return "\\t";
      const code = character.codePointAt(0) ?? 0;
      return code < 0x20 || code === 0x7f
        ? `\\${code.toString(8).padStart(3, "0")}`
        : character;
    })
    .join("");
  return `sprintf(${quoted(escaped)})`;
}

/**
 * A value written into a CFML tag attribute.
 *
 * CFML tags are not XML, so `&`, `<`, and `>` carry no meaning here and must be
 * left alone — entity-encoding an ampersand would corrupt every query string
 * with more than one parameter. Only two characters are significant: the
 * delimiting quote, which is doubled, and `#`, which starts an expression
 * unless it is doubled too.
 */
export function cfmlAttribute(value: string): string {
  return `"${value.replaceAll('"', '""').replaceAll("#", "##")}"`;
}
