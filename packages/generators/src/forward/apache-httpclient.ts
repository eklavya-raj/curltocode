import { requestUrl } from "@curltocode/core";
import type { HttpRequest, RequestBody } from "@curltocode/core";

import { hasHeader, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { javaString } from "./literal.js";

interface ApacheBody {
  readonly imports: readonly string[];
  readonly lines: readonly string[];
}

function bodyCode(body: RequestBody | undefined): ApacheBody {
  if (body === undefined) return { imports: [], lines: [] };
  if (body.kind === "multipart") {
    const lines = [
      "MultipartEntityBuilder entityBuilder = MultipartEntityBuilder.create();",
    ];
    for (const part of body.parts) {
      if (part.kind === "field") {
        lines.push(
          `entityBuilder.addTextBody(${javaString(part.name)}, ${javaString(part.value)}, ContentType.TEXT_PLAIN);`,
        );
        continue;
      }
      const filename =
        part.filename ?? part.path.split("/").at(-1) ?? part.path;
      const contentType =
        part.contentType === undefined
          ? "ContentType.DEFAULT_BINARY"
          : `ContentType.parse(${javaString(part.contentType)})`;
      lines.push(
        `entityBuilder.addBinaryBody(${javaString(part.name)}, new File(${javaString(part.path)}), ${contentType}, ${javaString(filename)});`,
      );
    }
    lines.push("request.setEntity(entityBuilder.build());");
    return {
      imports: [
        "java.io.File",
        "org.apache.hc.client5.http.entity.mime.MultipartEntityBuilder",
        "org.apache.hc.core5.http.ContentType",
      ],
      lines,
    };
  }
  if (body.kind === "binary" && body.source.kind === "file") {
    return {
      imports: [
        "java.io.File",
        "org.apache.hc.core5.http.io.entity.FileEntity",
      ],
      lines: [
        `request.setEntity(new FileEntity(new File(${javaString(body.source.path)}), null));`,
      ],
    };
  }
  let raw: string;
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    raw = body.raw;
  } else if (body.kind === "text") {
    raw = body.value;
  } else if (body.kind === "binary" && body.source.kind === "inline") {
    raw = body.source.value;
  } else {
    throw new GeneratorError(
      "Apache HttpClient could not represent this request body.",
      "GENERATOR_UNSUPPORTED_BODY",
    );
  }
  return {
    imports: [
      "java.nio.charset.StandardCharsets",
      "org.apache.hc.core5.http.io.entity.ByteArrayEntity",
    ],
    lines: [
      `request.setEntity(new ByteArrayEntity(${javaString(raw)}.getBytes(StandardCharsets.UTF_8), null));`,
    ],
  };
}

export class ApacheHttpClientGenerator implements CodeGenerator {
  readonly id = "java-apache" as const;
  readonly language = "java" as const;
  readonly client = "apache" as const;

  generate(request: HttpRequest): GeneratedCode {
    if (
      request.body?.kind === "multipart" &&
      hasHeader(request.headers, "content-type")
    ) {
      throw new GeneratorError(
        "Apache HttpClient must generate the multipart Content-Type boundary; an explicit Content-Type header cannot be preserved safely.",
        "GENERATOR_UNSUPPORTED_BODY",
      );
    }
    const headers = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    const body = bodyCode(request.body);
    const imports = [
      "java.net.URI",
      "org.apache.hc.client5.http.classic.methods.HttpUriRequestBase",
      "org.apache.hc.client5.http.config.RequestConfig",
      "org.apache.hc.client5.http.impl.classic.CloseableHttpClient",
      "org.apache.hc.client5.http.impl.classic.HttpClients",
      "org.apache.hc.core5.http.HttpEntity",
      "org.apache.hc.core5.http.io.entity.EntityUtils",
      ...body.imports,
    ];
    const mainLines: string[] = [
      "RequestConfig config = RequestConfig.custom()",
      `    .setRedirectsEnabled(${request.options.followRedirects ? "true" : "false"})`,
      "    .build();",
      "",
      "try (CloseableHttpClient client = HttpClients.custom()",
      "        .setDefaultRequestConfig(config)",
      "        .build()) {",
      `    HttpUriRequestBase request = new HttpUriRequestBase(${javaString(request.method)}, URI.create(${javaString(requestUrl(request))}));`,
    ];
    for (const line of body.lines) mainLines.push(`    ${line}`);
    for (const header of headers) {
      mainLines.push(
        `    request.addHeader(${javaString(header.name)}, ${javaString(header.value)});`,
      );
    }
    mainLines.push(
      "",
      "    client.execute(request, response -> {",
      "        System.out.println(response.getCode());",
      "        HttpEntity responseEntity = response.getEntity();",
      "        if (responseEntity != null) {",
      "            System.out.println(EntityUtils.toString(responseEntity));",
      "        }",
      "        return null;",
      "    });",
      "}",
    );

    return {
      code: [
        ...[...new Set(imports)].sort().map((entry) => `import ${entry};`),
        "",
        "public class Main {",
        "    public static void main(String[] args) throws Exception {",
        ...mainLines.map((line) =>
          line.length === 0 ? "" : `        ${line}`,
        ),
        "    }",
        "}",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency:
        'implementation("org.apache.httpcomponents.client5:httpclient5:5.6.2")',
    };
  }
}
