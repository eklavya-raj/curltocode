import { requestUrl } from "@curltocode/core";
import type { HttpRequest, RequestBody } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { kotlinString } from "./literal.js";

const DEPENDENCY = 'implementation("io.ktor:ktor-client-cio:3.4.0")';

interface KtorBody {
  readonly lines: readonly string[];
  readonly imports: readonly string[];
}

function multipartBody(
  body: Extract<RequestBody, { kind: "multipart" }>,
): KtorBody {
  const imports = [
    "io.ktor.client.request.forms.MultiPartFormDataContent",
    "io.ktor.client.request.forms.formData",
    "io.ktor.http.Headers",
    "io.ktor.http.HttpHeaders",
  ];
  const lines = [
    "setBody(",
    "    MultiPartFormDataContent(",
    "        formData {",
  ];
  for (const part of body.parts) {
    if (part.kind === "field") {
      lines.push(
        `            append(${kotlinString(part.name)}, ${kotlinString(part.value)})`,
      );
      continue;
    }
    imports.push("java.io.File");
    const filename = part.filename ?? part.path.split("/").at(-1) ?? part.path;
    const partHeaders = [
      `                        append(HttpHeaders.ContentDisposition, ${kotlinString(`filename="${filename}"`)})`,
    ];
    if (part.contentType !== undefined) {
      partHeaders.unshift(
        `                        append(HttpHeaders.ContentType, ${kotlinString(part.contentType)})`,
      );
    }
    lines.push(
      "            append(",
      `                ${kotlinString(part.name)},`,
      `                File(${kotlinString(part.path)}).readBytes(),`,
      "                Headers.build {",
      ...partHeaders,
      "                },",
      "            )",
    );
  }
  lines.push("        },", "    ),", ")");
  return { lines, imports };
}

function ktorBody(body: RequestBody | undefined): KtorBody {
  if (body === undefined) return { lines: [], imports: [] };
  if (body.kind === "multipart") return multipartBody(body);
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return { lines: [`setBody(${kotlinString(body.raw)})`], imports: [] };
  }
  if (body.kind === "text") {
    return { lines: [`setBody(${kotlinString(body.value)})`], imports: [] };
  }
  if (body.source.kind === "inline") {
    return {
      lines: [`setBody(${kotlinString(body.source.value)})`],
      imports: [],
    };
  }
  return {
    lines: [`setBody(File(${kotlinString(body.source.path)}).readChannel())`],
    imports: ["io.ktor.util.cio.readChannel", "java.io.File"],
  };
}

/**
 * Kotlin with Ktor's client, the multiplatform option: the same request
 * compiles for the JVM, Android, iOS, and JavaScript targets.
 *
 * `header()` appends to a `HeadersBuilder`, which keeps repeated names, so this
 * target preserves duplicate headers rather than refusing them.
 */
export class KtorGenerator implements CodeGenerator {
  readonly id = "kotlin-ktor" as const;
  readonly language = "kotlin" as const;
  readonly client = "ktor" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    const body = ktorBody(request.body);
    const imports = new Set([
      "io.ktor.client.HttpClient",
      "io.ktor.client.engine.cio.CIO",
      "io.ktor.client.request.header",
      "io.ktor.client.request.request",
      "io.ktor.client.request.setBody",
      "io.ktor.client.statement.HttpResponse",
      "io.ktor.client.statement.bodyAsText",
      "io.ktor.http.HttpMethod",
      ...body.imports,
    ]);

    const block = [
      `    method = HttpMethod(${kotlinString(request.method)})`,
      ...headers.map(
        (header) =>
          `    header(${kotlinString(header.name)}, ${kotlinString(header.value)})`,
      ),
      ...body.lines.map((line) => `    ${line}`),
    ];

    return {
      code: [
        ...[...imports].sort().map((entry) => `import ${entry}`),
        "",
        "val client = HttpClient(CIO) {",
        `    followRedirects = ${request.options.followRedirects}`,
        "}",
        "",
        `val response: HttpResponse = client.request(${kotlinString(requestUrl(request))}) {`,
        ...block,
        "}",
        "",
        "println(response.bodyAsText())",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: DEPENDENCY,
    };
  }
}
