import type { Cookie, Header, RequestAuth } from "@curltocode/core";

/**
 * Header post-processing shared by every reverse parser.
 *
 * The normalized request model keeps cookies and credentials in their own
 * fields rather than as raw headers, so whichever language a request was
 * recovered from, `Cookie` and `Authorization` are split out the same way. This
 * lives here rather than in one language's parser so a second language cannot
 * drift from the first.
 */

export function decodeBasic(value: string): RequestAuth | undefined {
  if (!value.toLowerCase().startsWith("basic ")) return undefined;
  try {
    const bytes = Uint8Array.from(atob(value.slice(6)), (character) =>
      character.charCodeAt(0),
    );
    const decoded = new TextDecoder().decode(bytes);
    const separator = decoded.indexOf(":");
    return {
      kind: "basic",
      username: separator < 0 ? decoded : decoded.slice(0, separator),
      password: separator < 0 ? "" : decoded.slice(separator + 1),
    };
  } catch {
    return undefined;
  }
}

export function normalizeHeaders(headers: readonly Header[]): {
  readonly headers: readonly Header[];
  readonly cookies: readonly Cookie[];
  readonly auth?: RequestAuth;
} {
  const normalized: Header[] = [];
  const cookies: Cookie[] = [];
  let auth: RequestAuth | undefined;
  for (const header of headers) {
    const name = header.name.toLowerCase();
    if (name === "cookie") {
      for (const part of header.value.split(";")) {
        const separator = part.indexOf("=");
        const cookieName = (
          separator < 0 ? part : part.slice(0, separator)
        ).trim();
        if (cookieName.length > 0) {
          cookies.push({
            name: cookieName,
            value: separator < 0 ? "" : part.slice(separator + 1).trim(),
          });
        }
      }
    } else if (
      name === "authorization" &&
      header.value.toLowerCase().startsWith("bearer ") &&
      auth === undefined
    ) {
      auth = { kind: "bearer", token: header.value.slice(7) };
    } else if (name === "authorization" && auth === undefined) {
      const basic = decodeBasic(header.value);
      if (basic === undefined) normalized.push(header);
      else auth = basic;
    } else {
      normalized.push(header);
    }
  }
  return {
    headers: normalized,
    cookies,
    ...(auth === undefined ? {} : { auth }),
  };
}
