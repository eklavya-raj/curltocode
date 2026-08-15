import { requestUrl } from "@curltocode/core";
import type { HttpRequest, RequestBody } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { rubyString } from "./literal.js";

/** Request classes that ship with Ruby's Net::HTTP. */
const REQUEST_CLASSES: Readonly<Record<string, string>> = {
  GET: "Get",
  HEAD: "Head",
  POST: "Post",
  PUT: "Put",
  DELETE: "Delete",
  PATCH: "Patch",
  OPTIONS: "Options",
  TRACE: "Trace",
};

function bodyLines(body: RequestBody | undefined): readonly string[] {
  if (body === undefined) return [];
  if (body.kind === "json" || body.kind === "form-urlencoded")
    return [`request.body = ${rubyString(body.raw)}`];
  if (body.kind === "text") return [`request.body = ${rubyString(body.value)}`];
  if (body.kind === "multipart") {
    const parts = body.parts.map((part) => {
      if (part.kind === "field")
        return `[${rubyString(part.name)}, ${rubyString(part.value)}]`;
      const filename =
        part.filename ?? part.path.split("/").at(-1) ?? part.path;
      const metadata = [`filename: ${rubyString(filename)}`];
      if (part.contentType !== undefined)
        metadata.push(`content_type: ${rubyString(part.contentType)}`);
      return `[${rubyString(part.name)}, File.open(${rubyString(part.path)}), { ${metadata.join(", ")} }]`;
    });
    return [
      "request.set_form(",
      "  [",
      ...parts.map((part) => `    ${part},`),
      "  ],",
      '  "multipart/form-data",',
      ")",
    ];
  }
  if (body.source.kind === "inline")
    return [`request.body = ${rubyString(body.source.value)}`];
  return [`request.body = File.binread(${rubyString(body.source.path)})`];
}

export class RubyGenerator implements CodeGenerator {
  readonly id = "ruby-nethttp" as const;
  readonly language = "ruby" as const;
  readonly client = "nethttp" as const;

  generate(request: HttpRequest): GeneratedCode {
    if (request.options.followRedirects) {
      throw new GeneratorError(
        "Ruby Net::HTTP does not follow redirects automatically. Reissuing redirect responses requires application-specific policy, so curl -L cannot be converted safely.",
        "GENERATOR_CLIENT_LIMITATION",
      );
    }
    const requestClass = REQUEST_CLASSES[request.method];
    if (requestClass === undefined) {
      throw new GeneratorError(
        `Net::HTTP has no built-in request class for the ${request.method} method.`,
        "GENERATOR_UNSUPPORTED_BODY",
      );
    }
    const headers = materializeHeaders(request, {
      basicAuthHeader: false,
      cookieHeader: true,
    });

    const lines: string[] = [
      `uri = URI(${rubyString(requestUrl(request))})`,
      "",
      `request = Net::HTTP::${requestClass}.new(uri)`,
    ];
    for (const header of headers) {
      // add_field appends, so repeated header names survive; []= would replace.
      lines.push(
        `request.add_field(${rubyString(header.name)}, ${rubyString(header.value)})`,
      );
    }
    if (request.auth?.kind === "basic") {
      lines.push(
        `request.basic_auth(${rubyString(request.auth.username)}, ${rubyString(request.auth.password)})`,
      );
    }
    lines.push(...bodyLines(request.body));
    lines.push(
      "",
      `response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https") do |http|`,
      "  http.request(request)",
      "end",
      "",
      "puts response.body",
    );

    return {
      code: ['require "net/http"', 'require "uri"', "", ...lines].join("\n"),
      language: this.language,
      client: this.client,
    };
  }
}
