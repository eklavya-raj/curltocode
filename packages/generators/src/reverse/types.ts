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
  | "python"
  | "php"
  | "go"
  | "java"
  | "csharp"
  | "ruby"
  | "rust"
  | "http";

export type ReverseTargetLanguage =
  | "javascript"
  | "typescript"
  | "python"
  | "php"
  | "go"
  | "java"
  | "csharp"
  | "ruby"
  | "rust"
  | "http";

/**
 * Clients the reverse parsers can recognise. This is a subset of the forward
 * registry: a target only appears once a parser exists that can read it back.
 */
export type ReverseClient =
  | "fetch"
  | "axios"
  | "undici"
  | "requests"
  | "httpx"
  | "aiohttp"
  | "curl"
  | "guzzle"
  | "nethttp"
  | "resty"
  | "httpclient"
  | "okhttp"
  | "apache"
  | "restsharp"
  | "faraday"
  | "reqwest"
  | "ureq"
  | "raw";

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
  { language: "python", client: "requests", parserLanguage: "python" },
  { language: "python", client: "httpx", parserLanguage: "python" },
  { language: "python", client: "aiohttp", parserLanguage: "python" },
  { language: "php", client: "curl", parserLanguage: "php" },
  { language: "php", client: "guzzle", parserLanguage: "php" },
  { language: "go", client: "nethttp", parserLanguage: "go" },
  { language: "go", client: "resty", parserLanguage: "go" },
  { language: "java", client: "httpclient", parserLanguage: "java" },
  { language: "java", client: "okhttp", parserLanguage: "java" },
  { language: "java", client: "apache", parserLanguage: "java" },
  { language: "csharp", client: "httpclient", parserLanguage: "csharp" },
  { language: "csharp", client: "restsharp", parserLanguage: "csharp" },
  { language: "ruby", client: "nethttp", parserLanguage: "ruby" },
  { language: "ruby", client: "faraday", parserLanguage: "ruby" },
  { language: "rust", client: "reqwest", parserLanguage: "rust" },
  { language: "rust", client: "ureq", parserLanguage: "rust" },
  { language: "http", client: "raw", parserLanguage: "http" },
];

/**
 * Targets whose output cannot carry the client's redirect policy.
 *
 * A raw request message describes one exchange. Whether a 3xx is followed is
 * decided afterwards, by the client, so `-L` has nowhere to live and cannot be
 * expected to survive a round trip.
 */
export const targetsWithoutRedirectPolicy: readonly ReverseClient[] = ["raw"];

/** Human-readable name, used when reporting what was detected. */
export const REVERSE_CLIENT_LABELS: Record<ReverseClient, string> = {
  fetch: "Fetch",
  axios: "Axios",
  undici: "Undici",
  requests: "Requests",
  httpx: "HTTPX",
  aiohttp: "aiohttp",
  curl: "cURL extension",
  guzzle: "Guzzle",
  nethttp: "net/http",
  resty: "Resty",
  httpclient: "HttpClient",
  okhttp: "OkHttp",
  apache: "Apache HttpClient",
  restsharp: "RestSharp",
  faraday: "Faraday",
  reqwest: "reqwest",
  ureq: "ureq",
  raw: "raw HTTP/1.1",
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
