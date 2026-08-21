import { requestUrl } from "@curltocode/core";
import type { HttpRequest } from "@curltocode/core";

import { hasDuplicateHeaderNames, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { dartString } from "./literal.js";

/**
 * `MediaType.parse` rather than the two-argument constructor: the declared type
 * may carry parameters such as `charset`, and splitting on the slash would
 * discard them.
 */
function mediaType(className: string, contentType: string): string {
  return `${className}.parse(${dartString(contentType)})`;
}

/**
 * Dart with `package:http`, the official client.
 *
 * The convenience functions (`http.post` and friends) cannot set a redirect
 * policy or send a verb outside the named set, so every request is built as an
 * explicit `Request`, which handles all of them the same way.
 */
export class DartHttpGenerator implements CodeGenerator {
  readonly id = "dart-http" as const;
  readonly language = "dart" as const;
  readonly client = "http" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    if (hasDuplicateHeaderNames(headers)) {
      throw new GeneratorError(
        "package:http takes request headers as a Map, so a repeated header name cannot be sent twice.",
        "GENERATOR_DUPLICATE_HEADERS",
      );
    }
    const body = request.body;
    const multipart = body?.kind === "multipart";
    const imports = new Set(["package:http/http.dart"]);
    const lines: string[] = [
      `  final url = Uri.parse(${dartString(requestUrl(request))});`,
    ];

    if (multipart) {
      imports.add("package:http_parser/http_parser.dart");
      lines.push(
        `  final request = http.MultipartRequest(${dartString(request.method)}, url);`,
      );
    } else {
      lines.push(
        `  final request = http.Request(${dartString(request.method)}, url);`,
      );
    }
    lines.push(
      `  request.followRedirects = ${request.options.followRedirects};`,
    );
    if (headers.length > 0) {
      // A multipart request writes its own Content-Type with the boundary it
      // generates, so an inbound one is dropped rather than fighting it.
      const applicable = multipart
        ? headers.filter(
            (header) => header.name.toLowerCase() !== "content-type",
          )
        : headers;
      if (applicable.length > 0) {
        lines.push(
          "  request.headers.addAll({",
          ...applicable.map(
            ({ name, value }) =>
              `    ${dartString(name)}: ${dartString(value)},`,
          ),
          "  });",
        );
      }
    }

    if (body !== undefined) {
      if (body.kind === "multipart") {
        // `MultipartRequest.fields` is a `Map<String, String>`, so a second
        // part with the same name would replace the first rather than being
        // sent alongside it. Files go into a list and are unaffected.
        const seen = new Set<string>();
        for (const part of body.parts) {
          if (part.kind === "field") {
            if (seen.has(part.name)) {
              throw new GeneratorError(
                `MultipartRequest keeps its fields in a map, so the repeated multipart field ${part.name} cannot be sent twice. Pick Dio, which takes the fields as a list.`,
                "GENERATOR_UNSUPPORTED_BODY",
              );
            }
            seen.add(part.name);
            lines.push(
              `  request.fields[${dartString(part.name)}] = ${dartString(part.value)};`,
            );
            continue;
          }
          const filename =
            part.filename ?? part.path.split("/").at(-1) ?? part.path;
          lines.push(
            "  request.files.add(await http.MultipartFile.fromPath(",
            `    ${dartString(part.name)},`,
            `    ${dartString(part.path)},`,
            `    filename: ${dartString(filename)},`,
            ...(part.contentType === undefined
              ? []
              : [
                  `    contentType: ${mediaType("MediaType", part.contentType)},`,
                ]),
            "  ));",
          );
        }
      } else if (body.kind === "binary" && body.source.kind === "file") {
        imports.add("dart:io");
        lines.push(
          `  request.bodyBytes = await File(${dartString(body.source.path)}).readAsBytes();`,
        );
      } else {
        const payload =
          body.kind === "json" || body.kind === "form-urlencoded"
            ? body.raw
            : body.kind === "text"
              ? body.value
              : body.kind === "binary" && body.source.kind === "inline"
                ? body.source.value
                : "";
        lines.push(`  request.body = ${dartString(payload)};`);
      }
    }

    lines.push(
      "",
      "  final response = await http.Client().send(request);",
      "  print(await response.stream.bytesToString());",
    );

    const importLines = [...imports]
      .sort()
      .map((entry) =>
        entry === "package:http/http.dart"
          ? `import '${entry}' as http;`
          : `import '${entry}';`,
      );

    return {
      code: [
        ...importLines,
        "",
        "Future<void> main() async {",
        ...lines,
        "}",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: "dart pub add http",
    };
  }
}

/**
 * Dart with Dio, the client most Flutter applications reach for once they need
 * interceptors, timeouts, or upload progress.
 */
export class DioGenerator implements CodeGenerator {
  readonly id = "dart-dio" as const;
  readonly language = "dart" as const;
  readonly client = "dio" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    if (hasDuplicateHeaderNames(headers)) {
      throw new GeneratorError(
        "Dio takes request headers as a Map, so a repeated header name cannot be sent twice.",
        "GENERATOR_DUPLICATE_HEADERS",
      );
    }
    const body = request.body;
    const imports = new Set(["package:dio/dio.dart"]);
    const lines: string[] = ["  final dio = Dio();"];

    let data: string | undefined;
    if (body?.kind === "multipart") {
      // `FormData.fromMap` is the better-known constructor and cannot hold two
      // parts under one name. `fields` and `files` are lists, so building the
      // form through them keeps a repeated field name that a form legitimately
      // may have.
      const entries: string[] = [];
      for (const part of body.parts) {
        if (part.kind === "field") {
          entries.push(
            `  data.fields.add(MapEntry(${dartString(part.name)}, ${dartString(part.value)}));`,
          );
          continue;
        }
        const filename =
          part.filename ?? part.path.split("/").at(-1) ?? part.path;
        entries.push(
          `  data.files.add(MapEntry(`,
          `    ${dartString(part.name)},`,
          `    await MultipartFile.fromFile(`,
          `      ${dartString(part.path)},`,
          `      filename: ${dartString(filename)},`,
          ...(part.contentType === undefined
            ? []
            : [
                `      contentType: ${mediaType("DioMediaType", part.contentType)},`,
              ]),
          "    ),",
          "  ));",
        );
      }
      lines.push("  final data = FormData();", ...entries);
      data = "data";
    } else if (body?.kind === "binary" && body.source.kind === "file") {
      imports.add("dart:io");
      lines.push(
        `  final data = File(${dartString(body.source.path)}).openRead();`,
      );
      data = "data";
    } else if (body !== undefined) {
      const payload =
        body.kind === "json" || body.kind === "form-urlencoded"
          ? body.raw
          : body.kind === "text"
            ? body.value
            : body.kind === "binary" && body.source.kind === "inline"
              ? body.source.value
              : "";
      data = dartString(payload);
    }

    const options = [
      `      method: ${dartString(request.method)},`,
      `      followRedirects: ${request.options.followRedirects},`,
      // Dio treats any non-2xx as an error by default, which hides the response
      // a converted cURL command would have printed.
      "      validateStatus: (status) => true,",
    ];
    if (headers.length > 0) {
      options.splice(
        1,
        0,
        "      headers: {",
        ...headers.map(
          ({ name, value }) =>
            `        ${dartString(name)}: ${dartString(value)},`,
        ),
        "      },",
      );
    }

    lines.push(
      "",
      "  final response = await dio.request(",
      `    ${dartString(requestUrl(request))},`,
      ...(data === undefined ? [] : [`    data: ${data},`]),
      "    options: Options(",
      ...options,
      "    ),",
      "  );",
      "  print(response.data);",
    );

    return {
      code: [
        ...[...imports].sort().map((entry) => `import '${entry}';`),
        "",
        "Future<void> main() async {",
        ...lines,
        "}",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: "dart pub add dio",
    };
  }
}
