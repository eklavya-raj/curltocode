import { requestUrl } from "@curltocode/core";
import type { HttpRequest } from "@curltocode/core";

import { hasHeader } from "./headers.js";
import { GeneratorError } from "./types.js";

export interface GeneratedCurl {
  readonly code: string;
  readonly shell: "posix";
}

export function quoteShell(value: string): string {
  if (value.includes("\0")) {
    throw new GeneratorError(
      "POSIX shell arguments cannot contain a null byte, so this request cannot be represented as a cURL command.",
      "GENERATOR_SHELL_LIMITATION",
    );
  }
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function generateCurl(request: HttpRequest): GeneratedCurl {
  const parts = [`curl ${quoteShell(requestUrl(request))}`];
  if (request.method !== "GET") parts.push(`-X ${request.method}`);
  if (request.options.followRedirects) parts.push("-L");
  for (const header of request.headers)
    parts.push(`-H ${quoteShell(`${header.name}: ${header.value}`)}`);
  const body = request.body;
  const implicitCurlContentType =
    body?.kind === "form-urlencoded" || body?.kind === "binary"
      ? "application/x-www-form-urlencoded"
      : undefined;
  const bodyContentType =
    body?.kind === "json"
      ? "application/json"
      : body?.kind === "text"
        ? (body.contentType ?? "text/plain;charset=UTF-8")
        : body?.kind === "binary"
          ? body.contentType
          : body?.kind === "form-urlencoded"
            ? "application/x-www-form-urlencoded"
            : undefined;
  if (
    bodyContentType !== undefined &&
    bodyContentType !== implicitCurlContentType &&
    !hasHeader(request.headers, "content-type")
  ) {
    parts.push(`-H ${quoteShell(`Content-Type: ${bodyContentType}`)}`);
  }
  if (request.auth?.kind === "basic") {
    parts.push(
      `-u ${quoteShell(`${request.auth.username}:${request.auth.password}`)}`,
    );
  } else if (
    request.auth?.kind === "bearer" &&
    !hasHeader(request.headers, "authorization")
  ) {
    parts.push(
      `-H ${quoteShell(`Authorization: Bearer ${request.auth.token}`)}`,
    );
  }
  if (request.cookies.length > 0 && !hasHeader(request.headers, "cookie")) {
    parts.push(
      `-b ${quoteShell(request.cookies.map(({ name, value }) => `${name}=${value}`).join("; "))}`,
    );
  }
  if (body?.kind === "json") parts.push(`--data-raw ${quoteShell(body.raw)}`);
  else if (body?.kind === "text")
    parts.push(`--data-raw ${quoteShell(body.value)}`);
  else if (body?.kind === "form-urlencoded") {
    parts.push(`--data-raw ${quoteShell(body.raw)}`);
  } else if (body?.kind === "binary") {
    parts.push(
      `--data-binary ${quoteShell(body.source.kind === "file" ? `@${body.source.path}` : body.source.value)}`,
    );
  } else if (body?.kind === "multipart") {
    for (const part of body.parts) {
      if (part.kind === "field")
        parts.push(`-F ${quoteShell(`${part.name}=${part.value}`)}`);
      else {
        const metadata = [
          part.contentType === undefined ? "" : `;type=${part.contentType}`,
          part.filename === undefined ? "" : `;filename=${part.filename}`,
        ].join("");
        parts.push(`-F ${quoteShell(`${part.name}=@${part.path}${metadata}`)}`);
      }
    }
  }
  return { code: parts.join(" \\\n  "), shell: "posix" };
}
