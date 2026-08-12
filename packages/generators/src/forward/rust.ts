import { requestUrl } from "@curltocode/core";
import type { HttpRequest, RequestBody } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { rustString } from "./literal.js";

interface RustBody {
  /** Statements emitted before the request builder chain. */
  readonly prelude: readonly string[];
  /** Builder calls appended to the request chain. */
  readonly builder: readonly string[];
  /** Whether the generated code needs reqwest's `multipart` feature. */
  readonly multipart: boolean;
}

function rustBody(body: RequestBody | undefined): RustBody {
  if (body === undefined) return { prelude: [], builder: [], multipart: false };
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return {
      prelude: [],
      builder: [`.body(${rustString(body.raw)})`],
      multipart: false,
    };
  }
  if (body.kind === "text") {
    return {
      prelude: [],
      builder: [`.body(${rustString(body.value)})`],
      multipart: false,
    };
  }
  if (body.kind === "multipart") {
    const lines = ["let form = reqwest::multipart::Form::new()"];
    const parts = body.parts.map((part) => {
      if (part.kind === "field")
        return `    .text(${rustString(part.name)}, ${rustString(part.value)})`;
      const filename =
        part.filename ?? part.path.split("/").at(-1) ?? part.path;
      const partExpression = [
        `reqwest::multipart::Part::bytes(std::fs::read(${rustString(part.path)})?)`,
        `.file_name(${rustString(filename)})`,
        ...(part.contentType === undefined
          ? []
          : [`.mime_str(${rustString(part.contentType)})?`]),
      ].join("");
      return `    .part(${rustString(part.name)}, ${partExpression})`;
    });
    return {
      prelude: [
        ...lines,
        ...parts.map((part, index) =>
          index === parts.length - 1 ? `${part};` : part,
        ),
      ],
      builder: [".multipart(form)"],
      multipart: true,
    };
  }
  if (body.source.kind === "inline") {
    return {
      prelude: [],
      builder: [`.body(${rustString(body.source.value)})`],
      multipart: false,
    };
  }
  return {
    prelude: [`let payload = std::fs::read(${rustString(body.source.path)})?;`],
    builder: [".body(payload)"],
    multipart: false,
  };
}

/** Methods exposed as associated constants on `reqwest::Method`. */
const METHOD_CONSTANTS = new Set([
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "CONNECT",
  "PATCH",
  "TRACE",
]);

function methodExpression(method: string): string {
  if (METHOD_CONSTANTS.has(method)) return `reqwest::Method::${method}`;
  // Extension methods are validated tokens, so a byte-string literal is safe.
  return `reqwest::Method::from_bytes(b${rustString(method)})?`;
}

export class RustGenerator implements CodeGenerator {
  readonly id = "rust-reqwest" as const;
  readonly language = "rust" as const;
  readonly client = "reqwest" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: false,
      cookieHeader: true,
    });
    const body = rustBody(request.body);

    const clientLines = request.options.followRedirects
      ? ["let client = reqwest::Client::new();"]
      : [
          "let client = reqwest::Client::builder()",
          "    .redirect(reqwest::redirect::Policy::none())",
          "    .build()?;",
        ];

    const chain = [
      `    .request(${methodExpression(request.method)}, ${rustString(requestUrl(request))})`,
    ];
    for (const header of headers) {
      // header() appends rather than replacing, preserving repeated names.
      chain.push(
        `    .header(${rustString(header.name)}, ${rustString(header.value)})`,
      );
    }
    if (request.auth?.kind === "basic") {
      chain.push(
        `    .basic_auth(${rustString(request.auth.username)}, Some(${rustString(request.auth.password)}))`,
      );
    }
    chain.push(...body.builder.map((entry) => `    ${entry}`));

    const dependency = body.multipart
      ? 'reqwest = { version = "0.13", features = ["multipart"] }\ntokio = { version = "1", features = ["full"] }'
      : 'reqwest = "0.13"\ntokio = { version = "1", features = ["full"] }';

    return {
      code: [
        "#[tokio::main]",
        "async fn main() -> Result<(), Box<dyn std::error::Error>> {",
        ...clientLines.map((line) => `    ${line}`),
        "",
        ...body.prelude.map((line) => `    ${line}`),
        ...(body.prelude.length > 0 ? [""] : []),
        "    let response = client",
        ...chain.map((line) => `    ${line}`),
        "        .send()",
        "        .await?;",
        "",
        '    println!("{}", response.status());',
        '    println!("{}", response.text().await?);',
        "",
        "    Ok(())",
        "}",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency,
    };
  }
}
