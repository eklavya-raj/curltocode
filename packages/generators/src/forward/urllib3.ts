import { requestUrl } from "@curltocode/core";
import type { Header, HttpRequest, RequestBody } from "@curltocode/core";

import { hasDuplicateHeaderNames, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { pythonString } from "./literal.js";

interface Urllib3Body {
  readonly arguments: readonly string[];
}

function multipartFields(
  body: Extract<RequestBody, { kind: "multipart" }>,
): Urllib3Body {
  // A list of pairs rather than a dict, so repeated field names survive.
  const fields = body.parts.map((part) => {
    if (part.kind === "field") {
      return `        (${pythonString(part.name)}, (None, ${pythonString(part.value)})),`;
    }
    const filename = part.filename ?? part.path.split("/").at(-1) ?? part.path;
    const file = `open(${pythonString(part.path)}, "rb").read()`;
    const value =
      part.contentType === undefined
        ? `(${pythonString(filename)}, ${file})`
        : `(${pythonString(filename)}, ${file}, ${pythonString(part.contentType)})`;
    return `        (${pythonString(part.name)}, ${value}),`;
  });
  return { arguments: ["    fields=[", ...fields, "    ],"] };
}

function urllib3Body(body: RequestBody | undefined): Urllib3Body {
  if (body === undefined) return { arguments: [] };
  if (body.kind === "multipart") return multipartFields(body);
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return { arguments: [`    body=${pythonString(body.raw)},`] };
  }
  if (body.kind === "text") {
    return { arguments: [`    body=${pythonString(body.value)},`] };
  }
  return body.source.kind === "file"
    ? { arguments: [`    body=open(${pythonString(body.source.path)}, "rb"),`] }
    : {
        arguments: [
          `    body=${pythonString(body.source.value)}.encode("utf-8"),`,
        ],
      };
}

/** Duplicate header names need HTTPHeaderDict; a plain dict reads better. */
function headerLines(headers: readonly Header[]): readonly string[] {
  if (headers.length === 0) return [];
  if (!hasDuplicateHeaderNames(headers)) {
    return [
      "headers = {",
      ...headers.map(
        ({ name, value }) =>
          `    ${pythonString(name)}: ${pythonString(value)},`,
      ),
      "}",
      "",
    ];
  }
  return [
    "headers = urllib3.HTTPHeaderDict()",
    ...headers.map(
      ({ name, value }) =>
        `headers.add(${pythonString(name)}, ${pythonString(value)})`,
    ),
    "",
  ];
}

/**
 * Python with urllib3, the library `requests` itself is built on.
 *
 * Its `HTTPHeaderDict` keeps repeated header names, which is why this target
 * preserves duplicates where `requests` and `httpx` have to refuse them.
 */
export class Urllib3Generator implements CodeGenerator {
  readonly id = "python-urllib3" as const;
  readonly language = "python" as const;
  readonly client = "urllib3" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    const body = urllib3Body(request.body);

    const args = [
      `    ${pythonString(request.method)},`,
      `    ${pythonString(requestUrl(request))},`,
    ];
    if (headers.length > 0) args.push("    headers=headers,");
    args.push(...body.arguments);
    args.push(
      `    redirect=${request.options.followRedirects ? "True" : "False"},`,
    );

    return {
      code: [
        "import urllib3",
        "",
        "http = urllib3.PoolManager()",
        "",
        ...headerLines(headers),
        "response = http.request(",
        ...args,
        ")",
        "",
        'print(response.data.decode("utf-8"))',
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: "pip install urllib3",
    };
  }
}
