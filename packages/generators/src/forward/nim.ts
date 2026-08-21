import { requestUrl } from "@curltocode/core";
import type { HttpRequest } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { nimString } from "./literal.js";

/** Nim's own default redirect budget. */
const DEFAULT_MAX_REDIRECTS = 5;

/**
 * Nim with `std/httpclient`, which is in the standard library.
 *
 * `HttpHeaders` stores a sequence per name, so `add` keeps a repeated header
 * rather than replacing it.
 */
export class NimHttpClientGenerator implements CodeGenerator {
  readonly id = "nim-httpclient" as const;
  readonly language = "nim" as const;
  readonly client = "httpclient" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    const body = request.body;
    // readFile is a system proc, so no import beyond the client is ever needed.
    const imports = ["std/httpclient"];
    const lines: string[] = [];

    const applicable =
      body?.kind === "multipart"
        ? // newMultipartData writes the Content-Type with its own boundary.
          headers.filter(
            (header) => header.name.toLowerCase() !== "content-type",
          )
        : headers;
    if (applicable.length > 0) {
      lines.push("client.headers = newHttpHeaders()");
      for (const header of applicable) {
        lines.push(
          `client.headers.add(${nimString(header.name)}, ${nimString(header.value)})`,
        );
      }
      lines.push("");
    }

    const callArguments = [
      `  ${nimString(requestUrl(request))},`,
      `  httpMethod = ${nimString(request.method)},`,
    ];
    if (body?.kind === "multipart") {
      lines.push("var data = newMultipartData()");
      for (const part of body.parts) {
        if (part.kind === "field") {
          lines.push(
            `data[${nimString(part.name)}] = ${nimString(part.value)}`,
          );
          continue;
        }
        const filename =
          part.filename ?? part.path.split("/").at(-1) ?? part.path;
        lines.push(
          part.contentType === undefined
            ? `data.addFiles({${nimString(part.name)}: ${nimString(part.path)}})`
            : // addFiles guesses the media type from the extension, so a
              // declared type needs the explicit three-field form.
              `data[${nimString(part.name)}] = (${nimString(filename)}, ${nimString(part.contentType)}, readFile(${nimString(part.path)}))`,
        );
      }
      lines.push("");
      callArguments.push("  multipart = data,");
    } else if (body?.kind === "binary" && body.source.kind === "file") {
      callArguments.push(`  body = readFile(${nimString(body.source.path)}),`);
    } else if (body !== undefined) {
      const payload =
        body.kind === "json" || body.kind === "form-urlencoded"
          ? body.raw
          : body.kind === "text"
            ? body.value
            : body.kind === "binary" && body.source.kind === "inline"
              ? body.source.value
              : "";
      callArguments.push(`  body = ${nimString(payload)},`);
    }

    return {
      code: [
        ...imports.map((entry) => `import ${entry}`),
        "",
        `let client = newHttpClient(maxRedirects = ${request.options.followRedirects ? DEFAULT_MAX_REDIRECTS : 0})`,
        "",
        ...lines,
        "let response = client.request(",
        ...callArguments,
        ")",
        "",
        "echo response.body",
      ].join("\n"),
      language: this.language,
      client: this.client,
    };
  }
}
