import { requestUrl } from "@curltocode/core";
import type { HttpRequest } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { juliaString } from "./literal.js";

/**
 * Julia with HTTP.jl.
 *
 * Headers are a vector of pairs, so a repeated name is sent twice rather than
 * replaced.
 */
export class JuliaHttpGenerator implements CodeGenerator {
  readonly id = "julia-http" as const;
  readonly language = "julia" as const;
  readonly client = "http" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    const body = request.body;
    const applicable =
      body?.kind === "multipart"
        ? headers.filter(
            (header) => header.name.toLowerCase() !== "content-type",
          )
        : headers;

    const prelude: string[] = [];
    let payload = '""';
    if (body?.kind === "multipart") {
      prelude.push("form = HTTP.Form([");
      for (const part of body.parts) {
        if (part.kind === "field") {
          prelude.push(
            `    ${juliaString(part.name)} => ${juliaString(part.value)},`,
          );
          continue;
        }
        const filename =
          part.filename ?? part.path.split("/").at(-1) ?? part.path;
        const type =
          part.contentType === undefined
            ? ""
            : `, ${juliaString(part.contentType)}`;
        prelude.push(
          `    ${juliaString(part.name)} => HTTP.Multipart(${juliaString(filename)}, open(${juliaString(part.path)}, "r")${type}),`,
        );
      }
      prelude.push("])", "");
      payload = "form";
    } else if (body?.kind === "binary" && body.source.kind === "file") {
      payload = `open(${juliaString(body.source.path)}, "r")`;
    } else if (body !== undefined) {
      payload = juliaString(
        body.kind === "json" || body.kind === "form-urlencoded"
          ? body.raw
          : body.kind === "text"
            ? body.value
            : body.kind === "binary" && body.source.kind === "inline"
              ? body.source.value
              : "",
      );
    }

    return {
      code: [
        "using HTTP",
        "",
        ...prelude,
        "response = HTTP.request(",
        `    ${juliaString(request.method)},`,
        `    ${juliaString(requestUrl(request))},`,
        ...(applicable.length === 0
          ? ["    [],"]
          : [
              "    [",
              ...applicable.map(
                ({ name, value }) =>
                  `        ${juliaString(name)} => ${juliaString(value)},`,
              ),
              "    ],",
            ]),
        `    ${payload};`,
        `    redirect = ${request.options.followRedirects},`,
        // HTTP.jl raises on a non-2xx by default; cURL prints the response.
        "    status_exception = false,",
        ")",
        "",
        "println(String(response.body))",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: 'using Pkg; Pkg.add("HTTP")',
    };
  }
}
