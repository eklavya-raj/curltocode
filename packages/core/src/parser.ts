import { CurlParseError, UnsupportedCurlOptionError } from "./errors.js";
import type {
  Cookie,
  CurlParseResult,
  FormField,
  Header,
  JsonValue,
  MultipartPart,
  ParseWarning,
  RequestAuth,
  RequestBody,
} from "./model.js";
import { createHttpRequest, splitRequestUrl } from "./request.js";
import type { ShellToken } from "./tokenizer.js";
import { tokenizeCurl } from "./tokenizer.js";

interface DataArgument {
  readonly option: "data" | "data-raw" | "data-binary" | "data-urlencode";
  readonly value: string;
}

interface UrlEncodedData {
  readonly raw: string;
  readonly field?: FormField;
}

const HTTP_FIELD_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u;

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

type ValueOptionKind =
  | "request"
  | "header"
  | "data"
  | "data-raw"
  | "data-binary"
  | "data-urlencode"
  | "form"
  | "user"
  | "cookie"
  | "url";

const VALUE_OPTIONS: ReadonlyMap<string, ValueOptionKind> = new Map([
  ["-X", "request"],
  ["--request", "request"],
  ["-H", "header"],
  ["--header", "header"],
  ["-d", "data"],
  ["--data", "data"],
  ["--data-raw", "data-raw"],
  ["--data-binary", "data-binary"],
  ["--data-urlencode", "data-urlencode"],
  ["-F", "form"],
  ["--form", "form"],
  ["-u", "user"],
  ["--user", "user"],
  ["-b", "cookie"],
  ["--cookie", "cookie"],
  ["--url", "url"],
] as const);

function optionAndInlineValue(value: string): {
  option: string;
  inline?: string;
} {
  if (value.startsWith("--") && value.includes("=")) {
    const separator = value.indexOf("=");
    return {
      option: value.slice(0, separator),
      inline: value.slice(separator + 1),
    };
  }
  for (const option of ["-X", "-H", "-d", "-F", "-u", "-b"] as const) {
    if (value.startsWith(option) && value.length > option.length) {
      return { option, inline: value.slice(option.length) };
    }
  }
  return { option: value };
}

function requireValue(
  tokens: readonly ShellToken[],
  index: number,
  option: string,
): string {
  const token = tokens[index];
  if (token === undefined) {
    throw new CurlParseError(
      "CURL_MISSING_OPTION_VALUE",
      `Missing value for cURL option: ${option}`,
    );
  }
  return token.value;
}

function parseHeader(input: string): Header {
  const separator = input.indexOf(":");
  if (separator <= 0) {
    throw new CurlParseError(
      "CURL_INVALID_HEADER",
      `Invalid cURL header: ${input}`,
    );
  }
  const name = input.slice(0, separator).trim();
  const value = input.slice(separator + 1).trimStart();
  if (!HTTP_FIELD_NAME.test(name) || hasControlCharacter(value)) {
    throw new CurlParseError(
      "CURL_INVALID_HEADER",
      `Invalid cURL header: ${input}`,
    );
  }
  return { name, value };
}

function parseCookies(
  input: string,
  options: { readonly allowFileSyntax: boolean },
): readonly Cookie[] {
  if (input.startsWith("@"))
    throw new UnsupportedCurlOptionError("--cookie @file");
  if (input.length > 0 && !input.includes("=")) {
    if (options.allowFileSyntax) {
      throw new UnsupportedCurlOptionError("--cookie with a cookie file");
    }
    throw new CurlParseError(
      "CURL_INVALID_COOKIE",
      "The Cookie header contains a value without an equals sign.",
    );
  }
  return input
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf("=");
      if (separator < 0) {
        throw new CurlParseError(
          "CURL_INVALID_COOKIE",
          "The cURL command contains a cookie without an equals sign.",
        );
      }
      const name = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (
        !HTTP_FIELD_NAME.test(name) ||
        hasControlCharacter(name) ||
        hasControlCharacter(value)
      ) {
        throw new CurlParseError(
          "CURL_INVALID_COOKIE",
          "The cURL command contains an invalid cookie.",
        );
      }
      return { name, value };
    });
}

function parseAuth(input: string): RequestAuth {
  const separator = input.indexOf(":");
  if (separator < 0) {
    throw new CurlParseError(
      "CURL_INVALID_AUTH",
      "Basic authentication must include an explicit password separator, for example --user 'name:password'.",
    );
  }
  const username = input.slice(0, separator);
  const password = input.slice(separator + 1);
  if (hasControlCharacter(username) || hasControlCharacter(password)) {
    throw new CurlParseError(
      "CURL_INVALID_AUTH",
      "The cURL command contains invalid basic authentication credentials.",
    );
  }
  return {
    kind: "basic",
    username,
    password,
  };
}

function parseMultipart(input: string): MultipartPart {
  const separator = input.indexOf("=");
  if (separator <= 0)
    throw new CurlParseError(
      "CURL_INVALID_FORM",
      `Invalid cURL form value: ${input}`,
    );
  const name = input.slice(0, separator);
  if (hasControlCharacter(name)) {
    throw new CurlParseError(
      "CURL_INVALID_FORM",
      "The multipart field name contains a control character.",
    );
  }
  const segments = input.slice(separator + 1).split(";");
  const value = segments.shift() ?? "";
  const metadata = Object.fromEntries(
    segments.map((segment) => {
      const equals = segment.indexOf("=");
      return equals < 0
        ? [segment.trim(), ""]
        : [segment.slice(0, equals).trim(), segment.slice(equals + 1)];
    }),
  );
  const unsupportedMetadata = Object.keys(metadata).find(
    (key) => key !== "filename" && key !== "type",
  );
  if (unsupportedMetadata !== undefined) {
    throw new UnsupportedCurlOptionError(
      `--form metadata: ${unsupportedMetadata}`,
    );
  }
  if (value.startsWith("@")) {
    if (value.length === 1) {
      throw new CurlParseError(
        "CURL_INVALID_FORM",
        "The multipart file path is empty.",
      );
    }
    return {
      kind: "file",
      name,
      path: value.slice(1),
      ...(metadata.filename === undefined
        ? {}
        : { filename: metadata.filename }),
      ...(metadata.type === undefined ? {} : { contentType: metadata.type }),
    };
  }
  if (value.startsWith("<")) {
    throw new UnsupportedCurlOptionError("--form field=<file");
  }
  return { kind: "field", name, value };
}

function parseUrlEncodedData(input: string): UrlEncodedData {
  if (input.startsWith("@") || (!input.includes("=") && input.includes("@"))) {
    throw new UnsupportedCurlOptionError("--data-urlencode with a local file");
  }
  const separator = input.indexOf("=");
  if (separator < 0 || separator === 0) {
    const value = separator === 0 ? input.slice(1) : input;
    return { raw: encodeDataComponent(value) };
  }
  const name = input.slice(0, separator);
  const value = input.slice(separator + 1);
  return {
    raw: `${name}=${encodeDataComponent(value)}`,
    field: { name, value },
  };
}

function encodeDataComponent(value: string): string {
  try {
    return encodeURIComponent(value);
  } catch {
    throw new CurlParseError(
      "CURL_INVALID_DATA",
      "The cURL data contains an invalid Unicode sequence.",
    );
  }
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value === "object") return Object.values(value).every(isJsonValue);
  return false;
}

function decodeFormComponent(value: string): string {
  return decodeURIComponent(value.replaceAll("+", " "));
}

function fieldsFromFormFragment(fragment: string): readonly FormField[] {
  if (fragment.length === 0) return [];
  return fragment.split("&").map((pair) => {
    const separator = pair.indexOf("=");
    try {
      return separator < 0
        ? { name: decodeFormComponent(pair), value: "" }
        : {
            name: decodeFormComponent(pair.slice(0, separator)),
            value: decodeFormComponent(pair.slice(separator + 1)),
          };
    } catch {
      return { name: pair, value: "" };
    }
  });
}

function buildBody(
  data: readonly DataArgument[],
  forms: readonly MultipartPart[],
  headers: readonly Header[],
  warnings: ParseWarning[],
): RequestBody | undefined {
  if (forms.length > 0 && data.length > 0) {
    throw new UnsupportedCurlOptionError("combining --form with --data");
  }
  if (forms.length > 0) return { kind: "multipart", parts: forms };
  if (data.length === 0) return undefined;
  const contentType = headers
    .find((header) => header.name.toLowerCase() === "content-type")
    ?.value.toLowerCase();
  if (
    data.some(
      (entry) =>
        (entry.option === "data" && entry.value.startsWith("@")) ||
        (entry.option === "data-urlencode" && entry.value.startsWith("@")),
    )
  ) {
    throw new UnsupportedCurlOptionError("data loaded from a local file");
  }
  if (
    data.length === 1 &&
    data[0]?.option === "data-binary" &&
    data[0].value.startsWith("@")
  ) {
    if (data[0].value === "@-") {
      throw new UnsupportedCurlOptionError("--data-binary @-");
    }
    return {
      kind: "binary",
      source: { kind: "file", path: data[0].value.slice(1) },
      contentType: contentType ?? "application/x-www-form-urlencoded",
    };
  }
  const urlEncoded = data.map((entry) =>
    entry.option === "data-urlencode"
      ? parseUrlEncodedData(entry.value)
      : undefined,
  );
  const encoded = data.map((entry, index) =>
    entry.option === "data-urlencode"
      ? (urlEncoded[index]?.raw ?? "")
      : entry.value,
  );
  const raw = encoded.join("&");
  if (contentType?.includes("json")) {
    try {
      const value: unknown = JSON.parse(raw);
      if (isJsonValue(value)) return { kind: "json", value, raw };
    } catch {
      if (contentType?.includes("json")) {
        warnings.push({
          code: "JSON_CONTENT_TYPE_INVALID",
          message:
            "The body declares a JSON content type but is not valid JSON; it was preserved as text.",
        });
      }
    }
  }
  const isForm =
    contentType?.includes("application/x-www-form-urlencoded") === true ||
    data.some((entry) => entry.option === "data-urlencode") ||
    (contentType === undefined &&
      data.every((entry) => entry.option !== "data-binary"));
  if (isForm) {
    const fields = data.flatMap((entry, index) => {
      const explicitlyEncoded = urlEncoded[index];
      if (explicitlyEncoded !== undefined) {
        return explicitlyEncoded.field === undefined
          ? []
          : [explicitlyEncoded.field];
      }
      return fieldsFromFormFragment(entry.value);
    });
    return {
      kind: "form-urlencoded",
      fields,
      raw,
    };
  }
  if (data.some((entry) => entry.option === "data-binary")) {
    return {
      kind: "binary",
      source: { kind: "inline", value: raw },
      contentType: contentType ?? "application/x-www-form-urlencoded",
    };
  }
  return {
    kind: "text",
    value: raw,
    ...(contentType === undefined ? {} : { contentType }),
  };
}

export function parseCurl(input: string): CurlParseResult {
  const tokens = tokenizeCurl(input);
  if (tokens.length === 0)
    throw new CurlParseError(
      "CURL_EMPTY_INPUT",
      "Enter a cURL command to convert.",
    );
  const command = tokens[0]?.value;
  if (command === undefined || !/(^|\/)curl$/u.test(command)) {
    throw new CurlParseError(
      "CURL_INVALID_COMMAND",
      "The command must start with curl.",
    );
  }

  let method: string | undefined;
  let explicitMethod = false;
  let followRedirects = false;
  let url: string | undefined;
  const headers: Header[] = [];
  const cookies: Cookie[] = [];
  let auth: RequestAuth | undefined;
  const data: DataArgument[] = [];
  const forms: MultipartPart[] = [];

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) continue;
    if (!token.value.startsWith("-") || token.value === "-") {
      if (url !== undefined)
        throw new CurlParseError(
          "CURL_MULTIPLE_URLS",
          "Multiple request URLs are not supported.",
        );
      url = token.value;
      continue;
    }
    if (token.value === "-L" || token.value === "--location") {
      followRedirects = true;
      continue;
    }
    const { option, inline } = optionAndInlineValue(token.value);
    const kind = VALUE_OPTIONS.get(option);
    if (kind === undefined) throw new UnsupportedCurlOptionError(option);
    const value = inline ?? requireValue(tokens, index + 1, option);
    if (inline === undefined) index += 1;
    if (kind === "request") {
      method = value.toUpperCase();
      explicitMethod = true;
    } else if (kind === "header") {
      headers.push(parseHeader(value));
    } else if (kind === "form") {
      forms.push(parseMultipart(value));
    } else if (kind === "user") {
      auth = parseAuth(value);
    } else if (kind === "cookie") {
      cookies.push(...parseCookies(value, { allowFileSyntax: true }));
    } else if (kind === "url") {
      if (url !== undefined)
        throw new CurlParseError(
          "CURL_MULTIPLE_URLS",
          "Multiple request URLs are not supported.",
        );
      url = value;
    } else {
      data.push({ option: kind, value });
    }
  }

  if (url === undefined)
    throw new CurlParseError(
      "CURL_MISSING_URL",
      "No URL found in the cURL command.",
    );
  const urlDetails = splitRequestUrl(url);
  const parsedUrl = new URL(url);
  if (parsedUrl.username.length > 0 || parsedUrl.password.length > 0) {
    let urlAuth: RequestAuth;
    try {
      urlAuth = {
        kind: "basic",
        username: decodeURIComponent(parsedUrl.username),
        password: decodeURIComponent(parsedUrl.password),
      };
    } catch {
      throw new CurlParseError(
        "CURL_INVALID_AUTH",
        "The request URL contains invalid percent-encoded credentials.",
      );
    }
    if (
      auth !== undefined &&
      (auth.kind !== "basic" ||
        auth.username !== urlAuth.username ||
        auth.password !== urlAuth.password)
    ) {
      throw new CurlParseError(
        "CURL_INVALID_AUTH",
        "The cURL command contains conflicting URL and --user credentials.",
      );
    }
    auth = urlAuth;
    parsedUrl.username = "";
    parsedUrl.password = "";
    url = parsedUrl.toString();
  }
  const warnings: ParseWarning[] = [];
  if (urlDetails.hadFragment) {
    warnings.push({
      code: "URL_FRAGMENT_IGNORED",
      message: "URL fragments are not sent in HTTP requests and were removed.",
    });
  }
  const body = buildBody(data, forms, headers, warnings);
  if (!explicitMethod && body !== undefined) method = "POST";
  const authorizationHeaders = headers.filter(
    (header) => header.name.toLowerCase() === "authorization",
  );
  if (auth?.kind === "basic" && authorizationHeaders.length > 0) {
    throw new CurlParseError(
      "CURL_INVALID_AUTH",
      "The cURL command combines basic credentials with an explicit Authorization header.",
    );
  }
  const authorization =
    authorizationHeaders.length === 1 ? authorizationHeaders[0] : undefined;
  if (
    auth === undefined &&
    authorization?.value.toLowerCase().startsWith("bearer ") &&
    authorization.value.slice(7).length > 0
  ) {
    auth = { kind: "bearer", token: authorization.value.slice(7) };
  }
  const normalizedHeaders = headers.filter((header) => {
    const name = header.name.toLowerCase();
    if (name === "cookie") {
      cookies.push(...parseCookies(header.value, { allowFileSyntax: false }));
      return false;
    }
    return !(
      name === "authorization" &&
      auth?.kind === "bearer" &&
      header === authorization
    );
  });
  return {
    request: createHttpRequest(url, {
      ...(method === undefined ? {} : { method }),
      headers: normalizedHeaders,
      cookies,
      ...(auth === undefined ? {} : { auth }),
      ...(body === undefined ? {} : { body }),
      followRedirects,
    }),
    warnings,
  };
}
