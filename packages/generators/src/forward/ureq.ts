import { requestUrl } from "@curltocode/core";
import type { HttpRequest, RequestBody } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { rustString } from "./literal.js";

function bodyExpression(body: RequestBody | undefined): string {
  if (body === undefined) return "()";
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return rustString(body.raw);
  }
  if (body.kind === "text") return rustString(body.value);
  if (body.kind === "multipart") {
    throw new GeneratorError(
      "ureq's multipart API is explicitly unversioned, so CurlToCode does not generate it as a stable target yet.",
      "GENERATOR_UNSUPPORTED_BODY",
    );
  }
  return body.source.kind === "inline"
    ? rustString(body.source.value)
    : `std::fs::File::open(${rustString(body.source.path)})?`;
}

export class UreqGenerator implements CodeGenerator {
  readonly id = "rust-ureq" as const;
  readonly language = "rust" as const;
  readonly client = "ureq" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    const body = bodyExpression(request.body);
    const lines = [
      "use ureq::{http, Agent};",
      "",
      "fn main() -> Result<(), Box<dyn std::error::Error>> {",
      "    let config = Agent::config_builder()",
      `        .max_redirects(${request.options.followRedirects ? "10" : "0"})`,
      "        .http_status_as_error(false)",
      "        .build();",
      "    let agent: Agent = config.into();",
      "",
      "    let request = http::Request::builder()",
      `        .method(http::Method::from_bytes(b${rustString(request.method)})?)`,
      `        .uri(${rustString(requestUrl(request))})`,
    ];
    for (const header of headers) {
      // http::request::Builder appends HeaderMap values rather than replacing.
      lines.push(
        `        .header(${rustString(header.name)}, ${rustString(header.value)})`,
      );
    }
    lines.push(
      `        .body(${body})?;`,
      "",
      "    let mut response = agent.run(request)?;",
      '    println!("{}", response.status());',
      '    println!("{}", response.body_mut().read_to_string()?);',
      "",
      "    Ok(())",
      "}",
    );

    return {
      code: lines.join("\n"),
      language: this.language,
      client: this.client,
      dependency: 'ureq = "3.3"',
    };
  }
}
