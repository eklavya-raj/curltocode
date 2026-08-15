import { requestUrl } from "@curltocode/core";
import type { HttpRequest, RequestBody } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode, GeneratorId } from "../types.js";
import { GeneratorError } from "../types.js";
import { javaString } from "./literal.js";

/**
 * java.net.http rejects these header names unless the JDK is started with
 * `-Djdk.httpclient.allowRestrictedHeaders`, so generating code that sets them
 * would produce a runtime IllegalArgumentException.
 */
const RESTRICTED_HEADERS = new Set([
  "connection",
  "content-length",
  "date",
  "expect",
  "from",
  "host",
  "upgrade",
  "via",
  "warning",
]);

/**
 * Both Java clients throw checked exceptions when a request is executed, so the
 * statements must live inside a method that declares them to be compilable.
 */
function javaClass(lines: readonly string[]): readonly string[] {
  return [
    "public class Main {",
    "    public static void main(String[] args) throws Exception {",
    ...lines.map((line) => (line.length === 0 ? "" : `        ${line}`)),
    "    }",
    "}",
  ];
}

function bodyPublisher(body: RequestBody | undefined): string {
  if (body === undefined) return "HttpRequest.BodyPublishers.noBody()";
  if (body.kind === "json" || body.kind === "form-urlencoded")
    return `HttpRequest.BodyPublishers.ofString(${javaString(body.raw)})`;
  if (body.kind === "text")
    return `HttpRequest.BodyPublishers.ofString(${javaString(body.value)})`;
  if (body.kind === "binary") {
    return body.source.kind === "inline"
      ? `HttpRequest.BodyPublishers.ofString(${javaString(body.source.value)})`
      : `HttpRequest.BodyPublishers.ofFile(Path.of(${javaString(body.source.path)}))`;
  }
  throw new GeneratorError(
    "java.net.http.HttpClient has no multipart body publisher. Use the Java OkHttp generator for multipart requests.",
    "GENERATOR_UNSUPPORTED_BODY",
  );
}

function generateHttpClient(request: HttpRequest): GeneratedCode {
  const headers = materializeHeaders(request, {
    basicAuthHeader: true,
    cookieHeader: true,
  });
  const restricted = headers.find((header) =>
    RESTRICTED_HEADERS.has(header.name.toLowerCase()),
  );
  if (restricted !== undefined) {
    throw new GeneratorError(
      `java.net.http.HttpClient does not allow the ${restricted.name} request header to be set.`,
      "GENERATOR_CLIENT_LIMITATION",
    );
  }
  const publisher = bodyPublisher(request.body);
  const needsPath =
    request.body?.kind === "binary" && request.body.source.kind === "file";

  const imports = [
    "java.net.URI",
    "java.net.http.HttpClient",
    "java.net.http.HttpRequest",
    "java.net.http.HttpResponse",
    ...(needsPath ? ["java.nio.file.Path"] : []),
  ];

  const builder = [
    "HttpRequest request = HttpRequest.newBuilder()",
    `    .uri(URI.create(${javaString(requestUrl(request))}))`,
    `    .method(${javaString(request.method)}, ${publisher})`,
  ];
  for (const header of headers) {
    // header() appends, so repeated names are preserved.
    builder.push(
      `    .header(${javaString(header.name)}, ${javaString(header.value)})`,
    );
  }
  builder.push("    .build();");

  const bodyLines = [
    "HttpClient client = HttpClient.newBuilder()",
    `    .followRedirects(HttpClient.Redirect.${request.options.followRedirects ? "NORMAL" : "NEVER"})`,
    "    .build();",
    "",
    ...builder,
    "",
    "HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());",
    "System.out.println(response.statusCode());",
    "System.out.println(response.body());",
  ];
  return {
    code: [
      ...imports.sort().map((entry) => `import ${entry};`),
      "",
      ...javaClass(bodyLines),
    ].join("\n"),
    language: "java",
    client: "httpclient",
  };
}

function okhttpBody(request: HttpRequest): {
  readonly prelude: readonly string[];
  readonly expression: string;
} {
  const body = request.body;
  if (body === undefined) {
    // OkHttp requires a body for methods that define one.
    const requiresBody = !["GET", "HEAD"].includes(request.method);
    return {
      prelude: [],
      expression: requiresBody
        ? "RequestBody.create(new byte[0], null)"
        : "null",
    };
  }
  if (body.kind === "multipart") {
    const lines = [
      "MultipartBody.Builder bodyBuilder = new MultipartBody.Builder()",
      "    .setType(MultipartBody.FORM);",
    ];
    for (const part of body.parts) {
      if (part.kind === "field") {
        lines.push(
          `bodyBuilder.addFormDataPart(${javaString(part.name)}, ${javaString(part.value)});`,
        );
        continue;
      }
      const filename =
        part.filename ?? part.path.split("/").at(-1) ?? part.path;
      const mediaType =
        part.contentType === undefined
          ? "null"
          : `MediaType.parse(${javaString(part.contentType)})`;
      lines.push(
        `bodyBuilder.addFormDataPart(${javaString(part.name)}, ${javaString(filename)},`,
        `    RequestBody.create(new File(${javaString(part.path)}), ${mediaType}));`,
      );
    }
    return {
      prelude: [...lines, "RequestBody body = bodyBuilder.build();"],
      expression: "body",
    };
  }
  const raw =
    body.kind === "json" || body.kind === "form-urlencoded"
      ? body.raw
      : body.kind === "text"
        ? body.value
        : body.source.kind === "inline"
          ? body.source.value
          : undefined;
  if (raw === undefined) {
    const path =
      body.kind === "binary" && body.source.kind === "file"
        ? body.source.path
        : "";
    return {
      prelude: [
        `RequestBody body = RequestBody.create(new File(${javaString(path)}), null);`,
      ],
      expression: "body",
    };
  }
  return {
    prelude: [
      `RequestBody body = RequestBody.create(${javaString(raw)}, null);`,
    ],
    expression: "body",
  };
}

function generateOkHttp(request: HttpRequest): GeneratedCode {
  const headers = materializeHeaders(request, {
    basicAuthHeader: true,
    cookieHeader: true,
  });
  const body = okhttpBody(request);
  const usesFile =
    request.body?.kind === "multipart"
      ? request.body.parts.some((part) => part.kind === "file")
      : request.body?.kind === "binary" && request.body.source.kind === "file";

  const builder = [
    "Request request = new Request.Builder()",
    `    .url(${javaString(requestUrl(request))})`,
    `    .method(${javaString(request.method)}, ${body.expression})`,
  ];
  for (const header of headers) {
    builder.push(
      `    .addHeader(${javaString(header.name)}, ${javaString(header.value)})`,
    );
  }
  builder.push("    .build();");

  const bodyLines = [
    "OkHttpClient client = new OkHttpClient.Builder()",
    `    .followRedirects(${request.options.followRedirects ? "true" : "false"})`,
    `    .followSslRedirects(${request.options.followRedirects ? "true" : "false"})`,
    "    .build();",
    "",
    ...body.prelude,
    ...(body.prelude.length > 0 ? [""] : []),
    ...builder,
    "",
    "try (Response response = client.newCall(request).execute()) {",
    "    System.out.println(response.code());",
    "    System.out.println(response.body().string());",
    "}",
  ];
  return {
    code: [
      "import okhttp3.*;",
      ...(usesFile ? ["import java.io.File;"] : []),
      "",
      ...javaClass(bodyLines),
    ].join("\n"),
    language: "java",
    client: "okhttp",
    dependency: 'implementation("com.squareup.okhttp3:okhttp:5.3.2")',
  };
}

export class JavaGenerator implements CodeGenerator {
  readonly id: GeneratorId;
  readonly language = "java" as const;

  constructor(readonly client: "httpclient" | "okhttp") {
    this.id = client === "httpclient" ? "java-httpclient" : "java-okhttp";
  }

  generate(request: HttpRequest): GeneratedCode {
    return this.client === "httpclient"
      ? generateHttpClient(request)
      : generateOkHttp(request);
  }
}
