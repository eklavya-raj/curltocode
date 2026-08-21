import { requestUrl } from "@curltocode/core";
import type { HttpRequest } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { matlabString } from "./literal.js";

/** MATLAB's own default redirect budget. */
const DEFAULT_MAX_REDIRECTS = 20;

/**
 * MATLAB with `matlab.net.http`.
 *
 * `weboptions`/`webread` is the better-known pair, but it cannot send an
 * arbitrary verb, cannot repeat a header name, and cannot set a redirect
 * budget. The `matlab.net.http` package does all three, so it is what a
 * converted request should use.
 */
export class MatlabGenerator implements CodeGenerator {
  readonly id = "matlab-http" as const;
  readonly language = "matlab" as const;
  readonly client = "http" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    const body = request.body;
    const lines: string[] = [];

    if (headers.length > 0) {
      lines.push(
        "header = [",
        ...headers.map(
          ({ name, value }) =>
            `    HeaderField(${matlabString(name)}, ${matlabString(value)})`,
        ),
        "];",
        "",
      );
    }

    let bodyExpression = "";
    if (body?.kind === "multipart") {
      const typed = body.parts.find(
        (part) => part.kind === "file" && part.contentType !== undefined,
      );
      if (typed !== undefined) {
        throw new GeneratorError(
          `FileProvider takes each part's Content-Type from the file's extension, so the declared media type for ${typed.name} cannot be set.`,
          "GENERATOR_CLIENT_LIMITATION",
        );
      }
      const arguments_ = body.parts.map((part) =>
        part.kind === "field"
          ? `    ${matlabString(part.name)}, ${matlabString(part.value)}`
          : `    ${matlabString(part.name)}, FileProvider(${matlabString(part.path)})`,
      );
      lines.push(
        "provider = MultipartFormProvider( ...",
        arguments_.join(", ...\n"),
        ");",
        "",
      );
      bodyExpression = "provider";
    } else if (body?.kind === "binary" && body.source.kind === "file") {
      lines.push(
        `provider = FileProvider(${matlabString(body.source.path)});`,
        "",
      );
      bodyExpression = "provider";
    } else if (body !== undefined) {
      const payload =
        body.kind === "json" || body.kind === "form-urlencoded"
          ? body.raw
          : body.kind === "text"
            ? body.value
            : body.kind === "binary" && body.source.kind === "inline"
              ? body.source.value
              : "";
      lines.push(`payload = MessageBody(${matlabString(payload)});`, "");
      bodyExpression = "payload";
    }

    const requestArguments = [matlabString(request.method)];
    if (headers.length > 0 || bodyExpression !== "") {
      requestArguments.push(headers.length > 0 ? "header" : "[]");
    }
    if (bodyExpression !== "") requestArguments.push(bodyExpression);

    return {
      code: [
        "import matlab.net.http.*",
        "import matlab.net.http.field.*",
        "import matlab.net.http.io.*",
        "",
        ...lines,
        `request = RequestMessage(${requestArguments.join(", ")});`,
        `options = HTTPOptions('MaxRedirects', ${request.options.followRedirects ? DEFAULT_MAX_REDIRECTS : 0});`,
        "",
        `response = request.send(${matlabString(requestUrl(request))}, options);`,
        "disp(response.Body.Data);",
      ].join("\n"),
      language: this.language,
      client: this.client,
    };
  }
}
