import { CurlParseError, ValidationError } from "./errors.js";
import type {
  Header,
  HttpRequest,
  QueryParameter,
  RequestBody,
} from "./model.js";

const HTTP_METHOD = /^[A-Z!#$%&'*+.^_`|~-]+$/u;
const HTTP_FIELD_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u;

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function validateRequestOptions(options: CreateHttpRequestOptions): void {
  for (const header of options.headers ?? []) {
    if (
      !HTTP_FIELD_NAME.test(header.name) ||
      hasControlCharacter(header.value)
    ) {
      throw new ValidationError("The request contains an invalid HTTP header.");
    }
  }
  for (const cookie of options.cookies ?? []) {
    if (
      !HTTP_FIELD_NAME.test(cookie.name) ||
      hasControlCharacter(cookie.value)
    ) {
      throw new ValidationError("The request contains an invalid cookie.");
    }
  }
  if (options.auth?.kind === "basic") {
    if (
      hasControlCharacter(options.auth.username) ||
      hasControlCharacter(options.auth.password)
    ) {
      throw new ValidationError(
        "The request contains invalid basic authentication credentials.",
      );
    }
  } else if (
    options.auth?.kind === "bearer" &&
    (options.auth.token.length === 0 || hasControlCharacter(options.auth.token))
  ) {
    throw new ValidationError("The request contains an invalid bearer token.");
  }
  const body = options.body;
  if (
    (body?.kind === "text" || body?.kind === "binary") &&
    body.contentType !== undefined &&
    hasControlCharacter(body.contentType)
  ) {
    throw new ValidationError(
      "The request contains an invalid body media type.",
    );
  }
  if (
    body?.kind === "multipart" &&
    body.parts.some(
      (part) =>
        part.name.length === 0 ||
        hasControlCharacter(part.name) ||
        (part.kind === "file" &&
          (part.path.length === 0 ||
            hasControlCharacter(part.path) ||
            (part.filename !== undefined &&
              hasControlCharacter(part.filename)) ||
            (part.contentType !== undefined &&
              hasControlCharacter(part.contentType)))),
    )
  ) {
    throw new ValidationError(
      "The request contains an invalid multipart part.",
    );
  }
}

export interface CreateHttpRequestOptions {
  readonly method?: string;
  readonly headers?: readonly Header[];
  readonly cookies?: HttpRequest["cookies"];
  readonly auth?: HttpRequest["auth"];
  readonly body?: RequestBody;
  readonly followRedirects?: boolean;
}

export function splitRequestUrl(input: string): {
  readonly url: string;
  readonly query: readonly QueryParameter[];
  readonly hadFragment: boolean;
} {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new CurlParseError(
      "CURL_INVALID_URL",
      "The cURL command contains an invalid URL.",
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new CurlParseError(
      "CURL_INVALID_URL",
      `Unsupported URL protocol: ${parsed.protocol || "unknown"}`,
    );
  }
  const query = Array.from(parsed.searchParams, ([name, value]) => ({
    name,
    value,
  }));
  const hadFragment = parsed.hash.length > 0;
  parsed.search = "";
  parsed.hash = "";
  return { url: parsed.toString(), query, hadFragment };
}

export function createHttpRequest(
  inputUrl: string,
  options: CreateHttpRequestOptions = {},
): HttpRequest {
  const method = (options.method ?? "GET").toUpperCase();
  if (!HTTP_METHOD.test(method)) {
    throw new ValidationError(
      `Invalid HTTP method: ${method}`,
      "VALIDATION_INVALID_METHOD",
    );
  }
  validateRequestOptions(options);
  const { url, query } = splitRequestUrl(inputUrl);
  return {
    method,
    url,
    query,
    headers: options.headers ?? [],
    cookies: options.cookies ?? [],
    ...(options.auth === undefined ? {} : { auth: options.auth }),
    ...(options.body === undefined ? {} : { body: options.body }),
    options: { followRedirects: options.followRedirects ?? false },
  };
}

export function getHeader(
  request: Pick<HttpRequest, "headers">,
  name: string,
): Header | undefined {
  return request.headers.find(
    (header) => header.name.toLowerCase() === name.toLowerCase(),
  );
}

export function requestUrl(
  request: Pick<HttpRequest, "url" | "query">,
): string {
  const parsed = new URL(request.url);
  for (const parameter of request.query)
    parsed.searchParams.append(parameter.name, parameter.value);
  return parsed.toString();
}
