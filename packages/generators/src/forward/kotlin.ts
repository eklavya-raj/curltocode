import { requestUrl } from "@curltocode/core";
import type { HttpRequest, RequestBody } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { kotlinString } from "./literal.js";

const OKHTTP_DEPENDENCY = 'implementation("com.squareup.okhttp3:okhttp:5.3.2")';

/** Verbs OkHttp refuses to send without a body. */
const BODY_REQUIRED = new Set(["POST", "PUT", "PATCH", "PROPPATCH", "REPORT"]);

interface OkHttpBody {
  readonly prelude: readonly string[];
  readonly imports: readonly string[];
  readonly expression: string | undefined;
}

function mediaType(value: string | undefined): string {
  return value === undefined ? "null" : `${kotlinString(value)}.toMediaType()`;
}

function multipartBody(
  body: Extract<RequestBody, { kind: "multipart" }>,
): OkHttpBody {
  const imports = [
    "okhttp3.MediaType.Companion.toMediaType",
    "okhttp3.MultipartBody",
  ];
  const lines = [
    "val body = MultipartBody.Builder()",
    "    .setType(MultipartBody.FORM)",
  ];
  for (const part of body.parts) {
    if (part.kind === "field") {
      lines.push(
        `    .addFormDataPart(${kotlinString(part.name)}, ${kotlinString(part.value)})`,
      );
      continue;
    }
    imports.push("java.io.File", "okhttp3.RequestBody.Companion.asRequestBody");
    const filename = part.filename ?? part.path.split("/").at(-1) ?? part.path;
    lines.push(
      `    .addFormDataPart(`,
      `        ${kotlinString(part.name)},`,
      `        ${kotlinString(filename)},`,
      `        File(${kotlinString(part.path)}).asRequestBody(${mediaType(part.contentType)}),`,
      `    )`,
    );
  }
  lines.push("    .build()");
  return { prelude: lines, imports, expression: "body" };
}

function textBody(value: string, contentType: string | undefined): OkHttpBody {
  return {
    prelude: [
      `val body = ${kotlinString(value)}.toRequestBody(${mediaType(contentType)})`,
    ],
    imports: [
      "okhttp3.MediaType.Companion.toMediaType",
      "okhttp3.RequestBody.Companion.toRequestBody",
    ],
    expression: "body",
  };
}

function okhttpBody(
  body: RequestBody | undefined,
  contentType: string | undefined,
  method: string,
): OkHttpBody {
  if (body === undefined) {
    // OkHttp rejects a null body for these verbs, but cURL sends them with
    // Content-Length: 0, so an empty body is the faithful translation rather
    // than a reason to refuse the request.
    return BODY_REQUIRED.has(method)
      ? {
          prelude: ["val body = ByteArray(0).toRequestBody()"],
          imports: ["okhttp3.RequestBody.Companion.toRequestBody"],
          expression: "body",
        }
      : { prelude: [], imports: [], expression: undefined };
  }
  if (body.kind === "multipart") return multipartBody(body);
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return textBody(body.raw, contentType);
  }
  if (body.kind === "text") return textBody(body.value, contentType);
  if (body.source.kind === "inline") {
    return textBody(body.source.value, contentType);
  }
  return {
    prelude: [
      `val body = File(${kotlinString(body.source.path)}).asRequestBody(${mediaType(contentType)})`,
    ],
    imports: [
      "java.io.File",
      "okhttp3.MediaType.Companion.toMediaType",
      "okhttp3.RequestBody.Companion.asRequestBody",
    ],
    expression: "body",
  };
}

/**
 * Kotlin with OkHttp, the default HTTP client on Android.
 *
 * `addHeader` appends rather than replaces, so repeated header names survive,
 * which is why this target does not have to refuse them the way a
 * mapping-based client does.
 */
export class KotlinOkHttpGenerator implements CodeGenerator {
  readonly id = "kotlin-okhttp" as const;
  readonly language = "kotlin" as const;
  readonly client = "okhttp" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: false,
      cookieHeader: true,
    });
    // OkHttp derives the Content-Type from the request body's media type, so
    // the header is consumed there rather than added twice.
    const contentType = headers.find(
      (header) => header.name.toLowerCase() === "content-type",
    )?.value;
    const body = okhttpBody(request.body, contentType, request.method);

    const imports = new Set([
      "okhttp3.OkHttpClient",
      "okhttp3.Request",
      ...body.imports,
    ]);
    if (request.auth?.kind === "basic") imports.add("okhttp3.Credentials");

    const lines: string[] = [];
    lines.push(
      "val client = OkHttpClient.Builder()",
      `    .followRedirects(${request.options.followRedirects})`,
      `    .followSslRedirects(${request.options.followRedirects})`,
      "    .build()",
      "",
    );
    if (body.prelude.length > 0) lines.push(...body.prelude, "");

    lines.push(
      "val request = Request.Builder()",
      `    .url(${kotlinString(requestUrl(request))})`,
      `    .method(${kotlinString(request.method)}, ${body.expression ?? "null"})`,
    );
    for (const header of headers) {
      if (
        header.value === contentType &&
        header.name.toLowerCase() === "content-type"
      ) {
        continue;
      }
      lines.push(
        `    .addHeader(${kotlinString(header.name)}, ${kotlinString(header.value)})`,
      );
    }
    if (request.auth?.kind === "basic") {
      lines.push(
        `    .header("Authorization", Credentials.basic(${kotlinString(request.auth.username)}, ${kotlinString(request.auth.password)}))`,
      );
    }
    lines.push(
      "    .build()",
      "",
      "client.newCall(request).execute().use { response ->",
      "    println(response.body?.string())",
      "}",
    );

    return {
      code: [
        ...[...imports].sort().map((entry) => `import ${entry}`),
        "",
        ...lines,
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: OKHTTP_DEPENDENCY,
    };
  }
}
