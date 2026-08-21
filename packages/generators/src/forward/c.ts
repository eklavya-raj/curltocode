import { requestUrl } from "@curltocode/core";
import type { HttpRequest } from "@curltocode/core";

import { hasDuplicateHeaderNames, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { cString } from "./literal.js";

/** Verbs cpr exposes as a named function. */
const CPR_METHODS = new Map([
  ["DELETE", "Delete"],
  ["GET", "Get"],
  ["HEAD", "Head"],
  ["OPTIONS", "Options"],
  ["PATCH", "Patch"],
  ["POST", "Post"],
  ["PUT", "Put"],
]);

/**
 * C with libcurl, the library cURL itself is built on.
 *
 * This is the closest a generated program gets to the original command: the
 * options below are the same ones the cURL binary sets from its flags.
 */
export class CLibcurlGenerator implements CodeGenerator {
  readonly id = "c-libcurl" as const;
  readonly language = "c" as const;
  readonly client = "libcurl" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      // libcurl has CURLOPT_USERPWD and CURLOPT_COOKIE for these.
      basicAuthHeader: false,
      cookieHeader: false,
    });
    const body = request.body;
    const includes = new Set(["<curl/curl.h>", "<stdio.h>"]);
    const setup: string[] = [];
    const cleanup: string[] = [];

    if (headers.length > 0) {
      setup.push("struct curl_slist *headers = NULL;");
      for (const header of headers) {
        // curl_slist appends, so a repeated header name is sent twice.
        setup.push(
          `headers = curl_slist_append(headers, ${cString(`${header.name}: ${header.value}`)});`,
        );
      }
      setup.push("");
      cleanup.push("curl_slist_free_all(headers);");
    }

    const options: string[] = [
      `curl_easy_setopt(curl, CURLOPT_URL, ${cString(requestUrl(request))});`,
    ];
    if (request.method !== "GET") {
      options.push(
        `curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, ${cString(request.method)});`,
      );
    }
    if (headers.length > 0) {
      options.push("curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);");
    }
    if (request.auth?.kind === "basic") {
      options.push(
        `curl_easy_setopt(curl, CURLOPT_USERPWD, ${cString(`${request.auth.username}:${request.auth.password}`)});`,
      );
    }
    if (request.cookies.length > 0) {
      options.push(
        `curl_easy_setopt(curl, CURLOPT_COOKIE, ${cString(request.cookies.map(({ name, value }) => `${name}=${value}`).join("; "))});`,
      );
    }

    if (body?.kind === "multipart") {
      setup.push(
        "curl_mime *mime = curl_mime_init(curl);",
        "curl_mimepart *part = NULL;",
        "",
      );
      for (const part of body.parts) {
        setup.push(
          "part = curl_mime_addpart(mime);",
          `curl_mime_name(part, ${cString(part.name)});`,
        );
        if (part.kind === "field") {
          setup.push(
            `curl_mime_data(part, ${cString(part.value)}, CURL_ZERO_TERMINATED);`,
          );
        } else {
          setup.push(`curl_mime_filedata(part, ${cString(part.path)});`);
          if (part.filename !== undefined) {
            setup.push(`curl_mime_filename(part, ${cString(part.filename)});`);
          }
          if (part.contentType !== undefined) {
            setup.push(`curl_mime_type(part, ${cString(part.contentType)});`);
          }
        }
        setup.push("");
      }
      options.push("curl_easy_setopt(curl, CURLOPT_MIMEPOST, mime);");
      cleanup.push("curl_mime_free(mime);");
    } else if (body?.kind === "binary" && body.source.kind === "file") {
      setup.push(
        `FILE *payload = fopen(${cString(body.source.path)}, "rb");`,
        "if (!payload) {",
        `    fprintf(stderr, "cannot open ${body.source.path}\\n");`,
        "    return 1;",
        "}",
        "",
      );
      options.push(
        "curl_easy_setopt(curl, CURLOPT_UPLOAD, 1L);",
        "curl_easy_setopt(curl, CURLOPT_READDATA, payload);",
      );
      cleanup.push("fclose(payload);");
    } else if (body !== undefined) {
      const payload =
        body.kind === "json" || body.kind === "form-urlencoded"
          ? body.raw
          : body.kind === "text"
            ? body.value
            : body.source.kind === "inline"
              ? body.source.value
              : "";
      // COPYPOSTFIELDS so libcurl owns the bytes and the literal need not
      // outlive the transfer.
      options.push(
        `curl_easy_setopt(curl, CURLOPT_COPYPOSTFIELDS, ${cString(payload)});`,
      );
    }
    options.push(
      `curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, ${request.options.followRedirects ? "1L" : "0L"});`,
    );

    return {
      code: [
        ...[...includes].sort().map((entry) => `#include ${entry}`),
        "",
        "int main(void) {",
        "    CURL *curl = curl_easy_init();",
        "    if (!curl) {",
        '        fprintf(stderr, "curl_easy_init failed\\n");',
        "        return 1;",
        "    }",
        "",
        ...setup.map((line) => (line.length === 0 ? "" : `    ${line}`)),
        ...options.map((line) => `    ${line}`),
        "",
        "    CURLcode result = curl_easy_perform(curl);",
        "    if (result != CURLE_OK) {",
        '        fprintf(stderr, "%s\\n", curl_easy_strerror(result));',
        "    }",
        "",
        ...cleanup.map((line) => `    ${line}`),
        "    curl_easy_cleanup(curl);",
        "    return 0;",
        "}",
      ].join("\n"),
      language: this.language,
      client: this.client,
    };
  }
}

/** C++ with cpr, a Requests-shaped wrapper over libcurl. */
export class CprGenerator implements CodeGenerator {
  readonly id = "cpp-cpr" as const;
  readonly language = "cpp" as const;
  readonly client = "cpr" as const;

  generate(request: HttpRequest): GeneratedCode {
    const named = CPR_METHODS.get(request.method);
    if (named === undefined) {
      throw new GeneratorError(
        `cpr exposes one function per standard verb and has none for ${request.method}.`,
        "GENERATOR_CLIENT_LIMITATION",
      );
    }
    const headers = materializeHeaders(request, {
      basicAuthHeader: false,
      cookieHeader: true,
    });
    if (hasDuplicateHeaderNames(headers)) {
      throw new GeneratorError(
        "cpr::Header is a case-insensitive map, so a repeated header name replaces the earlier value instead of being sent twice.",
        "GENERATOR_DUPLICATE_HEADERS",
      );
    }
    const body = request.body;
    const arguments_ = [`        cpr::Url{${cString(requestUrl(request))}}`];
    const applicable =
      body?.kind === "multipart"
        ? // cpr writes the multipart Content-Type with its own boundary.
          headers.filter(
            (header) => header.name.toLowerCase() !== "content-type",
          )
        : headers;
    if (applicable.length > 0) {
      arguments_.push(
        [
          "        cpr::Header{",
          ...applicable.map(
            ({ name, value }) =>
              `            {${cString(name)}, ${cString(value)}},`,
          ),
          "        }",
        ].join("\n"),
      );
    }
    if (request.auth?.kind === "basic") {
      arguments_.push(
        `        cpr::Authentication{${cString(request.auth.username)}, ${cString(request.auth.password)}, cpr::AuthMode::BASIC}`,
      );
    }
    if (body?.kind === "multipart") {
      const parts = body.parts.map((part) => {
        if (part.kind === "field") {
          return `            cpr::Part{${cString(part.name)}, ${cString(part.value)}},`;
        }
        const file = `cpr::File{${cString(part.path)}}`;
        return part.contentType === undefined
          ? `            cpr::Part{${cString(part.name)}, ${file}},`
          : `            cpr::Part{${cString(part.name)}, ${file}, ${cString(part.contentType)}},`;
      });
      arguments_.push(
        ["        cpr::Multipart{", ...parts, "        }"].join("\n"),
      );
    } else if (body?.kind === "binary" && body.source.kind === "file") {
      arguments_.push(
        `        cpr::Body{cpr::File{${cString(body.source.path)}}}`,
      );
    } else if (body !== undefined) {
      const payload =
        body.kind === "json" || body.kind === "form-urlencoded"
          ? body.raw
          : body.kind === "text"
            ? body.value
            : body.source.kind === "inline"
              ? body.source.value
              : "";
      arguments_.push(`        cpr::Body{${cString(payload)}}`);
    }
    arguments_.push(
      `        cpr::Redirect{${request.options.followRedirects}}`,
    );

    return {
      code: [
        "#include <cpr/cpr.h>",
        "#include <iostream>",
        "",
        "int main() {",
        `    cpr::Response response = cpr::${named}(`,
        arguments_.join(",\n"),
        "    );",
        "",
        "    std::cout << response.text << std::endl;",
        "    return 0;",
        "}",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: "vcpkg install cpr",
    };
  }
}
