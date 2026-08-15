import { requestUrl } from "@curltocode/core";
import type { Header, HttpRequest, RequestBody } from "@curltocode/core";

import { hasDuplicateHeaderNames, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { csharpString } from "./literal.js";

const METHODS: Readonly<Record<string, string>> = {
  GET: "Get",
  POST: "Post",
  PUT: "Put",
  DELETE: "Delete",
  HEAD: "Head",
  OPTIONS: "Options",
  PATCH: "Patch",
  MERGE: "Merge",
  COPY: "Copy",
  SEARCH: "Search",
};

function findContentType(headers: readonly Header[]): string | undefined {
  const matches = headers.filter(
    (header) => header.name.toLowerCase() === "content-type",
  );
  if (matches.length > 1) {
    throw new GeneratorError(
      "RestSharp accepts only one request body Content-Type value.",
      "GENERATOR_DUPLICATE_HEADERS",
    );
  }
  return matches[0]?.value;
}

function bodyLines(
  body: RequestBody,
  contentType: string | undefined,
): readonly string[] {
  if (body.kind === "multipart") {
    const lines = ["request.AlwaysMultipartFormData = true;"];
    for (const part of body.parts) {
      if (part.kind === "field") {
        lines.push(
          `request.AddParameter(${csharpString(part.name)}, ${csharpString(part.value)});`,
        );
        continue;
      }
      const filename =
        part.filename ?? part.path.split("/").at(-1) ?? part.path;
      const mediaType =
        part.contentType === undefined
          ? ""
          : `, ${csharpString(part.contentType)}`;
      lines.push(
        `request.AddFile(${csharpString(part.name)}, File.ReadAllBytes(${csharpString(part.path)}), ${csharpString(filename)}${mediaType});`,
      );
    }
    return lines;
  }
  const mediaType = contentType ?? "application/octet-stream";
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return [
      `request.AddStringBody(${csharpString(body.raw)}, ${csharpString(mediaType)});`,
    ];
  }
  if (body.kind === "text") {
    return [
      `request.AddStringBody(${csharpString(body.value)}, ${csharpString(mediaType)});`,
    ];
  }
  if (body.source.kind === "file") {
    return [
      `request.AddBody(File.ReadAllBytes(${csharpString(body.source.path)}), ${csharpString(mediaType)});`,
    ];
  }
  return [
    `request.AddBody(Encoding.UTF8.GetBytes(${csharpString(body.source.value)}), ${csharpString(mediaType)});`,
  ];
}

export class RestSharpGenerator implements CodeGenerator {
  readonly id = "csharp-restsharp" as const;
  readonly language = "csharp" as const;
  readonly client = "restsharp" as const;

  generate(request: HttpRequest): GeneratedCode {
    const method = METHODS[request.method];
    if (method === undefined) {
      throw new GeneratorError(
        `RestSharp does not expose a Method value for the ${request.method} method.`,
        "GENERATOR_CLIENT_LIMITATION",
      );
    }
    const headers = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    const contentType = findContentType(headers);
    if (request.body?.kind === "multipart" && contentType !== undefined) {
      throw new GeneratorError(
        "RestSharp must generate the multipart Content-Type boundary; an explicit Content-Type header cannot be preserved safely.",
        "GENERATOR_UNSUPPORTED_BODY",
      );
    }
    if (request.body === undefined && contentType !== undefined) {
      throw new GeneratorError(
        "RestSharp cannot attach Content-Type without a request body.",
        "GENERATOR_UNSUPPORTED_BODY",
      );
    }
    const requestHeaders = headers.filter(
      (header) => header.name.toLowerCase() !== "content-type",
    );
    if (hasDuplicateHeaderNames(requestHeaders)) {
      throw new GeneratorError(
        "RestSharp's parameter collection does not guarantee duplicate request header names are preserved.",
        "GENERATOR_DUPLICATE_HEADERS",
      );
    }
    const lines = [
      "var options = new RestClientOptions {",
      `    FollowRedirects = ${request.options.followRedirects ? "true" : "false"},`,
      "};",
      "using var client = new RestClient(options);",
      `var request = new RestRequest(${csharpString(requestUrl(request))}, Method.${method});`,
    ];
    for (const header of requestHeaders) {
      lines.push(
        `request.AddHeader(${csharpString(header.name)}, ${csharpString(header.value)});`,
      );
    }
    if (request.body !== undefined) {
      lines.push(...bodyLines(request.body, contentType));
    }
    lines.push(
      "",
      "var response = await client.ExecuteAsync(request);",
      "Console.WriteLine((int)response.StatusCode);",
      "Console.WriteLine(response.Content);",
    );
    const needsFile =
      request.body?.kind === "multipart"
        ? request.body.parts.some((part) => part.kind === "file")
        : request.body?.kind === "binary" &&
          request.body.source.kind === "file";
    const needsEncoding =
      request.body?.kind === "binary" && request.body.source.kind === "inline";

    return {
      code: [
        "using System;",
        ...(needsFile ? ["using System.IO;"] : []),
        ...(needsEncoding ? ["using System.Text;"] : []),
        "using RestSharp;",
        "",
        ...lines,
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: "dotnet add package RestSharp --version 114.0.0",
    };
  }
}
