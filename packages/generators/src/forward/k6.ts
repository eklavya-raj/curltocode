import { requestUrl } from "@curltocode/core";
import type { HttpRequest, RequestBody } from "@curltocode/core";

import { hasDuplicateHeaderNames, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";

/** k6's default redirect budget, written out so the script states its policy. */
const DEFAULT_REDIRECTS = 10;

const js = (value: string): string => JSON.stringify(value);

interface K6Body {
  /**
   * Statements that must run in k6's init context. `open()` is only available
   * there, so a file-backed body is read at module scope rather than inside the
   * exported function.
   */
  readonly init: readonly string[];
  /** Statements emitted inside the default function. */
  readonly prelude: readonly string[];
  /** Expression passed as the request payload, or undefined for no body. */
  readonly payload: string | undefined;
}

function multipartBody(
  body: Extract<RequestBody, { kind: "multipart" }>,
): K6Body {
  const names = new Set<string>();
  const init: string[] = [];
  const entries: string[] = [];
  for (const part of body.parts) {
    if (names.has(part.name)) {
      throw new GeneratorError(
        `k6 builds a multipart body from an object, so the repeated field ${part.name} cannot be sent twice.`,
        "GENERATOR_UNSUPPORTED_BODY",
      );
    }
    names.add(part.name);
    if (part.kind === "field") {
      entries.push(`  ${js(part.name)}: ${js(part.value)},`);
      continue;
    }
    const variable = `file${init.length + 1}`;
    const filename = part.filename ?? part.path.split("/").at(-1) ?? part.path;
    init.push(`const ${variable} = open(${js(part.path)}, "b");`);
    const arguments_ = [variable, js(filename)];
    if (part.contentType !== undefined) arguments_.push(js(part.contentType));
    entries.push(`  ${js(part.name)}: http.file(${arguments_.join(", ")}),`);
  }
  return {
    init,
    prelude: ["const data = {", ...entries, "};", ""],
    payload: "data",
  };
}

function k6Body(body: RequestBody | undefined): K6Body {
  if (body === undefined) return { init: [], prelude: [], payload: undefined };
  if (body.kind === "multipart") return multipartBody(body);
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return { init: [], prelude: [], payload: js(body.raw) };
  }
  if (body.kind === "text") {
    return { init: [], prelude: [], payload: js(body.value) };
  }
  if (body.source.kind === "file") {
    return {
      init: [`const payload = open(${js(body.source.path)}, "b");`],
      prelude: [],
      payload: "payload",
    };
  }
  return { init: [], prelude: [], payload: js(body.source.value) };
}

/**
 * A Grafana k6 load-test script.
 *
 * The request becomes a scenario that can be run under load, which is the usual
 * next step after a request has been captured from a browser or an API console.
 */
export class K6Generator implements CodeGenerator {
  readonly id = "k6-script" as const;
  readonly language = "k6" as const;
  readonly client = "script" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    if (hasDuplicateHeaderNames(headers)) {
      throw new GeneratorError(
        "k6 takes request headers as an object, so a repeated header name cannot be sent twice.",
        "GENERATOR_DUPLICATE_HEADERS",
      );
    }
    const body = k6Body(request.body);

    const parameters: string[] = [];
    if (headers.length > 0) {
      parameters.push(
        "  headers: {",
        ...headers.map(({ name, value }) => `    ${js(name)}: ${js(value)},`),
        "  },",
      );
    }
    parameters.push(
      `  redirects: ${request.options.followRedirects ? DEFAULT_REDIRECTS : 0},`,
    );

    const lines = [
      'import http from "k6/http";',
      "",
      ...body.init,
      ...(body.init.length > 0 ? [""] : []),
      "export default function () {",
      `  const url = ${js(requestUrl(request))};`,
      "  const params = {",
      ...parameters.map((parameter) => `  ${parameter}`),
      "  };",
      "",
      ...body.prelude.map((line) => (line.length === 0 ? "" : `  ${line}`)),
      // http.request takes the method as a value, which is the only form that
      // covers verbs k6 has no named helper for.
      `  const response = http.request(${js(request.method)}, url, ${body.payload ?? "null"}, params);`,
      "",
      "  console.log(response.status, response.body);",
      "}",
    ];

    return {
      code: lines.join("\n"),
      language: this.language,
      client: this.client,
    };
  }
}
