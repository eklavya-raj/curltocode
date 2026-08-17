import { requestUrl } from "@curltocode/core";
import type { HttpRequest, RequestBody } from "@curltocode/core";

import { hasHeader, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";

/**
 * The raw HTTP/1.1 request message, rendered rather than programmed.
 *
 * This target has no client library, so there is nothing to translate the
 * request into: the output is the request. That makes it the one generator that
 * can show what every other target is ultimately producing on the wire.
 *
 * Line endings are LF. RFC 9112 specifies CRLF, and a strict server will insist
 * on it, but this output exists to be read and pasted into documentation, and a
 * carriage return survives neither a browser textarea nor a Markdown fence
 * intact. `Content-Length` counts the body only, which is unaffected either way,
 * so the message stays internally consistent. The reverse parser reads both.
 */

/**
 * A fixed boundary keeps generation deterministic, which the registry-wide
 * tests require. Real clients randomize it to avoid colliding with the payload;
 * that collision is checked for explicitly below instead.
 */
const MULTIPART_BOUNDARY = "----CurlToCodeBoundary7MA4YWxkTrZu0gW";

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

function multipartText(body: Extract<RequestBody, { kind: "multipart" }>) {
  const lines: string[] = [];
  for (const part of body.parts) {
    if (part.kind === "file") {
      throw new GeneratorError(
        "A raw HTTP message has to contain the bytes it sends, and the contents of a local file are not known here. Inline the file's contents, or pick a client target that can read the path at runtime.",
        "GENERATOR_FILE_REFERENCE",
      );
    }
    if (part.value.includes(MULTIPART_BOUNDARY)) {
      throw new GeneratorError(
        `The multipart field ${part.name} contains the boundary delimiter, so no valid message can be written with it.`,
        "GENERATOR_UNSUPPORTED_BODY",
      );
    }
    lines.push(
      `--${MULTIPART_BOUNDARY}`,
      `Content-Disposition: form-data; name="${part.name}"`,
      "",
      part.value,
    );
  }
  lines.push(`--${MULTIPART_BOUNDARY}--`, "");
  return lines.join("\n");
}

function bodyText(body: RequestBody | undefined): string | undefined {
  if (body === undefined) return undefined;
  if (body.kind === "json" || body.kind === "form-urlencoded") return body.raw;
  if (body.kind === "text") return body.value;
  if (body.kind === "multipart") return multipartText(body);
  if (body.source.kind === "file") {
    throw new GeneratorError(
      "A raw HTTP message has to contain the bytes it sends, and the contents of a local file are not known here. Inline the payload, or pick a client target that can read the path at runtime.",
      "GENERATOR_FILE_REFERENCE",
    );
  }
  return body.source.value;
}

export class HttpMessageGenerator implements CodeGenerator {
  readonly id = "http-raw" as const;
  readonly language = "http" as const;
  readonly client = "raw" as const;

  generate(request: HttpRequest): GeneratedCode {
    const url = new URL(requestUrl(request));
    const materialized = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    const body = bodyText(request.body);

    // An explicit Host header wins over the authority in the URL, but it is
    // still written on the conventional first line rather than twice.
    const host =
      materialized.find((header) => header.name.toLowerCase() === "host")
        ?.value ?? url.host;
    // A multipart body is delimited by a boundary this generator chooses, so
    // its Content-Type is rewritten below. Any inbound one is dropped rather
    // than emitted alongside, which would leave two conflicting declarations.
    const multipart = request.body?.kind === "multipart";
    const headers = materialized.filter(
      (header) =>
        header.name.toLowerCase() !== "host" &&
        !(multipart && header.name.toLowerCase() === "content-type"),
    );

    // Origin-form: the request line carries the path, the authority moves to
    // the Host header. This is what a client actually puts on the wire.
    const target = `${url.pathname}${url.search}`;
    const lines = [`${request.method} ${target} HTTP/1.1`, `Host: ${host}`];
    for (const header of headers) lines.push(`${header.name}: ${header.value}`);
    if (multipart) {
      lines.push(
        `Content-Type: multipart/form-data; boundary=${MULTIPART_BOUNDARY}`,
      );
    }
    if (body !== undefined && !hasHeader(headers, "content-length")) {
      lines.push(`Content-Length: ${utf8Length(body)}`);
    }
    lines.push("", body ?? "");

    return {
      code: lines.join("\n"),
      language: this.language,
      client: this.client,
    };
  }
}
