import { requestUrl } from "@curltocode/core";
import type { HttpRequest, RequestBody } from "@curltocode/core";

import { hasDuplicateHeaderNames, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { pythonString } from "./literal.js";
import {
  assertNoBoundaryCollision,
  MULTIPART_CONTENT_TYPE,
  MULTIPART_EPILOGUE,
  multipartPartHeader,
} from "./multipart.js";

interface StdlibBody {
  readonly prelude: readonly string[];
  readonly expression: string | undefined;
  /** Content-Type the body defines itself, replacing any inbound header. */
  readonly contentType: string | undefined;
}

function multipartBody(
  body: Extract<RequestBody, { kind: "multipart" }>,
): StdlibBody {
  const chunks: string[] = [];
  for (const part of body.parts) {
    chunks.push(
      `    ${pythonString(multipartPartHeader(part))}.encode("utf-8"),`,
    );
    if (part.kind === "field") {
      assertNoBoundaryCollision(part.name, part.value);
      chunks.push(`    ${pythonString(part.value)}.encode("utf-8"),`);
    } else {
      chunks.push(`    open(${pythonString(part.path)}, "rb").read(),`);
    }
    chunks.push('    b"\\r\\n",');
  }
  chunks.push(`    ${pythonString(MULTIPART_EPILOGUE)}.encode("utf-8"),`);
  return {
    prelude: ['body = b"".join([', ...chunks, "])"],
    expression: "body",
    contentType: MULTIPART_CONTENT_TYPE,
  };
}

function stdlibBody(body: RequestBody | undefined): StdlibBody {
  if (body === undefined) {
    return { prelude: [], expression: undefined, contentType: undefined };
  }
  if (body.kind === "multipart") return multipartBody(body);
  const inline = (value: string): StdlibBody => ({
    prelude: [],
    expression: `${pythonString(value)}.encode("utf-8")`,
    contentType: undefined,
  });
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return inline(body.raw);
  }
  if (body.kind === "text") return inline(body.value);
  if (body.source.kind === "inline") return inline(body.source.value);
  // http.client accepts a file object and streams it.
  return {
    prelude: [],
    expression: `open(${pythonString(body.source.path)}, "rb")`,
    contentType: undefined,
  };
}

/**
 * Python's `http.client`, which is in the standard library and so needs no
 * install at all. It is also the layer everything else in Python is built on,
 * which makes it the right target when a dependency is out of the question.
 *
 * The connection takes the host, and the request takes the path, so the URL
 * arrives split rather than whole.
 */
export class PythonHttpClientGenerator implements CodeGenerator {
  readonly id = "python-httpclient" as const;
  readonly language = "python" as const;
  readonly client = "httpclient" as const;

  generate(request: HttpRequest): GeneratedCode {
    if (request.options.followRedirects) {
      throw new GeneratorError(
        "http.client does not follow redirects; a 3xx response has to be re-requested by hand. Pick requests, httpx, or urllib3 for a redirect policy.",
        "GENERATOR_CLIENT_LIMITATION",
      );
    }
    const materialized = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    if (hasDuplicateHeaderNames(materialized)) {
      throw new GeneratorError(
        "http.client takes request headers as a mapping, so a repeated header name cannot be sent twice.",
        "GENERATOR_DUPLICATE_HEADERS",
      );
    }
    const body = stdlibBody(request.body);
    const headers =
      body.contentType === undefined
        ? materialized
        : [
            ...materialized.filter(
              (header) => header.name.toLowerCase() !== "content-type",
            ),
            { name: "Content-Type", value: body.contentType },
          ];

    const url = new URL(requestUrl(request));
    const connectionClass =
      url.protocol === "https:" ? "HTTPSConnection" : "HTTPConnection";
    const target = `${url.pathname}${url.search}`;

    const lines = ["import http.client", ""];
    lines.push(
      `connection = http.client.${connectionClass}(${pythonString(url.hostname)}${
        url.port === "" ? "" : `, ${url.port}`
      })`,
      "",
    );
    if (headers.length > 0) {
      lines.push(
        "headers = {",
        ...headers.map(
          ({ name, value }) =>
            `    ${pythonString(name)}: ${pythonString(value)},`,
        ),
        "}",
        "",
      );
    }
    if (body.prelude.length > 0) lines.push(...body.prelude, "");

    const args = [pythonString(request.method), pythonString(target)];
    if (body.expression !== undefined) args.push(body.expression);
    else if (headers.length > 0) args.push("None");
    if (headers.length > 0) args.push("headers");

    lines.push(
      `connection.request(${args.join(", ")})`,
      "response = connection.getresponse()",
      'print(response.read().decode("utf-8"))',
      "connection.close()",
    );

    return {
      code: lines.join("\n"),
      language: this.language,
      client: this.client,
    };
  }
}
