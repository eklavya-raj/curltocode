import type {
  Cookie,
  Header,
  HttpRequest,
  RequestAuth,
  RequestBody,
} from "@curltocode/core";

export type DynamicIssueKind = "url" | "method" | "headers" | "body" | "config";

/** Source languages the reverse parsers can read. */
export type ReverseLanguage =
  | "javascript"
  | "kotlin"
  | "swift"
  | "dart"
  | "python"
  | "php"
  | "go"
  | "java"
  | "csharp"
  | "ruby"
  | "rust"
  | "http"
  | "httpie"
  | "wget"
  | "powershell"
  | "har"
  | "postman"
  | "json";

export type ReverseTargetLanguage =
  | "javascript"
  | "kotlin"
  | "swift"
  | "dart"
  | "typescript"
  | "nodejs"
  | "python"
  | "php"
  | "go"
  | "java"
  | "csharp"
  | "ruby"
  | "rust"
  | "http"
  | "httpie"
  | "wget"
  | "powershell"
  | "har"
  | "postman"
  | "json";

/**
 * Clients the reverse parsers can recognise. This is a subset of the forward
 * registry: a target only appears once a parser exists that can read it back.
 */
export type ReverseClient =
  | "fetch"
  | "axios"
  | "undici"
  | "got"
  | "ky"
  | "superagent"
  | "https"
  | "jquery"
  | "xhr"
  | "requests"
  | "httpx"
  | "aiohttp"
  | "urllib3"
  | "curl"
  | "guzzle"
  | "symfony"
  | "laravel"
  | "nethttp"
  | "resty"
  | "httpclient"
  | "okhttp"
  | "apache"
  | "httpurlconnection"
  | "ktor"
  | "urlsession"
  | "alamofire"
  | "dio"
  | "http"
  | "restsharp"
  | "flurl"
  | "faraday"
  | "httparty"
  | "restclient"
  | "reqwest"
  | "ureq"
  | "raw"
  | "cli"
  | "restmethod"
  | "webrequest"
  | "json"
  | "collection"
  | "request";

export interface ReverseTarget {
  readonly language: ReverseTargetLanguage;
  readonly client: ReverseClient;
  readonly parserLanguage: ReverseLanguage;
}

/**
 * Forward targets that can also be parsed back into the normalized request
 * model. Keeping this beside the reverse parser types prevents UI consumers
 * from maintaining a second, easily-stale capability list.
 */
export const reverseTargets: readonly ReverseTarget[] = [
  { language: "javascript", client: "fetch", parserLanguage: "javascript" },
  { language: "javascript", client: "axios", parserLanguage: "javascript" },
  { language: "javascript", client: "undici", parserLanguage: "javascript" },
  { language: "typescript", client: "fetch", parserLanguage: "javascript" },
  { language: "typescript", client: "axios", parserLanguage: "javascript" },
  { language: "typescript", client: "undici", parserLanguage: "javascript" },
  { language: "javascript", client: "jquery", parserLanguage: "javascript" },
  { language: "javascript", client: "xhr", parserLanguage: "javascript" },
  { language: "nodejs", client: "fetch", parserLanguage: "javascript" },
  { language: "nodejs", client: "axios", parserLanguage: "javascript" },
  { language: "nodejs", client: "got", parserLanguage: "javascript" },
  { language: "nodejs", client: "ky", parserLanguage: "javascript" },
  { language: "nodejs", client: "superagent", parserLanguage: "javascript" },
  { language: "nodejs", client: "https", parserLanguage: "javascript" },
  { language: "python", client: "requests", parserLanguage: "python" },
  { language: "python", client: "httpx", parserLanguage: "python" },
  { language: "python", client: "aiohttp", parserLanguage: "python" },
  { language: "python", client: "httpclient", parserLanguage: "python" },
  { language: "python", client: "urllib3", parserLanguage: "python" },
  { language: "php", client: "curl", parserLanguage: "php" },
  { language: "php", client: "guzzle", parserLanguage: "php" },
  { language: "php", client: "symfony", parserLanguage: "php" },
  { language: "php", client: "laravel", parserLanguage: "php" },
  { language: "go", client: "nethttp", parserLanguage: "go" },
  { language: "go", client: "resty", parserLanguage: "go" },
  { language: "java", client: "httpclient", parserLanguage: "java" },
  { language: "java", client: "okhttp", parserLanguage: "java" },
  { language: "java", client: "apache", parserLanguage: "java" },
  {
    language: "java",
    client: "httpurlconnection",
    parserLanguage: "java",
  },
  { language: "csharp", client: "httpclient", parserLanguage: "csharp" },
  { language: "csharp", client: "restsharp", parserLanguage: "csharp" },
  { language: "csharp", client: "flurl", parserLanguage: "csharp" },
  { language: "ruby", client: "nethttp", parserLanguage: "ruby" },
  { language: "ruby", client: "faraday", parserLanguage: "ruby" },
  { language: "ruby", client: "httparty", parserLanguage: "ruby" },
  { language: "ruby", client: "restclient", parserLanguage: "ruby" },
  { language: "rust", client: "reqwest", parserLanguage: "rust" },
  { language: "rust", client: "ureq", parserLanguage: "rust" },
  { language: "kotlin", client: "okhttp", parserLanguage: "kotlin" },
  { language: "kotlin", client: "ktor", parserLanguage: "kotlin" },
  { language: "swift", client: "urlsession", parserLanguage: "swift" },
  { language: "swift", client: "alamofire", parserLanguage: "swift" },
  { language: "dart", client: "http", parserLanguage: "dart" },
  { language: "dart", client: "dio", parserLanguage: "dart" },
  { language: "http", client: "raw", parserLanguage: "http" },
  { language: "httpie", client: "cli", parserLanguage: "httpie" },
  { language: "wget", client: "cli", parserLanguage: "wget" },
  {
    language: "powershell",
    client: "restmethod",
    parserLanguage: "powershell",
  },
  {
    language: "powershell",
    client: "webrequest",
    parserLanguage: "powershell",
  },
  { language: "har", client: "json", parserLanguage: "har" },
  { language: "postman", client: "collection", parserLanguage: "postman" },
  { language: "json", client: "request", parserLanguage: "json" },
];

/**
 * Targets whose output cannot carry the client's redirect policy.
 *
 * A raw request message describes one exchange. Whether a 3xx is followed is
 * decided afterwards, by the client, so `-L` has nowhere to live and cannot be
 * expected to survive a round trip.
 */
export const targetsWithoutRedirectPolicy: readonly ReverseClient[] = [
  "raw",
  // A HAR request object has the same gap: whether a 3xx is followed is decided
  // after the response arrives, so the archive has nowhere to record it.
  "json",
];

/**
 * Targets whose client follows redirects and cannot be told not to.
 *
 * XMLHttpRequest follows a 3xx itself and exposes no switch, and jQuery is
 * XMLHttpRequest underneath. Code read back from either therefore states that
 * it follows, rather than inheriting cURL's default of stopping at the first
 * response. The distinction matters: this is a policy the source really does
 * carry, not one it failed to record.
 */
export const targetsThatAlwaysFollowRedirects: readonly ReverseClient[] = [
  "jquery",
  "xhr",
];

/** Human-readable name, used when reporting what was detected. */
export const REVERSE_CLIENT_LABELS: Record<ReverseClient, string> = {
  fetch: "Fetch",
  axios: "Axios",
  undici: "Undici",
  got: "Got",
  ky: "Ky",
  superagent: "SuperAgent",
  https: "node:https",
  jquery: "jQuery",
  xhr: "XMLHttpRequest",
  requests: "Requests",
  httpx: "HTTPX",
  aiohttp: "aiohttp",
  urllib3: "urllib3",
  curl: "cURL extension",
  guzzle: "Guzzle",
  symfony: "Symfony HttpClient",
  laravel: "Laravel HTTP",
  nethttp: "net/http",
  resty: "Resty",
  httpclient: "HttpClient",
  okhttp: "OkHttp",
  apache: "Apache HttpClient",
  httpurlconnection: "HttpURLConnection",
  ktor: "Ktor",
  urlsession: "URLSession",
  alamofire: "Alamofire",
  dio: "Dio",
  http: "package:http",
  restsharp: "RestSharp",
  flurl: "Flurl",
  faraday: "Faraday",
  httparty: "HTTParty",
  restclient: "rest-client",
  reqwest: "reqwest",
  ureq: "ureq",
  raw: "raw HTTP/1.1",
  cli: "command line",
  restmethod: "Invoke-RestMethod",
  webrequest: "Invoke-WebRequest",
  json: "HAR 1.2 archive",
  collection: "Postman collection",
  request: "JSON request document",
};

export interface DynamicIssue {
  readonly kind: DynamicIssueKind;
  readonly expression: string;
  readonly message: string;
}

export interface StaticRequestDetails {
  readonly client: ReverseClient;
  readonly method?: string;
  readonly url?: string;
  readonly headers?: readonly Header[];
  readonly cookies?: readonly Cookie[];
  readonly auth?: RequestAuth;
  readonly body?: RequestBody;
  readonly followRedirects?: boolean;
}

export class CodeParseError extends Error {
  readonly code = "CODE_PARSE_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "CodeParseError";
  }
}

export class DynamicExpressionError extends Error {
  readonly code = "UNSUPPORTED_DYNAMIC_EXPRESSION";

  constructor(
    readonly issues: readonly DynamicIssue[],
    readonly partial: StaticRequestDetails,
  ) {
    super(
      [
        "Unable to statically resolve this request.",
        ...issues.map(
          (issue) => `${issue.message}\nExpression: ${issue.expression}`,
        ),
      ].join("\n\n"),
    );
    this.name = "DynamicExpressionError";
  }
}

export interface ReverseParseResult {
  readonly request: HttpRequest;
  readonly client: ReverseClient;
}
