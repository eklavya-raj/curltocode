import { requestUrl } from "@curltocode/core";
import type { HttpRequest, RequestBody } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { javaString } from "./literal.js";
import {
  assertNoBoundaryCollision,
  MULTIPART_CONTENT_TYPE,
  MULTIPART_EPILOGUE,
  multipartPartHeader,
} from "./multipart.js";

/**
 * The only verbs `HttpURLConnection.setRequestMethod` accepts. Anything else
 * raises ProtocolException at runtime, so it is refused here instead.
 */
const ALLOWED_METHODS = new Set([
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "POST",
  "PUT",
  "TRACE",
]);

interface UrlConnectionBody {
  readonly writes: readonly string[];
  readonly imports: readonly string[];
  readonly contentType: string | undefined;
}

function multipartBody(
  body: Extract<RequestBody, { kind: "multipart" }>,
): UrlConnectionBody {
  const writes: string[] = [];
  const imports = ["java.nio.charset.StandardCharsets"];
  const utf8 = (value: string): string =>
    `${javaString(value)}.getBytes(StandardCharsets.UTF_8)`;
  for (const part of body.parts) {
    writes.push(`    output.write(${utf8(multipartPartHeader(part))});`);
    if (part.kind === "field") {
      assertNoBoundaryCollision(part.name, part.value);
      writes.push(`    output.write(${utf8(part.value)});`);
    } else {
      imports.push("java.nio.file.Files", "java.nio.file.Path");
      writes.push(`    Files.copy(Path.of(${javaString(part.path)}), output);`);
    }
    writes.push(`    output.write(${utf8("\r\n")});`);
  }
  writes.push(`    output.write(${utf8(MULTIPART_EPILOGUE)});`);
  return { writes, imports, contentType: MULTIPART_CONTENT_TYPE };
}

function urlConnectionBody(body: RequestBody | undefined): UrlConnectionBody {
  if (body === undefined)
    return { writes: [], imports: [], contentType: undefined };
  if (body.kind === "multipart") return multipartBody(body);
  const inline = (value: string): UrlConnectionBody => ({
    writes: [
      `    output.write(${javaString(value)}.getBytes(StandardCharsets.UTF_8));`,
    ],
    imports: ["java.nio.charset.StandardCharsets"],
    contentType: undefined,
  });
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return inline(body.raw);
  }
  if (body.kind === "text") return inline(body.value);
  if (body.source.kind === "inline") return inline(body.source.value);
  return {
    writes: [
      `    Files.copy(Path.of(${javaString(body.source.path)}), output);`,
    ],
    imports: ["java.nio.file.Files", "java.nio.file.Path"],
    contentType: undefined,
  };
}

/**
 * Java with `HttpURLConnection`, which has been in the JDK since 1.1 and is
 * still the only option on an Android project that has not adopted OkHttp or a
 * JDK 11 baseline.
 *
 * `addRequestProperty` appends, so repeated header names survive here.
 */
export class JavaUrlConnectionGenerator implements CodeGenerator {
  readonly id = "java-httpurlconnection" as const;
  readonly language = "java" as const;
  readonly client = "httpurlconnection" as const;

  generate(request: HttpRequest): GeneratedCode {
    if (!ALLOWED_METHODS.has(request.method)) {
      throw new GeneratorError(
        `HttpURLConnection.setRequestMethod rejects ${request.method}; it accepts only ${[...ALLOWED_METHODS].join(", ")}.`,
        "GENERATOR_CLIENT_LIMITATION",
      );
    }
    const materialized = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    const body = urlConnectionBody(request.body);
    const headers =
      body.contentType === undefined
        ? materialized
        : [
            ...materialized.filter(
              (header) => header.name.toLowerCase() !== "content-type",
            ),
            { name: "Content-Type", value: body.contentType },
          ];

    const imports = new Set([
      "java.io.OutputStream",
      "java.net.HttpURLConnection",
      "java.net.URI",
      "java.nio.charset.StandardCharsets",
      ...body.imports,
    ]);

    const lines = [
      `URI uri = URI.create(${javaString(requestUrl(request))});`,
      "HttpURLConnection connection = (HttpURLConnection) uri.toURL().openConnection();",
      `connection.setRequestMethod(${javaString(request.method)});`,
      `connection.setInstanceFollowRedirects(${request.options.followRedirects});`,
    ];
    for (const header of headers) {
      // addRequestProperty appends rather than replacing, so a repeated name is
      // sent twice exactly as cURL would send it.
      lines.push(
        `connection.addRequestProperty(${javaString(header.name)}, ${javaString(header.value)});`,
      );
    }
    if (body.writes.length > 0) {
      lines.push(
        "connection.setDoOutput(true);",
        "",
        "try (OutputStream output = connection.getOutputStream()) {",
        ...body.writes,
        "}",
      );
    }
    lines.push(
      "",
      "try (var stream = connection.getResponseCode() < 400",
      "        ? connection.getInputStream()",
      "        : connection.getErrorStream()) {",
      "    System.out.println(new String(stream.readAllBytes(), StandardCharsets.UTF_8));",
      "}",
    );

    return {
      code: [
        ...[...imports].sort().map((entry) => `import ${entry};`),
        "",
        ...lines,
      ].join("\n"),
      language: this.language,
      client: this.client,
    };
  }
}
