import { CURL_OPTION_INDEX } from "./curl-options.js";
import type { CurlOptionSpec } from "./curl-options.js";
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
import {
  createHttpRequest,
  splitRequestUrl,
  withDefaultScheme,
} from "./request.js";
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

/**
 * RFC 9110 permits horizontal tab inside a header field value, so a stricter
 * control-character rule would reject requests that are valid on the wire.
 * Cookie values keep the stricter rule because RFC 6265 excludes tab.
 */
function hasInvalidFieldValueCharacter(value: string): boolean {
  return hasControlCharacter(value.replaceAll("\t", " "));
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
  | "url"
  | "user-agent"
  | "referer"
  | "json"
  | "url-query"
  | "upload-file"
  | "form-string"
  | "range"
  | "time-cond"
  | "oauth2-bearer";

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
  ["-A", "user-agent"],
  ["--user-agent", "user-agent"],
  ["-e", "referer"],
  ["--referer", "referer"],
  ["--json", "json"],
  ["--url-query", "url-query"],
  ["-T", "upload-file"],
  ["--upload-file", "upload-file"],
  // --data-ascii is a plain --data alias; cURL keeps it only for history.
  ["--data-ascii", "data"],
  ["--form-string", "form-string"],
  ["-r", "range"],
  ["--range", "range"],
  ["-z", "time-cond"],
  ["--time-cond", "time-cond"],
  ["--oauth2-bearer", "oauth2-bearer"],
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
  for (const option of SHORT_VALUE_OPTIONS) {
    if (value.startsWith(option) && value.length > option.length) {
      return { option, inline: value.slice(option.length) };
    }
  }
  return { option: value };
}

/** Short options whose value may be attached directly, as in `-XPOST`. */
const SHORT_VALUE_OPTIONS: readonly string[] = [
  "-X",
  "-H",
  "-d",
  "-F",
  "-u",
  "-b",
  "-A",
  "-e",
  "-T",
  "-o",
  "-w",
  "-m",
  "-D",
  "-C",
  "-E",
  "-x",
  "-Y",
  "-y",
  "-r",
  "-z",
];

const SHORT_BOOLEAN_FLAGS: ReadonlySet<string> = new Set(
  "#46JNORSZfgisvkLIG".split(""),
);

/**
 * Expand a clustered short-option token such as `-sS` or `-sLo out.txt`.
 *
 * cURL allows boolean short options to be written together, and treats the
 * remainder of the cluster as the value of the first value-taking option it
 * reaches. Expansion only starts when the leading character is itself a
 * boolean flag, so `-XPOST` keeps its inline-value meaning.
 */
function expandShortCluster(token: string): readonly string[] | undefined {
  if (token.length <= 2 || !token.startsWith("-") || token.startsWith("--")) {
    return undefined;
  }
  if (!SHORT_BOOLEAN_FLAGS.has(token[1] ?? "")) return undefined;
  const expanded: string[] = [];
  for (let index = 1; index < token.length; index += 1) {
    const character = token[index] ?? "";
    if (SHORT_BOOLEAN_FLAGS.has(character)) {
      expanded.push(`-${character}`);
      continue;
    }
    if (SHORT_VALUE_OPTIONS.includes(`-${character}`)) {
      const rest = token.slice(index + 1);
      expanded.push(
        rest.length === 0 ? `-${character}` : `-${character}${rest}`,
      );
      return expanded;
    }
    // An unrecognised character makes the whole cluster ambiguous; report the
    // original token so the error names what the user actually wrote.
    return undefined;
  }
  return expanded;
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
  if (!HTTP_FIELD_NAME.test(name) || hasInvalidFieldValueCharacter(value)) {
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

/**
 * Reinterpret data arguments as query parameters, which is what `-G` and
 * `--url-query` ask for. `--data-urlencode` values are encoded first so their
 * escaping rules still apply, then decoded back into the model's plain pairs.
 */
function queryFromData(entries: readonly DataArgument[]): readonly FormField[] {
  return entries.flatMap((entry) => {
    if (entry.option !== "data-urlencode") {
      return fieldsFromFormFragment(entry.value);
    }
    const encoded = parseUrlEncodedData(entry.value);
    return encoded.field === undefined
      ? fieldsFromFormFragment(encoded.raw)
      : [encoded.field];
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
  // PowerShell aliases `curl` to its own cmdlet, so copied commands name the
  // executable outright. Windows paths also separate with a backslash.
  if (command === undefined || !/(^|[/\\])curl(\.exe)?$/iu.test(command)) {
    throw new CurlParseError(
      "CURL_INVALID_COMMAND",
      "The command must start with curl.",
    );
  }

  let method: string | undefined;
  let explicitMethod = false;
  let followRedirects = false;
  let url: string | undefined;
  let dataAsQuery = false;
  const headers: Header[] = [];
  const cookies: Cookie[] = [];
  let auth: RequestAuth | undefined;
  const data: DataArgument[] = [];
  const urlQuery: DataArgument[] = [];
  const forms: MultipartPart[] = [];
  const warnings: ParseWarning[] = [];
  const warnedOptions = new Set<string>();

  const warnTransport = (option: string, effect: string): void => {
    if (warnedOptions.has(option)) return;
    warnedOptions.add(option);
    warnings.push({
      code: "TRANSPORT_OPTION_IGNORED",
      message: `${option} was ignored: ${effect}, which the generated request cannot express.`,
    });
  };

  /** Handle an option that never consumes a following argument. */
  const applyBooleanOption = (option: string): boolean => {
    if (option === "-L" || option === "--location") {
      followRedirects = true;
      return true;
    }
    if (option === "--location-trusted") {
      followRedirects = true;
      warnTransport(option, "credentials were forwarded to redirect targets");
      return true;
    }
    if (option === "-I" || option === "--head") {
      method = "HEAD";
      explicitMethod = true;
      return true;
    }
    if (option === "-G" || option === "--get") {
      dataAsQuery = true;
      return true;
    }
    const spec = CURL_OPTION_INDEX.get(option);
    // Only value-less options are resolved here; anything that consumes an
    // argument has to go through the main loop so the argument is eaten too.
    if (spec === undefined || spec.takesValue === true) return false;
    return applyDisposition(spec, option);
  };

  /**
   * Act on an option's classification. Returns true when the option has been
   * dealt with and the caller should move on.
   */
  function applyDisposition(spec: CurlOptionSpec, option: string): boolean {
    if (spec.disposition === "process" || spec.disposition === "transparent")
      return true;
    if (spec.disposition === "warn") {
      warnTransport(option, spec.reason ?? "transfer behaviour was customized");
      return true;
    }
    if (spec.disposition === "protocol") {
      throw new UnsupportedCurlOptionError(
        option,
        `${option} belongs to a protocol other than HTTP, so it has no meaning in a converted HTTP request.`,
      );
    }
    if (spec.disposition === "unrepresentable") {
      throw new UnsupportedCurlOptionError(
        option,
        `${option} cannot be converted because ${spec.reason ?? "it cannot be resolved without running the request"}.`,
      );
    }
    // A "supported" option must be handled explicitly by the caller; reaching
    // here means the table and the parser have drifted apart.
    return false;
  }

  const setUrl = (value: string): void => {
    if (url !== undefined)
      throw new CurlParseError(
        "CURL_MULTIPLE_URLS",
        "Multiple request URLs are not supported.",
      );
    url = value;
  };

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) continue;
    if (!token.value.startsWith("-") || token.value === "-") {
      setUrl(token.value);
      continue;
    }
    // A cluster's leading entries are always boolean; only its final entry can
    // consume the next token, so it is handed to the normal option path.
    const cluster = expandShortCluster(token.value);
    let current = token.value;
    if (cluster !== undefined) {
      for (const entry of cluster.slice(0, -1)) {
        if (!applyBooleanOption(entry))
          throw new UnsupportedCurlOptionError(entry);
      }
      current = cluster.at(-1) ?? token.value;
    }
    if (applyBooleanOption(current)) continue;
    const { option, inline } = optionAndInlineValue(current);
    const kind = VALUE_OPTIONS.get(option);
    if (kind === undefined) {
      const spec = CURL_OPTION_INDEX.get(option);
      if (spec !== undefined && spec.disposition !== "supported") {
        // Consume the argument first so a rejected option's value is never
        // mistaken for the request URL, then act on the classification.
        if (inline === undefined && spec.takesValue === true) index += 1;
        applyDisposition(spec, option);
        continue;
      }
      throw new UnsupportedCurlOptionError(option);
    }
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
      setUrl(value);
    } else if (kind === "user-agent") {
      headers.push(parseHeader(`User-Agent: ${value}`));
    } else if (kind === "referer") {
      // `;auto` asks cURL to keep the referer updated across redirects; the
      // header value itself is everything before it.
      const referer = value.replace(/;auto$/u, "");
      if (referer.length > 0) headers.push(parseHeader(`Referer: ${referer}`));
    } else if (kind === "json") {
      // --json is shorthand for --data plus both JSON content negotiation
      // headers, which cURL adds only when the user has not set them.
      if (
        !headers.some((header) => header.name.toLowerCase() === "content-type")
      )
        headers.push({ name: "Content-Type", value: "application/json" });
      if (!headers.some((header) => header.name.toLowerCase() === "accept"))
        headers.push({ name: "Accept", value: "application/json" });
      data.push({ option: "data-raw", value });
    } else if (kind === "form-string") {
      // Unlike -F, the value is always literal: no @file or <file reading.
      const separator = value.indexOf("=");
      if (separator <= 0) {
        throw new CurlParseError(
          "CURL_INVALID_FORM",
          `Invalid cURL form value: ${value}`,
        );
      }
      forms.push({
        kind: "field",
        name: value.slice(0, separator),
        value: value.slice(separator + 1),
      });
    } else if (kind === "range") {
      // cURL accepts the range without the "bytes=" unit that the header needs.
      if (!headers.some((header) => header.name.toLowerCase() === "range")) {
        headers.push({
          name: "Range",
          value: /^[a-z-]+=/u.test(value) ? value : `bytes=${value}`,
        });
      }
    } else if (kind === "time-cond") {
      // A leading dash asks for the opposite comparison, and a leading + or
      // nothing asks for If-Modified-Since.
      const negated = value.startsWith("-");
      const stamp = negated || value.startsWith("+") ? value.slice(1) : value;
      if (stamp.startsWith("@") || /^\d+$/u.test(stamp)) {
        throw new UnsupportedCurlOptionError(
          "--time-cond",
          "--time-cond cannot be converted because a file timestamp would have to be read from disk.",
        );
      }
      headers.push({
        name: negated ? "If-Unmodified-Since" : "If-Modified-Since",
        value: stamp,
      });
    } else if (kind === "oauth2-bearer") {
      if (value.length === 0) {
        throw new CurlParseError(
          "CURL_INVALID_AUTH",
          "The cURL command contains an empty bearer token.",
        );
      }
      auth = { kind: "bearer", token: value };
    } else if (kind === "url-query") {
      urlQuery.push({ option: "data-urlencode", value });
    } else if (kind === "upload-file") {
      // -T uploads with PUT. Marking the method as explicit keeps the generic
      // "a body implies POST" default from overriding it; a later -X still wins.
      if (!explicitMethod) {
        method = "PUT";
        explicitMethod = true;
      }
      data.push({ option: "data-binary", value: `@${value}` });
    } else {
      data.push({ option: kind, value });
    }
  }

  if (url === undefined)
    throw new CurlParseError(
      "CURL_MISSING_URL",
      "No URL found in the cURL command.",
    );
  // cURL assumes http:// when the URL carries no scheme; normalize once here
  // so every later step sees the same absolute URL.
  url = withDefaultScheme(url);
  const urlDetails = splitRequestUrl(url);
  // `-G` moves the accumulated data into the query string, and `--url-query`
  // always targets the query regardless of the request method.
  const bodyData = dataAsQuery ? [] : data;
  const queryFields = [
    ...(dataAsQuery ? queryFromData(data) : []),
    ...queryFromData(urlQuery),
  ];
  if (queryFields.length > 0) {
    const target = new URL(url);
    for (const field of queryFields)
      target.searchParams.append(field.name, field.value);
    url = target.toString();
  }
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
  if (urlDetails.hadFragment) {
    warnings.push({
      code: "URL_FRAGMENT_IGNORED",
      message: "URL fragments are not sent in HTTP requests and were removed.",
    });
  }
  const body = buildBody(bodyData, forms, headers, warnings);
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
