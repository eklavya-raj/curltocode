import { requestUrl } from "@curltocode/core";
import type { HttpRequest } from "@curltocode/core";

import { hasDuplicateHeaderNames, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { rString } from "./literal.js";

/**
 * An R name used as an argument label. Backticks let any header name through,
 * including the ones with hyphens that R would otherwise reject.
 */
const rLabel = (name: string): string => `\`${name.replaceAll("`", "")}\``;

function headersOrThrow(request: HttpRequest, client: string) {
  const headers = materializeHeaders(request, {
    basicAuthHeader: false,
    cookieHeader: true,
  });
  if (hasDuplicateHeaderNames(headers)) {
    throw new GeneratorError(
      `${client} collects request headers by name, so a repeated header name cannot be relied on to be sent twice.`,
      "GENERATOR_DUPLICATE_HEADERS",
    );
  }
  return headers;
}

/** R with httr2, the current client. */
export class Httr2Generator implements CodeGenerator {
  readonly id = "r-httr2" as const;
  readonly language = "r" as const;
  readonly client = "httr2" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = headersOrThrow(request, "httr2");
    const body = request.body;
    const steps = [`  req_method(${rString(request.method)})`];
    const applicable =
      body?.kind === "multipart"
        ? headers.filter(
            (header) => header.name.toLowerCase() !== "content-type",
          )
        : headers;
    if (applicable.length > 0) {
      steps.push(
        [
          "  req_headers(",
          ...applicable.map(
            ({ name, value }) => `    ${rLabel(name)} = ${rString(value)},`,
          ),
          "  )",
        ].join("\n"),
      );
    }
    if (request.auth?.kind === "basic") {
      steps.push(
        `  req_auth_basic(${rString(request.auth.username)}, ${rString(request.auth.password)})`,
      );
    }
    const contentType =
      headers.find((header) => header.name.toLowerCase() === "content-type")
        ?.value ?? "application/octet-stream";
    if (body?.kind === "multipart") {
      const fields = body.parts.map((part) => {
        if (part.kind === "field") {
          return `    ${rLabel(part.name)} = ${rString(part.value)},`;
        }
        const filename =
          part.filename ?? part.path.split("/").at(-1) ?? part.path;
        const type =
          part.contentType === undefined
            ? ""
            : `, type = ${rString(part.contentType)}`;
        return `    ${rLabel(part.name)} = curl::form_file(${rString(part.path)}${type}, name = ${rString(filename)}),`;
      });
      steps.push(["  req_body_multipart(", ...fields, "  )"].join("\n"));
    } else if (body?.kind === "binary" && body.source.kind === "file") {
      steps.push(
        `  req_body_file(${rString(body.source.path)}, type = ${rString(contentType)})`,
      );
    } else if (body !== undefined) {
      const payload =
        body.kind === "json" || body.kind === "form-urlencoded"
          ? body.raw
          : body.kind === "text"
            ? body.value
            : body.kind === "binary" && body.source.kind === "inline"
              ? body.source.value
              : "";
      steps.push(
        `  req_body_raw(${rString(payload)}, type = ${rString(contentType)})`,
      );
    }
    steps.push(
      `  req_options(followlocation = ${request.options.followRedirects ? "TRUE" : "FALSE"})`,
      // httr2 raises on a non-2xx by default; cURL prints whatever came back.
      "  req_error(is_error = function(resp) FALSE)",
    );

    return {
      code: [
        "library(httr2)",
        "",
        `request <- request(${rString(requestUrl(request))}) |>`,
        steps.join(" |>\n"),
        "",
        "response <- req_perform(request)",
        "cat(resp_body_string(response))",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: 'install.packages("httr2")',
    };
  }
}

/** R with httr, still what most published analysis code uses. */
export class HttrGenerator implements CodeGenerator {
  readonly id = "r-httr" as const;
  readonly language = "r" as const;
  readonly client = "httr" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = headersOrThrow(request, "httr");
    const body = request.body;
    const arguments_ = [
      `  ${rString(request.method)},`,
      `  url = ${rString(requestUrl(request))},`,
    ];
    const applicable =
      body?.kind === "multipart"
        ? headers.filter(
            (header) => header.name.toLowerCase() !== "content-type",
          )
        : headers;
    if (applicable.length > 0) {
      arguments_.push(
        "  add_headers(",
        ...applicable.map(
          ({ name, value }) => `    ${rLabel(name)} = ${rString(value)},`,
        ),
        "  ),",
      );
    }
    if (request.auth?.kind === "basic") {
      arguments_.push(
        `  authenticate(${rString(request.auth.username)}, ${rString(request.auth.password)}),`,
      );
    }
    const contentType =
      headers.find((header) => header.name.toLowerCase() === "content-type")
        ?.value ?? "application/octet-stream";
    if (body?.kind === "multipart") {
      arguments_.push("  body = list(");
      for (const part of body.parts) {
        if (part.kind === "field") {
          arguments_.push(`    ${rLabel(part.name)} = ${rString(part.value)},`);
          continue;
        }
        const type =
          part.contentType === undefined
            ? ""
            : `, type = ${rString(part.contentType)}`;
        arguments_.push(
          `    ${rLabel(part.name)} = upload_file(${rString(part.path)}${type}),`,
        );
      }
      arguments_.push("  ),", '  encode = "multipart",');
    } else if (body?.kind === "binary" && body.source.kind === "file") {
      arguments_.push(
        `  body = upload_file(${rString(body.source.path)}, type = ${rString(contentType)}),`,
        '  encode = "raw",',
      );
    } else if (body !== undefined) {
      const payload =
        body.kind === "json" || body.kind === "form-urlencoded"
          ? body.raw
          : body.kind === "text"
            ? body.value
            : body.kind === "binary" && body.source.kind === "inline"
              ? body.source.value
              : "";
      arguments_.push(
        `  body = ${rString(payload)},`,
        '  encode = "raw",',
        `  content_type(${rString(contentType)}),`,
      );
    }
    arguments_.push(
      `  config(followlocation = ${request.options.followRedirects ? "TRUE" : "FALSE"})`,
    );

    return {
      code: [
        "library(httr)",
        "",
        "response <- VERB(",
        ...arguments_,
        ")",
        "",
        'cat(content(response, "text", encoding = "UTF-8"))',
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: 'install.packages("httr")',
    };
  }
}
