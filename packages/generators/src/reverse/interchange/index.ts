import { createHttpRequest } from "@curltocode/core";
import type {
  Cookie,
  Header,
  HttpRequest,
  MultipartPart,
  RequestBody,
} from "@curltocode/core";

import { normalizeHeaders } from "../normalize.js";
import { classifyStringBody } from "../shared/body.js";
import { CodeParseError } from "../types.js";
import type { ReverseParseResult } from "../types.js";

/**
 * Reverse parsing for the three interchange formats: HAR, a Postman
 * collection, and this site's own JSON request document.
 *
 * These need no language analysis at all — the document already *is* the
 * request — so they recover strictly more than any code parser can. A file
 * upload survives, because the path is written down rather than resolved from
 * a variable, and so does a redirect policy wherever the format records one.
 *
 * A document describing several requests keeps its first, which is what a
 * pasted DevTools export is almost always reaching for. `listInterchangeRequests`
 * returns all of them for a caller that wants to choose.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNameValues(value: unknown, nameKey: string): readonly Header[] {
  if (!Array.isArray(value)) return [];
  const entries: Header[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    // Postman marks a disabled row rather than removing it.
    if (entry["disabled"] === true) continue;
    const name = readString(entry[nameKey]);
    const headerValue = readString(entry["value"]);
    if (name === undefined || headerValue === undefined) continue;
    // Every HAR a browser exports from an HTTP/2 site carries the pseudo-headers
    // `:method`, `:scheme`, `:authority`, and `:path`. They are not header
    // fields — they are the request line and the authority, which the URL and
    // method already hold — and they are not even legal header names, so
    // keeping them would fail validation on the most common HAR there is.
    if (name.startsWith(":")) continue;
    entries.push({ name, value: headerValue });
  }
  return entries;
}

/** One request recovered from a document, with the label its format gave it. */
export interface InterchangeEntry {
  /** Display name, such as a Postman item name or the HAR entry's method and path. */
  readonly name: string;
  readonly request: HttpRequest;
}

function parseDocument(source: string): Record<string, unknown> {
  let document: unknown;
  try {
    document = JSON.parse(source);
  } catch (error) {
    throw new CodeParseError(
      `This does not parse as JSON, so it cannot be read as a HAR, a Postman collection, or a request document. ${
        error instanceof Error ? error.message : ""
      }`.trim(),
    );
  }
  if (!isRecord(document)) {
    throw new CodeParseError(
      "A HAR, Postman collection, or request document has to be a JSON object.",
    );
  }
  return document;
}

/* ------------------------------------------------------------------ HAR */

function harMultipart(params: unknown): readonly MultipartPart[] | undefined {
  if (!Array.isArray(params)) return undefined;
  const parts: MultipartPart[] = [];
  for (const entry of params) {
    if (!isRecord(entry)) continue;
    const name = readString(entry["name"]);
    if (name === undefined) continue;
    const fileName = readString(entry["fileName"]);
    if (fileName === undefined) {
      parts.push({
        kind: "field",
        name,
        value: readString(entry["value"]) ?? "",
      });
      continue;
    }
    const contentType = readString(entry["contentType"]);
    parts.push({
      kind: "file",
      name,
      path: fileName,
      ...(contentType === undefined ? {} : { contentType }),
    });
  }
  return parts.length === 0 ? undefined : parts;
}

function harBody(postData: unknown): RequestBody | undefined {
  if (!isRecord(postData)) return undefined;
  const mimeType = readString(postData["mimeType"]);
  if (mimeType?.toLowerCase().includes("multipart/form-data") === true) {
    const parts = harMultipart(postData["params"]);
    if (parts !== undefined) return { kind: "multipart", parts };
  }
  const text = readString(postData["text"]);
  if (text === undefined) return undefined;
  return classifyStringBody(text, mimeType);
}

function harEntry(entry: unknown): InterchangeEntry | undefined {
  if (!isRecord(entry)) return undefined;
  const request = entry["request"];
  if (!isRecord(request)) return undefined;
  const url = readString(request["url"]);
  const method = readString(request["method"]);
  if (url === undefined || method === undefined) return undefined;
  const normalized = normalizeHeaders(
    readNameValues(request["headers"], "name"),
  );
  const cookies: Cookie[] = [
    ...normalized.cookies,
    ...readNameValues(request["cookies"], "name").map(({ name, value }) => ({
      name,
      value,
    })),
  ];
  const body = harBody(request["postData"]);
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    // A relative or malformed URL still names the entry; createHttpRequest
    // below is what decides whether it can be used at all.
  }
  return {
    name: `${method} ${pathname}`,
    request: createHttpRequest(url, {
      method,
      headers: normalized.headers,
      // A HAR lists a cookie both in `cookies` and in the Cookie header, so the
      // two are merged by name to avoid sending each one twice.
      cookies: cookies.filter(
        (cookie, index) =>
          cookies.findIndex(
            (other) =>
              other.name === cookie.name && other.value === cookie.value,
          ) === index,
      ),
      ...(normalized.auth === undefined ? {} : { auth: normalized.auth }),
      ...(body === undefined ? {} : { body }),
      // A HAR request object has no field for redirect policy, so the recovered
      // request keeps cURL's own default of not following.
      followRedirects: false,
    }),
  };
}

/* -------------------------------------------------------------- Postman */

function postmanUrl(url: unknown): string | undefined {
  if (typeof url === "string") return url;
  if (!isRecord(url)) return undefined;
  const raw = readString(url["raw"]);
  if (raw !== undefined) return raw;
  const protocol = readString(url["protocol"]) ?? "https";
  const host = Array.isArray(url["host"])
    ? url["host"].filter((part) => typeof part === "string").join(".")
    : readString(url["host"]);
  if (host === undefined) return undefined;
  const port = readString(url["port"]);
  const path = Array.isArray(url["path"])
    ? url["path"].filter((part) => typeof part === "string").join("/")
    : (readString(url["path"]) ?? "");
  return `${protocol}://${host}${port === undefined ? "" : `:${port}`}/${path}`;
}

function postmanBody(
  body: unknown,
  contentType: string | undefined,
): RequestBody | undefined {
  if (!isRecord(body)) return undefined;
  const mode = readString(body["mode"]);
  if (mode === "raw") {
    const raw = readString(body["raw"]);
    // Postman's `options.raw.language` only picks the editor's highlighting;
    // the declared Content-Type is what says how the bytes are meant.
    return raw === undefined ? undefined : classifyStringBody(raw, contentType);
  }
  if (mode === "urlencoded") {
    const fields = readNameValues(body["urlencoded"], "key");
    return {
      kind: "form-urlencoded",
      fields,
      raw: fields
        .map(
          ({ name, value }) =>
            `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
        )
        .join("&"),
    };
  }
  if (mode === "formdata") {
    const rows = Array.isArray(body["formdata"]) ? body["formdata"] : [];
    const parts: MultipartPart[] = [];
    for (const row of rows) {
      if (!isRecord(row) || row["disabled"] === true) continue;
      const name = readString(row["key"]);
      if (name === undefined) continue;
      if (readString(row["type"]) === "file") {
        const src = Array.isArray(row["src"])
          ? readString(row["src"][0])
          : readString(row["src"]);
        if (src === undefined) continue;
        const contentType = readString(row["contentType"]);
        parts.push({
          kind: "file",
          name,
          path: src,
          ...(contentType === undefined ? {} : { contentType }),
        });
        continue;
      }
      parts.push({
        kind: "field",
        name,
        value: readString(row["value"]) ?? "",
      });
    }
    return parts.length === 0 ? undefined : { kind: "multipart", parts };
  }
  if (mode === "file") {
    const file = body["file"];
    const src = isRecord(file) ? readString(file["src"]) : undefined;
    return src === undefined
      ? undefined
      : { kind: "binary", source: { kind: "file", path: src } };
  }
  return undefined;
}

function postmanAuth(auth: unknown):
  | {
      readonly username: string;
      readonly password: string;
    }
  | undefined {
  if (!isRecord(auth) || readString(auth["type"]) !== "basic") return undefined;
  const rows = readNameValues(auth["basic"], "key");
  const username = rows.find((row) => row.name === "username")?.value;
  const password = rows.find((row) => row.name === "password")?.value;
  return username === undefined
    ? undefined
    : { username, password: password ?? "" };
}

/** Postman nests items inside folders, which nest further without limit. */
function postmanItems(node: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(node)) return [];
  const found: Record<string, unknown>[] = [];
  for (const entry of node) {
    if (!isRecord(entry)) continue;
    if (Array.isArray(entry["item"])) {
      found.push(...postmanItems(entry["item"]));
      continue;
    }
    if (isRecord(entry["request"]) || typeof entry["request"] === "string") {
      found.push(entry);
    }
  }
  return found;
}

function postmanEntry(
  item: Record<string, unknown>,
): InterchangeEntry | undefined {
  const raw = item["request"];
  const request = isRecord(raw) ? raw : undefined;
  if (request === undefined) return undefined;
  const url = postmanUrl(request["url"]);
  if (url === undefined) return undefined;
  const method = readString(request["method"]) ?? "GET";
  const normalized = normalizeHeaders(readNameValues(request["header"], "key"));
  const body = postmanBody(
    request["body"],
    normalized.headers.find(
      (header) => header.name.toLowerCase() === "content-type",
    )?.value,
  );
  const basic = postmanAuth(request["auth"]);
  const behavior = item["protocolProfileBehavior"];
  const followRedirects = isRecord(behavior)
    ? behavior["followRedirects"] === true
    : false;
  return {
    name: readString(item["name"]) ?? `${method} ${url}`,
    request: createHttpRequest(url, {
      method,
      headers: normalized.headers,
      cookies: normalized.cookies,
      ...(basic === undefined
        ? normalized.auth === undefined
          ? {}
          : { auth: normalized.auth }
        : { auth: { kind: "basic" as const, ...basic } }),
      ...(body === undefined ? {} : { body }),
      followRedirects,
    }),
  };
}

/* -------------------------------------------------- JSON request document */

function jsonRequestEntry(
  document: Record<string, unknown>,
): InterchangeEntry | undefined {
  const url = readString(document["url"]);
  const method = readString(document["method"]);
  if (url === undefined || method === undefined) return undefined;
  const headers = Array.isArray(document["headers"])
    ? readNameValues(document["headers"], "name")
    : [];
  const cookies = Array.isArray(document["cookies"])
    ? readNameValues(document["cookies"], "name").map(({ name, value }) => ({
        name,
        value,
      }))
    : [];
  const normalized = normalizeHeaders(headers);
  const options = document["options"];
  const auth = document["auth"];
  return {
    name: `${method} ${url}`,
    request: createHttpRequest(url, {
      method,
      headers: normalized.headers,
      cookies: [...normalized.cookies, ...cookies],
      // The document carries the model's own auth and body shapes, so they are
      // handed back unchanged rather than re-derived from the headers.
      ...(isRecord(auth)
        ? { auth: auth as never }
        : normalized.auth === undefined
          ? {}
          : { auth: normalized.auth }),
      ...(isRecord(document["body"])
        ? { body: document["body"] as never }
        : {}),
      followRedirects: isRecord(options)
        ? options["followRedirects"] === true
        : false,
    }),
  };
}

/* ------------------------------------------------------------- dispatch */

export type InterchangeFormat = "har" | "postman" | "json";

/** Classify a JSON document by the field each format is identified by. */
export function interchangeFormat(
  document: Record<string, unknown>,
): InterchangeFormat | undefined {
  const log = document["log"];
  if (isRecord(log) && Array.isArray(log["entries"])) return "har";
  const info = document["info"];
  if (
    Array.isArray(document["item"]) ||
    (isRecord(info) &&
      readString(info["schema"])?.includes("getpostman") === true)
  ) {
    return "postman";
  }
  return typeof document["url"] === "string" &&
    typeof document["method"] === "string"
    ? "json"
    : undefined;
}

/** Every request a document describes, in the order it lists them. */
export function listInterchangeRequests(
  source: string,
): readonly InterchangeEntry[] {
  const document = parseDocument(source);
  const format = interchangeFormat(document);
  if (format === "har") {
    const log = document["log"] as Record<string, unknown>;
    const entries = (log["entries"] as unknown[])
      .map((entry) => harEntry(entry))
      .filter((entry): entry is InterchangeEntry => entry !== undefined);
    return entries;
  }
  if (format === "postman") {
    return postmanItems(document["item"])
      .map((item) => postmanEntry(item))
      .filter((entry): entry is InterchangeEntry => entry !== undefined);
  }
  if (format === "json") {
    const entry = jsonRequestEntry(document);
    return entry === undefined ? [] : [entry];
  }
  throw new CodeParseError(
    "This JSON is not a HAR archive, a Postman collection, or a request document. A HAR has log.entries, a collection has item, and a request document has url and method.",
  );
}

const FORMAT_NAMES: Record<InterchangeFormat, string> = {
  har: "a HAR archive",
  postman: "a Postman collection",
  json: "a JSON request document",
};

function firstOrThrow(source: string, format: InterchangeFormat) {
  const document = parseDocument(source);
  const detected = interchangeFormat(document);
  if (detected === undefined) {
    // listInterchangeRequests carries the message explaining what each format
    // is identified by, which is what a reader of this error needs.
    listInterchangeRequests(source);
  }
  if (detected !== format) {
    throw new CodeParseError(
      `This document is ${FORMAT_NAMES[detected!]}, not ${FORMAT_NAMES[format]}.`,
    );
  }
  const entries = listInterchangeRequests(source);
  const first = entries[0];
  if (first === undefined) {
    throw new CodeParseError(
      "The document parsed but describes no request that could be recovered.",
    );
  }
  return first;
}

export function parseHarRequest(source: string): ReverseParseResult {
  return { client: "json", request: firstOrThrow(source, "har").request };
}

export function parsePostmanRequest(source: string): ReverseParseResult {
  return {
    client: "collection",
    request: firstOrThrow(source, "postman").request,
  };
}

export function parseJsonDocumentRequest(source: string): ReverseParseResult {
  return { client: "request", request: firstOrThrow(source, "json").request };
}

/** True when the source is JSON in one of the three shapes read here. */
export function looksLikeInterchangeDocument(
  source: string,
): InterchangeFormat | undefined {
  const trimmed = source.trimStart();
  if (!trimmed.startsWith("{")) return undefined;
  try {
    const document: unknown = JSON.parse(source);
    return isRecord(document) ? interchangeFormat(document) : undefined;
  } catch {
    return undefined;
  }
}
