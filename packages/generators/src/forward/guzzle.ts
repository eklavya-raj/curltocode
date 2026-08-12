import { requestUrl } from "@curltocode/core";
import type { Header, HttpRequest, RequestBody } from "@curltocode/core";

import { hasHeader, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { phpString } from "./literal.js";

interface HeaderGroup {
  readonly name: string;
  readonly values: readonly string[];
}

function groupHeaders(headers: readonly Header[]): readonly HeaderGroup[] {
  const groups = new Map<string, { name: string; values: string[] }>();
  for (const header of headers) {
    const key = header.name.toLowerCase();
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, { name: header.name, values: [header.value] });
    } else {
      existing.values.push(header.value);
    }
  }
  return [...groups.values()];
}

function bodyOption(body: RequestBody): readonly string[] {
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return [`    "body" => ${phpString(body.raw)},`];
  }
  if (body.kind === "text") {
    return [`    "body" => ${phpString(body.value)},`];
  }
  if (body.kind === "multipart") {
    const lines = ['    "multipart" => ['];
    for (const part of body.parts) {
      lines.push("        [", `            "name" => ${phpString(part.name)},`);
      if (part.kind === "field") {
        lines.push(`            "contents" => ${phpString(part.value)},`);
      } else {
        const filename =
          part.filename ?? part.path.split("/").at(-1) ?? part.path;
        lines.push(
          `            "contents" => fopen(${phpString(part.path)}, "rb"),`,
          `            "filename" => ${phpString(filename)},`,
        );
        if (part.contentType !== undefined) {
          lines.push(
            '            "headers" => [',
            `                "Content-Type" => ${phpString(part.contentType)},`,
            "            ],",
          );
        }
      }
      lines.push("        ],");
    }
    lines.push("    ],");
    return lines;
  }
  if (body.source.kind === "inline") {
    return [`    "body" => ${phpString(body.source.value)},`];
  }
  return [`    "body" => fopen(${phpString(body.source.path)}, "rb"),`];
}

export class GuzzleGenerator implements CodeGenerator {
  readonly id = "php-guzzle" as const;
  readonly language = "php" as const;
  readonly client = "guzzle" as const;

  generate(request: HttpRequest): GeneratedCode {
    if (
      request.body?.kind === "multipart" &&
      hasHeader(request.headers, "content-type")
    ) {
      throw new GeneratorError(
        "Guzzle must generate the multipart Content-Type boundary; an explicit Content-Type header cannot be preserved safely.",
        "GENERATOR_UNSUPPORTED_BODY",
      );
    }
    const headers = materializeHeaders(request, {
      basicAuthHeader: false,
      cookieHeader: true,
    });
    const options: string[] = [
      `    "allow_redirects" => ${request.options.followRedirects ? "true" : "false"},`,
    ];
    if (headers.length > 0) {
      options.push('    "headers" => [');
      for (const group of groupHeaders(headers)) {
        const value =
          group.values.length === 1
            ? phpString(group.values[0] ?? "")
            : `[${group.values.map(phpString).join(", ")}]`;
        options.push(`        ${phpString(group.name)} => ${value},`);
      }
      options.push("    ],");
    }
    if (request.auth?.kind === "basic") {
      options.push(
        `    "auth" => [${phpString(request.auth.username)}, ${phpString(request.auth.password)}],`,
      );
    }
    if (request.body !== undefined) options.push(...bodyOption(request.body));

    return {
      code: [
        "<?php",
        "",
        'require __DIR__ . "/vendor/autoload.php";',
        "",
        "$client = new GuzzleHttp\\Client();",
        "$response = $client->request(",
        `    ${phpString(request.method)},`,
        `    ${phpString(requestUrl(request))},`,
        "    [",
        ...options.map((line) => `    ${line}`),
        "    ],",
        ");",
        "",
        "echo $response->getStatusCode() . PHP_EOL;",
        "echo $response->getBody();",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: "composer require guzzlehttp/guzzle",
    };
  }
}
