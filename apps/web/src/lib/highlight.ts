import type { GeneratorLanguage } from "curltocode";
import { createHighlighter, type Highlighter } from "shiki";

/**
 * Build-time syntax highlighting for the generated example snippets.
 *
 * This runs during the static build only, so it costs the visitor no
 * JavaScript. Both themes are emitted as CSS custom properties rather than
 * concrete colours, because the site resolves light and dark at runtime from
 * `data-theme` *and* `prefers-color-scheme`; a single baked-in palette could
 * not satisfy the system-following state.
 */

const LIGHT_THEME = "github-light";
const DARK_THEME = "github-dark";

/** cURL is rendered as shell, which highlights its flags and quoting. */
const CURL_LANGUAGE = "bash";

const LANGUAGE_GRAMMARS: Record<GeneratorLanguage, string> = {
  javascript: "javascript",
  typescript: "typescript",
  nodejs: "javascript",
  python: "python",
  go: "go",
  php: "php",
  java: "java",
  csharp: "csharp",
  ruby: "ruby",
  rust: "rust",
  kotlin: "kotlin",
  swift: "swift",
  dart: "dart",
  objectivec: "objective-c",
  c: "c",
  cpp: "cpp",
  clojure: "clojure",
  elixir: "elixir",
  perl: "perl",
  r: "r",
  julia: "julia",
  lua: "lua",
  matlab: "matlab",
  ocaml: "ocaml",
  scala: "scala",
  nim: "nim",
  crystal: "crystal",
  // Shiki ships no CFML grammar; cfhttp is tag markup, so HTML is the
  // closest thing that highlights it correctly rather than not at all.
  cfml: "html",
  powershell: "powershell",
  // Shiki ships a grammar for request messages themselves, which highlights the
  // request line and header names rather than treating the block as plain text.
  http: "http",
  // The formats below are not programming languages, so each borrows the
  // grammar of the syntax it is actually written in.
  httpie: "bash",
  wget: "bash",
  har: "json",
  json: "json",
  ansible: "yaml",
  postman: "json",
  k6: "javascript",
};

const GRAMMARS = [CURL_LANGUAGE, ...new Set(Object.values(LANGUAGE_GRAMMARS))];

// One highlighter is shared by every page in a build; loading the grammars per
// page made the build measurably slower for no benefit.
let highlighterPromise: Promise<Highlighter> | undefined;

function highlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({
    themes: [LIGHT_THEME, DARK_THEME],
    langs: GRAMMARS,
  });
  return highlighterPromise;
}

/** Resolve the grammar for a generator target. */
export function grammarFor(language: GeneratorLanguage): string {
  return LANGUAGE_GRAMMARS[language];
}

export { CURL_LANGUAGE };

/**
 * Render `code` as highlighted HTML. The markup is generated from the code we
 * already produced, so it is not attacker-controlled, and Shiki escapes the
 * text content it embeds.
 */
export async function highlight(
  code: string,
  language: string,
): Promise<string> {
  const shiki = await highlighter();
  return shiki.codeToHtml(code, {
    lang: language,
    themes: { light: LIGHT_THEME, dark: DARK_THEME },
    // Emit `--shiki-light` / `--shiki-dark` instead of a resolved colour so the
    // stylesheet can pick a theme without re-rendering.
    defaultColor: false,
    transformers: [
      {
        pre(node) {
          this.addClassToHast(node, "example");
        },
      },
    ],
  });
}
