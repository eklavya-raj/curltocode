import { parseJavaScriptRequest } from "./javascript.js";
import { parsePythonRequest } from "./python/index.js";
import { CodeParseError } from "./types.js";
import type { ReverseLanguage, ReverseParseResult } from "./types.js";

export * from "./javascript.js";
export * from "./types.js";
export { parsePythonRequest } from "./python/index.js";

/**
 * Pick a parser from the source itself.
 *
 * Detection looks for the import or call shapes each ecosystem actually uses,
 * rather than trying to classify the language in general. A snippet that
 * matches neither is reported as unsupported instead of being fed to a parser
 * that would produce a confusing syntax error.
 */
export function detectReverseLanguage(
  source: string,
): ReverseLanguage | undefined {
  const python =
    /^\s*(?:import|from)\s+(?:requests|httpx|aiohttp)\b/mu.test(source) ||
    /\b(?:requests|httpx|aiohttp)\.[A-Za-z_]/u.test(source);
  if (python) return "python";

  const javascript =
    /\bfetch\s*\(/u.test(source) ||
    /\baxios\b/u.test(source) ||
    /\b(?:const|let|var|import|await|function)\b/u.test(source);
  if (javascript) return "javascript";

  return undefined;
}

/**
 * Parse a code snippet in any supported language back into a request.
 *
 * When a language is given, that parser is used and its errors surface
 * directly. Without one, the language is detected first so the caller does not
 * have to choose.
 */
export function parseCodeRequest(
  source: string,
  language?: ReverseLanguage,
): ReverseParseResult {
  const resolved = language ?? detectReverseLanguage(source);
  if (resolved === undefined) {
    throw new CodeParseError(
      "No supported request was found. Reverse conversion currently reads JavaScript and TypeScript (Fetch, Axios) and Python (Requests, HTTPX, aiohttp).",
    );
  }
  return resolved === "python"
    ? parsePythonRequest(source)
    : parseJavaScriptRequest(source);
}
