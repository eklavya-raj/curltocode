import { requestUrl } from "@curltocode/core";
import type { HttpRequest } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { elixirString } from "./literal.js";

/**
 * Elixir with Req, which is on its way to being the default client in Phoenix.
 *
 * Headers are a list of tuples in both targets here, so a repeated name is sent
 * twice rather than replaced.
 */
export class ReqGenerator implements CodeGenerator {
  readonly id = "elixir-req" as const;
  readonly language = "elixir" as const;
  readonly client = "req" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: false,
      cookieHeader: true,
    });
    const body = request.body;
    const options = [
      `    method: :${request.method.toLowerCase()},`,
      `    url: ${elixirString(requestUrl(request))},`,
    ];
    const applicable =
      body?.kind === "multipart"
        ? headers.filter(
            (header) => header.name.toLowerCase() !== "content-type",
          )
        : headers;
    if (applicable.length > 0) {
      options.push(
        "    headers: [",
        ...applicable.map(
          ({ name, value }) =>
            `      {${elixirString(name)}, ${elixirString(value)}},`,
        ),
        "    ],",
      );
    }
    if (request.auth?.kind === "basic") {
      options.push(
        `    auth: {:basic, ${elixirString(`${request.auth.username}:${request.auth.password}`)}},`,
      );
    }
    if (body?.kind === "multipart") {
      options.push("    form_multipart: [");
      for (const part of body.parts) {
        if (part.kind === "field") {
          options.push(
            `      {${elixirString(part.name)}, ${elixirString(part.value)}},`,
          );
          continue;
        }
        const filename =
          part.filename ?? part.path.split("/").at(-1) ?? part.path;
        const type =
          part.contentType === undefined
            ? ""
            : `, content_type: ${elixirString(part.contentType)}`;
        options.push(
          `      {${elixirString(part.name)}, {File.stream!(${elixirString(part.path)}), filename: ${elixirString(filename)}${type}}},`,
        );
      }
      options.push("    ],");
    } else if (body !== undefined) {
      const payload =
        body.kind === "binary" && body.source.kind === "file"
          ? `File.stream!(${elixirString(body.source.path)})`
          : elixirString(
              body.kind === "json" || body.kind === "form-urlencoded"
                ? body.raw
                : body.kind === "text"
                  ? body.value
                  : body.kind === "binary" && body.source.kind === "inline"
                    ? body.source.value
                    : "",
            );
      options.push(`    body: ${payload},`);
    }
    options.push(`    redirect: ${request.options.followRedirects},`);

    return {
      code: [
        "response =",
        "  Req.request!(",
        ...options,
        "  )",
        "",
        "IO.puts(response.body)",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: '{:req, "~> 0.7"}',
    };
  }
}

/** Elixir with HTTPoison, the long-established client. */
export class HTTPoisonGenerator implements CodeGenerator {
  readonly id = "elixir-httpoison" as const;
  readonly language = "elixir" as const;
  readonly client = "httpoison" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    const body = request.body;
    const applicable =
      body?.kind === "multipart"
        ? headers.filter(
            (header) => header.name.toLowerCase() !== "content-type",
          )
        : headers;

    let bodyExpression = '""';
    const extra: string[] = [];
    if (body?.kind === "multipart") {
      const parts = body.parts.map((part) => {
        if (part.kind === "field") {
          return `     {${elixirString(part.name)}, ${elixirString(part.value)}},`;
        }
        const filename =
          part.filename ?? part.path.split("/").at(-1) ?? part.path;
        const partHeaders =
          part.contentType === undefined
            ? "[]"
            : `[{"Content-Type", ${elixirString(part.contentType)}}]`;
        return `     {:file, ${elixirString(part.path)}, {"form-data", [name: ${elixirString(part.name)}, filename: ${elixirString(filename)}]}, ${partHeaders}},`;
      });
      bodyExpression = ["{:multipart, [", ...parts, "   ]}"].join("\n");
    } else if (body?.kind === "binary" && body.source.kind === "file") {
      bodyExpression = `{:file, ${elixirString(body.source.path)}}`;
    } else if (body !== undefined) {
      bodyExpression = elixirString(
        body.kind === "json" || body.kind === "form-urlencoded"
          ? body.raw
          : body.kind === "text"
            ? body.value
            : body.kind === "binary" && body.source.kind === "inline"
              ? body.source.value
              : "",
      );
    }
    extra.push(`follow_redirect: ${request.options.followRedirects}`);

    return {
      code: [
        "response =",
        "  HTTPoison.request!(",
        `    :${request.method.toLowerCase()},`,
        `    ${elixirString(requestUrl(request))},`,
        `    ${bodyExpression},`,
        ...(applicable.length === 0
          ? ["    [],"]
          : [
              "    [",
              ...applicable.map(
                ({ name, value }) =>
                  `      {${elixirString(name)}, ${elixirString(value)}},`,
              ),
              "    ],",
            ]),
        `    [${extra.join(", ")}]`,
        "  )",
        "",
        "IO.puts(response.body)",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: '{:httpoison, "~> 2.2"}',
    };
  }
}
