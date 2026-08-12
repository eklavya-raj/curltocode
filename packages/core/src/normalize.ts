import type { Header, HttpRequest, JsonValue, RequestBody } from "./model.js";

function normalizeJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeJson(entry)]),
    );
  }
  return value;
}

function normalizeBody(body: RequestBody | undefined): unknown {
  if (body?.kind === "json")
    return { kind: "json", value: normalizeJson(body.value) };
  if (body?.kind === "form-urlencoded")
    return { kind: "form-urlencoded", raw: body.raw };
  if (body?.kind === "text") return { kind: "text", value: body.value };
  if (body?.kind === "binary") return { kind: "binary", source: body.source };
  return body;
}

function effectiveHeaders(request: HttpRequest): readonly Header[] {
  const headers = [...request.headers];
  const bodyContentType =
    request.body?.kind === "json"
      ? "application/json"
      : request.body?.kind === "form-urlencoded"
        ? "application/x-www-form-urlencoded"
        : request.body?.kind === "text"
          ? (request.body.contentType ?? "text/plain;charset=UTF-8")
          : request.body?.kind === "binary"
            ? request.body.contentType
            : undefined;
  if (
    bodyContentType !== undefined &&
    !headers.some((header) => header.name.toLowerCase() === "content-type")
  ) {
    // cURL sends this media type for -d/--data even when the user does not
    // spell out the header. Include that protocol effect during comparison.
    headers.push({
      name: "Content-Type",
      value: bodyContentType,
    });
  }
  return headers;
}

export function normalizeRequest(request: HttpRequest): unknown {
  return {
    method: request.method.toUpperCase(),
    url: request.url,
    query: request.query,
    headers: effectiveHeaders(request).map(({ name, value }) => ({
      name: name.toLowerCase(),
      value,
    })),
    cookies: request.cookies,
    auth: request.auth,
    body: normalizeBody(request.body),
    options: request.options,
  };
}

export function requestsAreSemanticallyEqual(
  left: HttpRequest,
  right: HttpRequest,
): boolean {
  return (
    JSON.stringify(normalizeRequest(left)) ===
    JSON.stringify(normalizeRequest(right))
  );
}
