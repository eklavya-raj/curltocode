import type { Header, HttpRequest } from "@curltocode/core";

const BASE64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function utf8Bytes(value: string): readonly number[] {
  return Array.from(new TextEncoder().encode(value));
}

function base64(value: string): string {
  const bytes = utf8Bytes(value);
  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const block = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    result += BASE64[(block >> 18) & 63] ?? "";
    result += BASE64[(block >> 12) & 63] ?? "";
    result += second === undefined ? "=" : (BASE64[(block >> 6) & 63] ?? "");
    result += third === undefined ? "=" : (BASE64[block & 63] ?? "");
  }
  return result;
}

export function hasHeader(headers: readonly Header[], name: string): boolean {
  return headers.some(
    (header) => header.name.toLowerCase() === name.toLowerCase(),
  );
}

export function materializeHeaders(
  request: HttpRequest,
  options: {
    readonly basicAuthHeader: boolean;
    readonly cookieHeader: boolean;
  },
): readonly Header[] {
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
  if (bodyContentType !== undefined && !hasHeader(headers, "content-type")) {
    headers.push({
      name: "Content-Type",
      value: bodyContentType,
    });
  }
  if (
    options.basicAuthHeader &&
    request.auth?.kind === "basic" &&
    !hasHeader(headers, "authorization")
  ) {
    headers.push({
      name: "Authorization",
      value: `Basic ${base64(`${request.auth.username}:${request.auth.password}`)}`,
    });
  }
  if (request.auth?.kind === "bearer" && !hasHeader(headers, "authorization")) {
    headers.push({
      name: "Authorization",
      value: `Bearer ${request.auth.token}`,
    });
  }
  if (
    options.cookieHeader &&
    request.cookies.length > 0 &&
    !hasHeader(headers, "cookie")
  ) {
    headers.push({
      name: "Cookie",
      value: request.cookies
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join("; "),
    });
  }
  return headers;
}

export function hasDuplicateHeaderNames(headers: readonly Header[]): boolean {
  const names = new Set<string>();
  return headers.some((header) => {
    const name = header.name.toLowerCase();
    if (names.has(name)) return true;
    names.add(name);
    return false;
  });
}
