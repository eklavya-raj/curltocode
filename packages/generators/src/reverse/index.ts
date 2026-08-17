import { parseJavaScriptRequest } from "./javascript.js";
import { parseGoRequest } from "./go/index.js";
import { looksLikeHttpMessage, parseHttpMessageRequest } from "./http/index.js";
import { parseCsharpRequest } from "./csharp/index.js";
import { parseRubyRequest } from "./ruby/index.js";
import { parseRustRequest } from "./rust/index.js";
import { parseJavaRequest } from "./java/index.js";
import { parsePhpRequest } from "./php/index.js";
import { parsePythonRequest } from "./python/index.js";
import { CodeParseError } from "./types.js";
import type { ReverseLanguage, ReverseParseResult } from "./types.js";

export * from "./javascript.js";
export * from "./types.js";
export { parsePythonRequest } from "./python/index.js";
export { parsePhpRequest } from "./php/index.js";
export { parseGoRequest } from "./go/index.js";
export { parseJavaRequest } from "./java/index.js";
export { parseCsharpRequest } from "./csharp/index.js";
export { parseRubyRequest } from "./ruby/index.js";
export { parseRustRequest } from "./rust/index.js";
export { looksLikeHttpMessage, parseHttpMessageRequest } from "./http/index.js";

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
  // A request line is checked before any language, because it is the one shape
  // here that is decided by a grammar rather than by a heuristic: nothing else
  // opens with a method, a target, and an HTTP version.
  if (looksLikeHttpMessage(source)) return "http";

  // PHP is checked first among the languages: its markers are unambiguous, and
  // a `<?php` file can otherwise trip the generic JavaScript keyword heuristic.
  const php =
    /<\?php/u.test(source) ||
    /\bcurl_(?:init|setopt|setopt_array|exec)\s*\(/u.test(source) ||
    /\bGuzzleHttp\\/u.test(source) ||
    /\$\w+\s*->\s*(?:request|get|post|put|patch|delete)\s*\(/u.test(source);
  if (php) return "php";

  // Rust and Ruby carry markers no other language here uses.
  const rust =
    /^\s*use\s+(?:reqwest|ureq|std)\b/mu.test(source) ||
    /\bfn\s+main\s*\(/u.test(source) ||
    /\breqwest::|\bureq::/u.test(source);
  if (rust) return "rust";

  const ruby =
    /^\s*require\s+["']/mu.test(source) ||
    /\bNet::HTTP\b/u.test(source) ||
    /\bFaraday\b/u.test(source);
  if (ruby) return "ruby";

  // C# is checked before Java: both use braces and PascalCase, but these
  // markers belong to neither the JVM nor any other language here.
  const csharp =
    /^\s*using\s+System\b/mu.test(source) ||
    /\bHttpRequestMessage\b/u.test(source) ||
    /\bRestSharp\b|\bRestRequest\b/u.test(source) ||
    /\bConsole\.WriteLine\b/u.test(source);
  if (csharp) return "csharp";

  // Java's class declaration and package imports are unambiguous.
  const java =
    /^\s*import\s+(?:java|okhttp3|org\.apache\.hc)\b/mu.test(source) ||
    /\bpublic\s+class\b/u.test(source) ||
    /\bHttpRequest\.newBuilder\s*\(/u.test(source) ||
    /\bnew\s+Request\.Builder\s*\(/u.test(source);
  if (java) return "java";

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
      "No supported request was found. Reverse conversion currently reads JavaScript and TypeScript (Fetch, Axios, Undici), Python (Requests, HTTPX, aiohttp), PHP (cURL extension, Guzzle), Go (net/http, Resty), Java (HttpClient, OkHttp, Apache), C# (HttpClient, RestSharp), Ruby (Net::HTTP, Faraday), Rust (reqwest, ureq), and raw HTTP/1.1 request messages.",
    );
  }
  if (resolved === "http") return parseHttpMessageRequest(source);
  if (resolved === "php") return parsePhpRequest(source);
  if (resolved === "go") return parseGoRequest(source);
  if (resolved === "java") return parseJavaRequest(source);
  if (resolved === "csharp") return parseCsharpRequest(source);
  if (resolved === "ruby") return parseRubyRequest(source);
  if (resolved === "rust") return parseRustRequest(source);
  return resolved === "python"
    ? parsePythonRequest(source)
    : parseJavaScriptRequest(source);
}
