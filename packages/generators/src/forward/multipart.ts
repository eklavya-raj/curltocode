import type { MultipartPart } from "@curltocode/core";

import { GeneratorError } from "../types.js";

/**
 * Shared pieces for the targets whose client library has no multipart encoder,
 * so the message has to be written out byte for byte.
 *
 * A fixed boundary keeps generation deterministic, which the registry-wide
 * tests require. Real clients randomize it to avoid colliding with the payload;
 * that collision is checked for explicitly instead.
 */
export const MULTIPART_BOUNDARY = "----CurlToCodeBoundary7MA4YWxkTrZu0gW";

/**
 * Build a part's `Content-Disposition` line.
 *
 * RFC 6266 quoting has no escape sequence that every server agrees on, so a
 * name or filename containing a quote, a backslash, or a line break is refused
 * rather than written into a header that different servers would read
 * differently.
 */
export function multipartDisposition(name: string, filename?: string): string {
  const unquotable = /["\\\r\n]/u;
  if (
    unquotable.test(name) ||
    (filename !== undefined && unquotable.test(filename))
  ) {
    throw new GeneratorError(
      `A multipart part name or filename containing a quote, backslash, or line break cannot be written into a Content-Disposition header unambiguously: ${filename ?? name}`,
      "GENERATOR_UNSUPPORTED_BODY",
    );
  }
  const file = filename === undefined ? "" : `; filename="${filename}"`;
  return `Content-Disposition: form-data; name="${name}"${file}`;
}

/** The header block introducing one part, terminated by the blank line. */
export function multipartPartHeader(part: MultipartPart): string {
  const filename =
    part.kind === "file"
      ? (part.filename ?? part.path.split("/").at(-1) ?? part.path)
      : undefined;
  const lines = [
    `--${MULTIPART_BOUNDARY}`,
    multipartDisposition(part.name, filename),
  ];
  if (part.kind === "file" && part.contentType !== undefined) {
    lines.push(`Content-Type: ${part.contentType}`);
  }
  return `${lines.join("\r\n")}\r\n\r\n`;
}

/** Reject a field whose value would terminate the message early. */
export function assertNoBoundaryCollision(name: string, value: string): void {
  if (value.includes(MULTIPART_BOUNDARY)) {
    throw new GeneratorError(
      `The multipart field ${name} contains the boundary delimiter, so no valid message can be written with it.`,
      "GENERATOR_UNSUPPORTED_BODY",
    );
  }
}

/** The closing delimiter that ends a multipart body. */
export const MULTIPART_EPILOGUE = `--${MULTIPART_BOUNDARY}--\r\n`;

/** The Content-Type a hand-built multipart body must declare. */
export const MULTIPART_CONTENT_TYPE = `multipart/form-data; boundary=${MULTIPART_BOUNDARY}`;
