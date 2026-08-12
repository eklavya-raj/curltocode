import { requestUrl } from "@curltocode/core";
import type { HttpRequest, RequestBody } from "@curltocode/core";

import {
  hasDuplicateHeaderNames,
  hasHeader,
  materializeHeaders,
} from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { rubyString } from "./literal.js";

interface FaradayBody {
  readonly prelude: readonly string[];
  readonly expression: string;
  readonly multipart: boolean;
}

function bodyCode(body: RequestBody | undefined): FaradayBody {
  if (body === undefined) {
    return { prelude: [], expression: "nil", multipart: false };
  }
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return { prelude: [], expression: rubyString(body.raw), multipart: false };
  }
  if (body.kind === "text") {
    return {
      prelude: [],
      expression: rubyString(body.value),
      multipart: false,
    };
  }
  if (body.kind === "multipart") {
    const names = new Set<string>();
    for (const part of body.parts) {
      if (names.has(part.name)) {
        throw new GeneratorError(
          "Faraday's multipart hash cannot preserve repeated part names without changing their ordering.",
          "GENERATOR_UNSUPPORTED_BODY",
        );
      }
      names.add(part.name);
    }
    const lines = ["payload = {"];
    for (const part of body.parts) {
      if (part.kind === "field") {
        lines.push(`  ${rubyString(part.name)} => ${rubyString(part.value)},`);
        continue;
      }
      const filename =
        part.filename ?? part.path.split("/").at(-1) ?? part.path;
      lines.push(
        `  ${rubyString(part.name)} => Faraday::Multipart::FilePart.new(`,
        `    ${rubyString(part.path)},`,
        `    ${rubyString(part.contentType ?? "application/octet-stream")},`,
        `    ${rubyString(filename)},`,
        "  ),",
      );
    }
    lines.push("}");
    return { prelude: lines, expression: "payload", multipart: true };
  }
  if (body.source.kind === "inline") {
    return {
      prelude: [],
      expression: rubyString(body.source.value),
      multipart: false,
    };
  }
  return {
    prelude: [],
    expression: `File.binread(${rubyString(body.source.path)})`,
    multipart: false,
  };
}

export class FaradayGenerator implements CodeGenerator {
  readonly id = "ruby-faraday" as const;
  readonly language = "ruby" as const;
  readonly client = "faraday" as const;

  generate(request: HttpRequest): GeneratedCode {
    if (
      request.body?.kind === "multipart" &&
      hasHeader(request.headers, "content-type")
    ) {
      throw new GeneratorError(
        "Faraday must generate the multipart Content-Type boundary; an explicit Content-Type header cannot be preserved safely.",
        "GENERATOR_UNSUPPORTED_BODY",
      );
    }
    const headers = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    if (hasDuplicateHeaderNames(headers)) {
      throw new GeneratorError(
        "Faraday's request header hash cannot preserve duplicate header names.",
        "GENERATOR_DUPLICATE_HEADERS",
      );
    }
    const body = bodyCode(request.body);
    const requires = ['require "faraday"'];
    if (body.multipart) requires.push('require "faraday/multipart"');
    if (request.options.followRedirects) {
      requires.push('require "faraday/follow_redirects"');
    }
    const lines = [...requires, "", "connection = Faraday.new do |faraday|"];
    if (body.multipart) lines.push("  faraday.request :multipart");
    if (request.options.followRedirects) {
      lines.push("  faraday.response :follow_redirects");
    }
    lines.push("  faraday.adapter Faraday.default_adapter", "end", "");
    lines.push(...body.prelude);
    if (body.prelude.length > 0) lines.push("");
    const headerExpression =
      headers.length === 0
        ? "{}"
        : `{\n${headers
            .map(
              ({ name, value }) =>
                `  ${rubyString(name)} => ${rubyString(value)},`,
            )
            .join("\n")}\n}`;
    lines.push(
      "response = connection.run_request(",
      `  ${rubyString(request.method.toLowerCase())}.to_sym,`,
      `  ${rubyString(requestUrl(request))},`,
      `  ${body.expression},`,
      ...headerExpression.split("\n").map((line) => `  ${line}`),
      ")",
      "",
      "puts response.status",
      "puts response.body",
    );
    const dependencies = ["faraday"];
    if (body.multipart) dependencies.push("faraday-multipart");
    if (request.options.followRedirects) {
      dependencies.push("faraday-follow_redirects");
    }

    return {
      code: lines.join("\n"),
      language: this.language,
      client: this.client,
      dependency: `gem install ${dependencies.join(" ")}`,
    };
  }
}
