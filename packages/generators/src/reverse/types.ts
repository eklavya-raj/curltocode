import type {
  Cookie,
  Header,
  HttpRequest,
  RequestAuth,
  RequestBody,
} from "@curltocode/core";

export type DynamicIssueKind = "url" | "method" | "headers" | "body" | "config";

/** Source languages the reverse parsers can read. */
export type ReverseLanguage = "javascript" | "python";

/**
 * Clients the reverse parsers can recognise. This is a subset of the forward
 * registry: a target only appears once a parser exists that can read it back.
 */
export type ReverseClient =
  "fetch" | "axios" | "requests" | "httpx" | "aiohttp";

/** Human-readable name, used when reporting what was detected. */
export const REVERSE_CLIENT_LABELS: Record<ReverseClient, string> = {
  fetch: "Fetch",
  axios: "Axios",
  requests: "Requests",
  httpx: "HTTPX",
  aiohttp: "aiohttp",
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
