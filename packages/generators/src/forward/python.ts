import { requestUrl } from "@curltocode/core";
import type {
  Header,
  HttpRequest,
  JsonValue,
  RequestBody,
} from "@curltocode/core";

import { hasDuplicateHeaderNames, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode, GeneratorId } from "../types.js";
import { GeneratorError } from "../types.js";

function pyString(value: string): string {
  return JSON.stringify(value).replaceAll("\\/", "/");
}

function indent(value: string, spaces: number): string {
  return value.replaceAll("\n", `\n${" ".repeat(spaces)}`);
}

function pyValue(value: JsonValue, indent = 0): string {
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "string") return pyString(value);
  if (typeof value === "number") return String(value);
  if (Array.isArray(value))
    return `[${value.map((entry) => pyValue(entry, indent)).join(", ")}]`;
  const padding = " ".repeat(indent + 4);
  const entries = Object.entries(value).map(
    ([key, entry]) =>
      `${padding}${pyString(key)}: ${pyValue(entry, indent + 4)}`,
  );
  return entries.length === 0
    ? "{}"
    : `{\n${entries.join(",\n")},\n${" ".repeat(indent)}}`;
}

function dictionary(headers: readonly Header[]): string {
  return `{\n${headers.map(({ name, value }) => `    ${pyString(name)}: ${pyString(value)},`).join("\n")}\n}`;
}

function bodyArguments(
  body: RequestBody | undefined,
  client: "requests" | "httpx",
): readonly string[] {
  if (body === undefined) return [];
  if (body.kind === "json") {
    return [
      `${client === "requests" ? "data" : "content"}=${pyString(body.raw)}`,
    ];
  }
  if (body.kind === "text")
    return [
      `${client === "requests" ? "data" : "content"}=${pyString(body.value)}`,
    ];
  if (body.kind === "form-urlencoded") {
    return [`data=${pyString(body.raw)}`];
  }
  if (body.kind === "multipart") {
    return [
      `files=[${body.parts
        .map((part) => {
          if (part.kind === "field") {
            // A null filename forces both clients to encode this text value as
            // a multipart field even when the request has no file parts.
            return `(${pyString(part.name)}, (None, ${pyString(part.value)}))`;
          }
          const name =
            part.filename ?? part.path.split("/").at(-1) ?? part.path;
          const file = `open(${pyString(part.path)}, "rb")`;
          const value =
            part.contentType === undefined
              ? `(${pyString(name)}, ${file})`
              : `(${pyString(name)}, ${file}, ${pyString(part.contentType)})`;
          return `(${pyString(part.name)}, ${value})`;
        })
        .join(", ")}]`,
    ];
  }
  const binaryArgument = client === "requests" ? "data" : "content";
  if (body.source.kind === "file")
    return [`${binaryArgument}=open(${pyString(body.source.path)}, "rb")`];
  return [`${binaryArgument}=${pyString(body.source.value)}.encode("utf-8")`];
}

export class PythonGenerator implements CodeGenerator {
  readonly id: GeneratorId;
  readonly language = "python" as const;

  constructor(readonly client: "requests" | "httpx") {
    this.id = `python-${client}`;
  }

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: false,
      cookieHeader: false,
    });
    if (hasDuplicateHeaderNames(headers)) {
      throw new GeneratorError(
        `${this.client} does not preserve duplicate request header names through its standard mapping API.`,
        "GENERATOR_DUPLICATE_HEADERS",
      );
    }
    const args = [pyString(requestUrl(request))];
    if (headers.length > 0) args.push(`headers=${dictionary(headers)}`);
    if (request.cookies.length > 0) {
      const cookies = Object.fromEntries(
        request.cookies.map(({ name, value }) => [name, value]),
      );
      if (Object.keys(cookies).length !== request.cookies.length) {
        throw new GeneratorError(
          `${this.client} cannot represent duplicate cookie names in a cookie mapping.`,
          "GENERATOR_DUPLICATE_COOKIES",
        );
      }
      args.push(`cookies=${pyValue(cookies)}`);
    }
    if (request.auth?.kind === "basic") {
      args.push(
        `auth=(${pyString(request.auth.username)}, ${pyString(request.auth.password)})`,
      );
    }
    args.push(...bodyArguments(request.body, this.client));
    args.push(
      this.client === "requests"
        ? `allow_redirects=${request.options.followRedirects ? "True" : "False"}`
        : `follow_redirects=${request.options.followRedirects ? "True" : "False"}`,
    );
    const method = request.method.toLowerCase();
    const convenience = ["get", "post", "put", "patch", "delete"].includes(
      method,
    );
    const functionName = convenience
      ? `${this.client}.${method}`
      : `${this.client}.request`;
    if (!convenience) args.unshift(pyString(request.method));
    return {
      code: [
        `import ${this.client}`,
        "",
        `response = ${functionName}(`,
        ...args.map((arg) => `    ${indent(arg, 4)},`),
        ")",
      ].join("\n"),
      language: "python",
      client: this.client,
      dependency: `pip install ${this.client}`,
    };
  }
}
