import { requestUrl } from "@curltocode/core";
import type { HttpRequest } from "@curltocode/core";

import { hasDuplicateHeaderNames, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { luaString } from "./literal.js";
import {
  assertNoBoundaryCollision,
  MULTIPART_CONTENT_TYPE,
  MULTIPART_EPILOGUE,
  multipartPartHeader,
} from "./multipart.js";

/**
 * Lua with LuaSocket, plus LuaSec when the URL is https.
 *
 * LuaSocket has no multipart encoder, so that body is written out byte for
 * byte and the file is read with `io.open`.
 */
export class LuaHttpGenerator implements CodeGenerator {
  readonly id = "lua-http" as const;
  readonly language = "lua" as const;
  readonly client = "http" as const;

  generate(request: HttpRequest): GeneratedCode {
    const materialized = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    if (hasDuplicateHeaderNames(materialized)) {
      throw new GeneratorError(
        "LuaSocket takes request headers as a table, so a repeated header name cannot be sent twice.",
        "GENERATOR_DUPLICATE_HEADERS",
      );
    }
    const url = requestUrl(request);
    // socket.http speaks plain HTTP only; https needs LuaSec's drop-in module.
    const secure = url.startsWith("https:");
    const body = request.body;

    const prelude: string[] = [];
    let source: string | undefined;
    let contentLength: string | undefined;
    let contentType: string | undefined;

    if (body?.kind === "multipart") {
      const chunks: string[] = [];
      for (const part of body.parts) {
        chunks.push(`  ${luaString(multipartPartHeader(part))},`);
        if (part.kind === "field") {
          assertNoBoundaryCollision(part.name, part.value);
          chunks.push(`  ${luaString(part.value)},`);
        } else {
          chunks.push(
            `  (function() local f = assert(io.open(${luaString(part.path)}, "rb")) local d = f:read("*a") f:close() return d end)(),`,
          );
        }
        chunks.push(`  ${luaString("\r\n")},`);
      }
      chunks.push(`  ${luaString(MULTIPART_EPILOGUE)},`);
      prelude.push("local payload = table.concat({", ...chunks, "})", "");
      source = "ltn12.source.string(payload)";
      contentLength = "#payload";
      contentType = MULTIPART_CONTENT_TYPE;
    } else if (body?.kind === "binary" && body.source.kind === "file") {
      prelude.push(
        `local payloadFile = assert(io.open(${luaString(body.source.path)}, "rb"))`,
        "",
      );
      source = "ltn12.source.file(payloadFile)";
      contentLength = 'payloadFile:seek("end")';
      prelude.push('payloadFile:seek("set")', "");
    } else if (body !== undefined) {
      const payload =
        body.kind === "json" || body.kind === "form-urlencoded"
          ? body.raw
          : body.kind === "text"
            ? body.value
            : body.kind === "binary" && body.source.kind === "inline"
              ? body.source.value
              : "";
      prelude.push(`local payload = ${luaString(payload)}`, "");
      source = "ltn12.source.string(payload)";
      contentLength = "#payload";
    }

    const headers = [
      ...(contentType === undefined
        ? materialized
        : [
            ...materialized.filter(
              (header) => header.name.toLowerCase() !== "content-type",
            ),
            { name: "Content-Type", value: contentType },
          ]),
    ];

    const headerLines = headers.map(
      ({ name, value }) => `    [${luaString(name)}] = ${luaString(value)},`,
    );
    if (contentLength !== undefined) {
      // LuaSocket will not add Content-Length for a source-backed body.
      headerLines.push(`    ["Content-Length"] = tostring(${contentLength}),`);
    }

    return {
      code: [
        secure
          ? 'local http = require("ssl.https")'
          : 'local http = require("socket.http")',
        'local ltn12 = require("ltn12")',
        "",
        ...prelude,
        "local chunks = {}",
        "",
        "local _, status = http.request({",
        `  url = ${luaString(url)},`,
        `  method = ${luaString(request.method)},`,
        ...(headerLines.length === 0
          ? []
          : ["  headers = {", ...headerLines, "  },"]),
        ...(source === undefined ? [] : [`  source = ${source},`]),
        "  sink = ltn12.sink.table(chunks),",
        `  redirect = ${request.options.followRedirects},`,
        "})",
        "",
        "print(status, table.concat(chunks))",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: secure
        ? "luarocks install luasocket luasec"
        : "luarocks install luasocket",
    };
  }
}
