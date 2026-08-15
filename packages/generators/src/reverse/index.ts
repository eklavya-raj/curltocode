import { parseJavaScriptRequest } from "./javascript.js";
import { parseGoRequest } from "./go/index.js";
import { parsePhpRequest } from "./php/index.js";
import { parsePythonRequest } from "./python/index.js";
import { CodeParseError } from "./types.js";
import type { ReverseLanguage, ReverseParseResult } from "./types.js";

export * from "./javascript.js";
export * from "./types.js";
export { parsePythonRequest } from "./python/index.js";
export { parsePhpRequest } from "./php/index.js";
export { parseGoRequest } from "./go/index.js";

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
  // PHP is checked first: its markers are unambiguous, and a `<?php` file can
  // otherwise trip the generic JavaScript keyword heuristic.
  const php =
    /<\?php/u.test(source) ||
    /\bcurl_(?:init|setopt|setopt_array|exec)\s*\(/u.test(source) ||
    /\bGuzzleHttp\\/u.test(source) ||
    /\$\w+\s*->\s*(?:request|get|post|put|patch|delete)\s*\(/u.test(source);
  if (php) return "php";

  // Go's package clause and := binding are unambiguous markers.
  const go =
    /^\s*package\s+\w+/mu.test(source) ||
    /\bhttp\.NewRequest(?:WithContext)?\s*\(/u.test(source) ||
    /\bresty\.New\s*\(/u.test(source);
  if (go) return "go";

  const python =
    /^\s*(?:import|from)\s+(?:requests|httpx|aiohttp)\b/mu.test(source) ||
    /\b(?:requests|httpx|aiohttp)\.[A-Za-z_]/u.test(source);
  if (python) return "python";

  const javascript =
    /\bfetch\s*\(/u.test(source) ||
    /\baxios\b/u.test(source) ||
    /\bundici\b/u.test(source) ||
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
      "No supported request was found. Reverse conversion currently reads JavaScript and TypeScript (Fetch, Axios, Undici), Python (Requests, HTTPX, aiohttp), PHP (cURL extension, Guzzle), and Go (net/http, Resty).",
    );
  }
  if (resolved === "php") return parsePhpRequest(source);
  if (resolved === "go") return parseGoRequest(source);
  return resolved === "python"
    ? parsePythonRequest(source)
    : parseJavaScriptRequest(source);
}
