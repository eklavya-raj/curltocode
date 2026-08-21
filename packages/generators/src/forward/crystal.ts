import { requestUrl } from "@curltocode/core";
import type { HttpRequest } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { rubyString } from "./literal.js";

/**
 * Crystal with `HTTP::Client` from the standard library.
 *
 * `HTTP::Headers#add` appends, so a repeated header name survives. The client
 * does not follow redirects at all, which is why `-L` is refused.
 */
export class CrystalHttpClientGenerator implements CodeGenerator {
  readonly id = "crystal-httpclient" as const;
  readonly language = "crystal" as const;
  readonly client = "httpclient" as const;

  generate(request: HttpRequest): GeneratedCode {
    if (request.options.followRedirects) {
      throw new GeneratorError(
        "Crystal's HTTP::Client does not follow redirects; a 3xx response has to be re-requested by hand.",
        "GENERATOR_CLIENT_LIMITATION",
      );
    }
    const materialized = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    const body = request.body;
    const requires = new Set(["http/client"]);
    const lines: string[] = [];

    const applicable =
      body?.kind === "multipart"
        ? materialized.filter(
            (header) => header.name.toLowerCase() !== "content-type",
          )
        : materialized;

    lines.push("headers = HTTP::Headers.new");
    for (const header of applicable) {
      lines.push(
        `headers.add(${rubyString(header.name)}, ${rubyString(header.value)})`,
      );
    }
    lines.push("");

    let bodyExpression: string | undefined;
    if (body?.kind === "multipart") {
      requires.add("http/formdata");
      lines.push(
        "io = IO::Memory.new",
        "content_type = HTTP::FormData.build(io) do |formdata|",
      );
      for (const part of body.parts) {
        if (part.kind === "field") {
          lines.push(
            `  formdata.field(${rubyString(part.name)}, ${rubyString(part.value)})`,
          );
          continue;
        }
        const filename =
          part.filename ?? part.path.split("/").at(-1) ?? part.path;
        const metadata = `HTTP::FormData::FileMetadata.new(filename: ${rubyString(filename)})`;
        const partHeaders =
          part.contentType === undefined
            ? ""
            : `, HTTP::Headers{"Content-Type" => ${rubyString(part.contentType)}}`;
        lines.push(
          `  File.open(${rubyString(part.path)}) do |file|`,
          `    formdata.file(${rubyString(part.name)}, file, ${metadata}${partHeaders})`,
          "  end",
        );
      }
      lines.push("end", "", 'headers["Content-Type"] = content_type', "");
      bodyExpression = "io.to_s";
    } else if (body?.kind === "binary" && body.source.kind === "file") {
      bodyExpression = `File.read(${rubyString(body.source.path)})`;
    } else if (body !== undefined) {
      bodyExpression = rubyString(
        body.kind === "json" || body.kind === "form-urlencoded"
          ? body.raw
          : body.kind === "text"
            ? body.value
            : body.kind === "binary" && body.source.kind === "inline"
              ? body.source.value
              : "",
      );
    }

    const callArguments = [
      `  ${rubyString(request.method)},`,
      `  ${rubyString(requestUrl(request))},`,
      "  headers: headers,",
    ];
    if (bodyExpression !== undefined) {
      callArguments.push(`  body: ${bodyExpression},`);
    }

    return {
      code: [
        ...[...requires].sort().map((entry) => `require ${rubyString(entry)}`),
        "",
        ...lines,
        "response = HTTP::Client.exec(",
        ...callArguments,
        ")",
        "",
        "puts response.body",
      ].join("\n"),
      language: this.language,
      client: this.client,
    };
  }
}
