import {
  parseHttpieRequest,
  parseWgetRequest,
  looksLikeHttpie,
  looksLikeWget,
} from "./cli/index.js";
import {
  looksLikeInterchangeDocument,
  parseHarRequest,
  parseJsonDocumentRequest,
  parsePostmanRequest,
} from "./interchange/index.js";
import { parseJavaScriptRequest } from "./javascript.js";
import {
  looksLikePowerShell,
  parsePowerShellRequest,
} from "./powershell/index.js";

/** True when the source is a syntactically valid JSON object. */
function looksLikeJsonObject(source: string): boolean {
  try {
    const parsed: unknown = JSON.parse(source);
    return (
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    );
  } catch {
    return false;
  }
}
import { parseGoRequest } from "./go/index.js";
import { looksLikeHttpMessage, parseHttpMessageRequest } from "./http/index.js";
import { parseCsharpRequest } from "./csharp/index.js";
import { parseRubyRequest } from "./ruby/index.js";
import { parseRustRequest } from "./rust/index.js";
import { parseJavaRequest } from "./java/index.js";
import { parseKotlinRequest } from "./kotlin/index.js";
import { parseSwiftRequest } from "./swift/index.js";
import { parseDartRequest } from "./dart/index.js";
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
export { parseKotlinRequest } from "./kotlin/index.js";
export { parseSwiftRequest } from "./swift/index.js";
export { parseDartRequest } from "./dart/index.js";
export { parseCsharpRequest } from "./csharp/index.js";
export { parseRubyRequest } from "./ruby/index.js";
export { parseRustRequest } from "./rust/index.js";
export { looksLikeHttpMessage, parseHttpMessageRequest } from "./http/index.js";
export {
  looksLikeHttpie,
  looksLikeWget,
  parseHttpieRequest,
  parseWgetRequest,
} from "./cli/index.js";
export {
  interchangeFormat,
  listInterchangeRequests,
  looksLikeInterchangeDocument,
  parseHarRequest,
  parseJsonDocumentRequest,
  parsePostmanRequest,
} from "./interchange/index.js";
export type {
  InterchangeEntry,
  InterchangeFormat,
} from "./interchange/index.js";
export {
  looksLikePowerShell,
  parsePowerShellRequest,
} from "./powershell/index.js";

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
  // The interchange formats are checked first: a JSON document identifies
  // itself by structure, which is proof rather than a heuristic.
  const interchange = looksLikeInterchangeDocument(source);
  if (interchange !== undefined) return interchange;
  // A JSON object that matches none of the three still routes here, so the
  // reader is told what each format is identified by rather than being handed
  // the generic "no supported request" message.
  if (/^\s*\{/u.test(source) && looksLikeJsonObject(source)) return "json";

  // A request line comes next for the same reason — nothing else opens with a
  // method, a target, and an HTTP version.
  if (looksLikeHttpMessage(source)) return "http";

  // The two command lines name their program as the first word.
  if (looksLikeHttpie(source)) return "httpie";
  if (looksLikeWget(source)) return "wget";

  // A PowerShell script is identified by the cmdlet it calls, which no other
  // language here uses.
  if (looksLikePowerShell(source)) return "powershell";

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

  // Dart names its packages in the import line, which nothing else here does.
  const dart =
    /^\s*import\s+["']package:(?:http|dio)\b/mu.test(source) ||
    /\bhttp\.(?:Request|MultipartRequest)\s*\(/u.test(source) ||
    /\bDio\s*\(\s*\)/u.test(source);
  if (dart) return "dart";

  // Swift is identified by Foundation's request type and by Alamofire, neither
  // of which appears in another language here.
  const swift =
    /^\s*import\s+(?:Foundation|Alamofire)\b/mu.test(source) ||
    /\bURLRequest\s*\(/u.test(source) ||
    /\bAF\.(?:request|upload)\s*\(/u.test(source);
  if (swift) return "swift";

  // Kotlin is checked before Java: `val`, a trailing lambda, and the Ktor and
  // OkHttp Kotlin extensions belong to no other language here.
  const kotlin =
    /^\s*import\s+io\.ktor\b/mu.test(source) ||
    /\btoRequestBody\s*\(|\btoMediaType\s*\(/u.test(source) ||
    /\bHttpClient\s*\(\s*CIO\s*\)/u.test(source) ||
    /^\s*val\s+\w+\s*=/mu.test(source);
  if (kotlin) return "kotlin";

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
    /^\s*(?:import|from)\s+(?:requests|httpx|aiohttp|urllib3)\b/mu.test(
      source,
    ) ||
    /\b(?:requests|httpx|aiohttp|urllib3)\.[A-Za-z_]/u.test(source) ||
    // The standard library client names itself in both the import and the use.
    /\bhttp\.client\b/u.test(source);
  if (python) return "python";

  const javascript =
    /\bfetch\s*\(/u.test(source) ||
    /\baxios\b/u.test(source) ||
    /\bundici\b/u.test(source) ||
    // jQuery and XMLHttpRequest snippets can contain none of the declaration
    // keywords below, so each is named outright.
    /\bXMLHttpRequest\b/u.test(source) ||
    /(?:\$|jQuery)\s*\.\s*ajax\s*\(/u.test(source) ||
    /\b(?:got|ky|superagent)\b/u.test(source) ||
    /\bnode:https?\b/u.test(source) ||
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
      "No supported request was found. Reverse conversion currently reads JavaScript and TypeScript (Fetch, Axios, Undici, jQuery, XMLHttpRequest), Node.js (Fetch, Axios, Got, Ky, SuperAgent, node:https), Python (Requests, HTTPX, aiohttp), PHP (cURL extension, Guzzle), Go (net/http, Resty), Java (HttpClient, OkHttp, Apache), C# (HttpClient, RestSharp), Ruby (Net::HTTP, Faraday), Rust (reqwest, ureq), PowerShell (Invoke-RestMethod, Invoke-WebRequest), HTTPie and Wget command lines, HAR archives, Postman collections, JSON request documents, and raw HTTP/1.1 request messages.",
    );
  }
  if (resolved === "har") return parseHarRequest(source);
  if (resolved === "postman") return parsePostmanRequest(source);
  if (resolved === "json") return parseJsonDocumentRequest(source);
  if (resolved === "httpie") return parseHttpieRequest(source);
  if (resolved === "wget") return parseWgetRequest(source);
  if (resolved === "powershell") return parsePowerShellRequest(source);
  if (resolved === "http") return parseHttpMessageRequest(source);
  if (resolved === "php") return parsePhpRequest(source);
  if (resolved === "go") return parseGoRequest(source);
  if (resolved === "java") return parseJavaRequest(source);
  if (resolved === "kotlin") return parseKotlinRequest(source);
  if (resolved === "swift") return parseSwiftRequest(source);
  if (resolved === "dart") return parseDartRequest(source);
  if (resolved === "csharp") return parseCsharpRequest(source);
  if (resolved === "ruby") return parseRubyRequest(source);
  if (resolved === "rust") return parseRustRequest(source);
  return resolved === "python"
    ? parsePythonRequest(source)
    : parseJavaScriptRequest(source);
}
