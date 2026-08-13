import type { Header, HttpRequest, JsonValue } from "curltocode";

const sensitiveName =
  /authorization|cookie|api[-_]?key|secret|session|token|password/i;

export const maskSecret = (value: string): string =>
  value.length === 0 ? "" : "••••••••";

export function isSensitiveName(name: string): boolean {
  return sensitiveName.test(name);
}

function displayJson(
  value: JsonValue,
  revealSensitive: boolean,
  key = "",
): JsonValue {
  if (!revealSensitive && isSensitiveName(key) && typeof value === "string") {
    return maskSecret(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => displayJson(entry, revealSensitive));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([name, entry]) => [
        name,
        displayJson(entry, revealSensitive, name),
      ]),
    );
  }
  return value;
}

export function displayRequestUrl(
  value: string,
  revealSensitive = false,
): string {
  const parsed = new URL(value);
  if (parsed.username.length === 0 && parsed.password.length === 0) {
    return parsed.toString();
  }
  const username = revealSensitive
    ? parsed.username
    : maskSecret(parsed.username);
  const password = revealSensitive
    ? parsed.password
    : maskSecret(parsed.password);
  const credentials = `${username}${parsed.password.length > 0 ? `:${password}` : ""}@`;
  return `${parsed.protocol}//${credentials}${parsed.host}${parsed.pathname}${parsed.search}`;
}

export function inspectorHeaders(request: HttpRequest): readonly Header[] {
  if (
    request.headers.some(
      (header) => header.name.toLowerCase() === "content-type",
    )
  ) {
    return request.headers;
  }
  const value =
    request.body?.kind === "json"
      ? "application/json"
      : request.body?.kind === "form-urlencoded"
        ? "application/x-www-form-urlencoded"
        : request.body?.kind === "text"
          ? (request.body.contentType ?? "text/plain;charset=UTF-8")
          : request.body?.kind === "binary"
            ? request.body.contentType
            : undefined;
  return value === undefined
    ? request.headers
    : [...request.headers, { name: "Content-Type (effective)", value }];
}

export function bodyPreview(
  request: HttpRequest,
  revealSensitive = false,
): string | undefined {
  const body = request.body;
  if (body === undefined) return undefined;
  if (body.kind === "json") {
    return JSON.stringify(displayJson(body.value, revealSensitive), null, 2);
  }
  if (body.kind === "text") return body.value;
  if (body.kind === "form-urlencoded") {
    return body.fields
      .map(
        ({ name, value }) =>
          `${name}=${!revealSensitive && isSensitiveName(name) ? maskSecret(value) : value}`,
      )
      .join("\n");
  }
  if (body.kind === "multipart") {
    return body.parts
      .map((part) =>
        part.kind === "file"
          ? `${part.name}: file ${part.filename ?? part.path}`
          : `${part.name}: ${!revealSensitive && isSensitiveName(part.name) ? maskSecret(part.value) : part.value}`,
      )
      .join("\n");
  }
  return body.source.kind === "file"
    ? `File reference: ${body.source.path}`
    : "Inline binary data";
}

function jsonHasSensitiveValue(value: JsonValue): boolean {
  if (Array.isArray(value)) return value.some(jsonHasSensitiveValue);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([name, entry]) =>
      (isSensitiveName(name) && typeof entry === "string") ||
      jsonHasSensitiveValue(entry),
  );
}

export function hasSensitiveValues(request: HttpRequest): boolean {
  const parsedUrl = new URL(request.url);
  if (parsedUrl.username.length > 0 || parsedUrl.password.length > 0)
    return true;
  if (request.auth !== undefined || request.cookies.length > 0) return true;
  if (request.headers.some(({ name }) => isSensitiveName(name))) return true;
  if (request.query.some(({ name }) => isSensitiveName(name))) return true;

  const body = request.body;
  if (body?.kind === "json") return jsonHasSensitiveValue(body.value);
  if (body?.kind === "form-urlencoded") {
    return body.fields.some(({ name }) => isSensitiveName(name));
  }
  if (body?.kind === "multipart") {
    return body.parts.some(
      (part) => part.kind === "field" && isSensitiveName(part.name),
    );
  }
  return false;
}
