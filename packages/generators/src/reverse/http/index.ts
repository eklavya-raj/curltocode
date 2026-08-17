import { RequestBuilder } from "../shared/assemble.js";
import { CodeParseError } from "../types.js";
import type { ReverseParseResult } from "../types.js";

/**
 * Read a raw HTTP/1.1 request message back into the normalized request model.
 *
 * Unlike every other reverse parser here there is no source language to
 * analyse: the message *is* the request, so this reads it directly instead of
 * resolving bindings. Both LF and CRLF are accepted, since a message pasted
 * from a terminal, a proxy log, or this site's own output may use either.
 *
 * One thing a request message cannot carry is redirect policy. Following a 3xx
 * is a decision the client makes after the response arrives, so there is no
 * field for it here and the recovered request keeps cURL's own default of not
 * following.
 */

const REQUEST_LINE =
  /^([A-Za-z!#$%&'*+.^_`|~-]+)[ \t]+(\S+)(?:[ \t]+HTTP\/(\d(?:\.\d)?))?[ \t]*$/u;

/** Split a message into its header section and body on the first blank line. */
function splitMessage(source: string): {
  readonly head: string;
  readonly body: string | undefined;
} {
  const normalized = source.replaceAll("\r\n", "\n");
  const separator = normalized.indexOf("\n\n");
  if (separator < 0) return { head: normalized.trimEnd(), body: undefined };
  const body = normalized.slice(separator + 2);
  return {
    head: normalized.slice(0, separator),
    // A message may end with the blank line and send nothing after it.
    body: body.length === 0 ? undefined : body,
  };
}

/**
 * Unfold the obsolete line-continuation form before headers are read.
 *
 * RFC 9112 deprecates it, but it still turns up in captured traffic, and
 * treating a continuation line as a header would lose the value silently.
 */
function unfold(lines: readonly string[]): readonly string[] {
  const unfolded: string[] = [];
  for (const line of lines) {
    if (/^[ \t]/u.test(line) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += ` ${line.trim()}`;
      continue;
    }
    unfolded.push(line);
  }
  return unfolded;
}

function parseMultipart(
  body: string,
  boundary: string,
): readonly { readonly name: string; readonly value: string }[] | undefined {
  const parts: { name: string; value: string }[] = [];
  const segments = body.split(`--${boundary}`);
  for (const segment of segments) {
    if (segment.trim().length === 0 || segment.trimStart().startsWith("--"))
      continue;
    const separator = segment.replace(/^\n/u, "").indexOf("\n\n");
    if (separator < 0) return undefined;
    const withoutLeading = segment.replace(/^\n/u, "");
    const head = withoutLeading.slice(0, separator);
    const name = /name="([^"]*)"/u.exec(head)?.[1];
    if (name === undefined) return undefined;
    // Each part is terminated by the newline that precedes its next delimiter.
    parts.push({
      name,
      value: withoutLeading.slice(separator + 2).replace(/\n$/u, ""),
    });
  }
  return parts.length === 0 ? undefined : parts;
}

/**
 * Choose the scheme the message does not state.
 *
 * TLS is transport, not message content, so a request line never names it and
 * it has to be decided here. An explicit `:443` or a forwarding header settles
 * it outright. Failing that, a loopback or explicitly-ported authority reads as
 * plain HTTP, which is what local development actually serves, and any other
 * host reads as HTTPS, which is what a captured public request effectively
 * always came from.
 */
function inferScheme(host: string, forwarded: string | undefined): string {
  if (forwarded !== undefined) return forwarded;
  const separator = host.lastIndexOf(":");
  // A bracketed IPv6 literal has colons of its own; only a port may follow.
  const port =
    separator > host.lastIndexOf("]") && separator >= 0
      ? host.slice(separator + 1)
      : undefined;
  if (port === "443") return "https";
  if (port !== undefined) return "http";
  const name = host.toLowerCase();
  return name === "localhost" ||
    name.endsWith(".localhost") ||
    name.endsWith(".local") ||
    name === "[::1]" ||
    /^127\.\d+\.\d+\.\d+$/u.test(name)
    ? "http"
    : "https";
}

/** True when the source opens with something that reads as a request line. */
export function looksLikeHttpMessage(source: string): boolean {
  const first = source.trim().split(/\r?\n/u)[0] ?? "";
  const match = REQUEST_LINE.exec(first);
  // The HTTP version is what separates a request line from an ordinary
  // sentence or a shell command that happens to start with a bare word.
  return match?.[3] !== undefined;
}

export function parseHttpMessageRequest(source: string): ReverseParseResult {
  const { head, body } = splitMessage(source.trim());
  const lines = unfold(head.split("\n").filter((line) => line.length > 0));
  const requestLine = lines[0] ?? "";
  const match = REQUEST_LINE.exec(requestLine);
  if (match === null) {
    throw new CodeParseError(
      "No HTTP request line was found. A raw request starts with a line such as `GET /path HTTP/1.1`.",
    );
  }
  const [, method = "GET", target = "/"] = match;

  const builder = new RequestBuilder("raw");
  builder.method = method.toUpperCase();
  // A raw message states no redirect policy, so the recovered request keeps
  // cURL's default rather than inventing one.
  builder.followRedirects = false;

  let host: string | undefined;
  let forwardedScheme: string | undefined;
  let contentType: string | undefined;
  for (const line of lines.slice(1)) {
    const separator = line.indexOf(":");
    if (separator <= 0) {
      throw new CodeParseError(
        `This line is neither a request line nor a header: ${line.trim()}`,
      );
    }
    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (name.toLowerCase() === "host") {
      host = value;
      continue;
    }
    if (name.toLowerCase() === "content-type") contentType = value;
    // Length is a framing detail of the message, recomputed on the way out.
    if (name.toLowerCase() === "content-length") continue;
    // A forwarded scheme is the only header that states outright which
    // transport the original request arrived over.
    if (
      name.toLowerCase() === "x-forwarded-proto" &&
      (value === "https" || value === "http")
    ) {
      forwardedScheme = value;
      continue;
    }
    builder.header(name, value);
  }

  if (/^https?:\/\//iu.test(target)) {
    // Absolute-form, as sent to a proxy: the target already carries authority.
    builder.url = target;
  } else if (host === undefined) {
    throw new CodeParseError(
      "This request has no Host header and a relative target, so its URL cannot be reconstructed. Add a Host header, or write the request line with a full URL.",
    );
  } else {
    const scheme = inferScheme(host, forwardedScheme);
    builder.url = `${scheme}://${host}${target.startsWith("/") ? target : `/${target}`}`;
  }

  const boundary = /boundary=("?)([^";]+)\1/u.exec(contentType ?? "")?.[2];
  if (body !== undefined && boundary !== undefined) {
    const parts = parseMultipart(body, boundary);
    if (parts === undefined) {
      throw new CodeParseError(
        "This message declares a multipart body, but its parts could not be read. Each part needs a Content-Disposition line naming the field.",
      );
    }
    builder.parts.push(...parts);
    // The boundary is framing that belongs to this message rather than to the
    // request, and the multipart body already says what the media type is, so
    // the declaration is dropped instead of carried forward with a stale
    // boundary the next generator would not use.
    const index = builder.headers.findIndex(
      (header) => header.name.toLowerCase() === "content-type",
    );
    if (index >= 0) builder.headers.splice(index, 1);
  } else if (body !== undefined) {
    builder.bodyText = body;
  }

  return builder.build();
}
