import { requestUrl } from "@curltocode/core";
import type {
  HttpRequest,
  JsonValue,
  MultipartPart,
  RequestBody,
} from "@curltocode/core";

import { hasDuplicateHeaderNames, materializeHeaders } from "../headers.js";
import type {
  CodeGenerator,
  GeneratedCode,
  GeneratorId,
  GeneratorLanguage,
} from "../types.js";
import { GeneratorError } from "../types.js";

const js = (value: string): string => JSON.stringify(value);
const indent = (value: string, spaces: number): string =>
  value.replaceAll("\n", `\n${" ".repeat(spaces)}`);

function jsonCode(value: JsonValue): string {
  return JSON.stringify(value, null, 2);
}

function headersCode(
  request: HttpRequest,
  basicAuthHeader: boolean,
): string | undefined {
  const headers = materializeHeaders(request, {
    basicAuthHeader,
    cookieHeader: true,
  });
  if (headers.length === 0) return undefined;
  if (hasDuplicateHeaderNames(headers)) {
    throw new GeneratorError(
      "Fetch and Axios header containers cannot reliably preserve duplicate request header names.",
      "GENERATOR_DUPLICATE_HEADERS",
    );
  }
  const entries = headers
    .map(({ name, value }) => `  ${js(name)}: ${js(value)}`)
    .join(",\n");
  return `{\n${entries},\n}`;
}

function multipartPrelude(parts: readonly MultipartPart[]): {
  readonly prelude: readonly string[];
  readonly expression: string;
} {
  const lines = ["const formData = new FormData();"];
  for (const part of parts) {
    if (part.kind === "file") {
      throw new GeneratorError(
        `Browser JavaScript cannot safely resolve the local multipart file reference ${part.path}. Select the file in your application and append its File object explicitly.`,
        "GENERATOR_FILE_REFERENCE",
      );
    }
    lines.push(`formData.append(${js(part.name)}, ${js(part.value)});`);
  }
  return { prelude: lines, expression: "formData" };
}

function bodyCode(body: RequestBody | undefined): {
  readonly prelude: readonly string[];
  readonly expression?: string;
} {
  if (body === undefined) return { prelude: [] };
  if (body.kind === "json") {
    const valueCode = jsonCode(body.value);
    return {
      prelude: [],
      expression:
        JSON.stringify(body.value) === body.raw
          ? `JSON.stringify(${valueCode})`
          : js(body.raw),
    };
  }
  if (body.kind === "text") return { prelude: [], expression: js(body.value) };
  if (body.kind === "form-urlencoded") {
    return { prelude: [], expression: js(body.raw) };
  }
  if (body.kind === "multipart") return multipartPrelude(body.parts);
  if (body.source.kind === "inline") {
    return {
      prelude: [],
      expression: `new TextEncoder().encode(${js(body.source.value)})`,
    };
  }
  throw new GeneratorError(
    `Browser JavaScript cannot safely resolve the local binary file reference ${body.source.path}.`,
    "GENERATOR_FILE_REFERENCE",
  );
}

function generateFetch(
  request: HttpRequest,
  language: GeneratorLanguage,
): GeneratedCode {
  if (
    request.body !== undefined &&
    (request.method === "GET" || request.method === "HEAD")
  ) {
    throw new GeneratorError(
      `Fetch does not permit a ${request.method} request body, but the cURL request includes one.`,
      "GENERATOR_UNSUPPORTED_METHOD_BODY",
    );
  }
  const body = bodyCode(request.body);
  const headers = headersCode(request, true);
  const options: string[] = [];
  if (request.method !== "GET" || request.body !== undefined)
    options.push(`method: ${js(request.method)}`);
  if (headers !== undefined) options.push(`headers: ${headers}`);
  if (body.expression !== undefined) options.push(`body: ${body.expression}`);
  if (!request.options.followRedirects) options.push('redirect: "manual"');
  const init = `{\n${options.map((entry) => `  ${indent(entry, 2)}`).join(",\n")}\n}`;
  const typedInit =
    language === "typescript" ? `${init} satisfies RequestInit` : init;
  const call =
    options.length === 0
      ? `const response = await fetch(${js(requestUrl(request))});`
      : `const response = await fetch(${js(requestUrl(request))}, ${typedInit});`;
  return {
    code: [
      ...body.prelude,
      ...(body.prelude.length > 0 ? [""] : []),
      call,
    ].join("\n"),
    language,
    client: "fetch",
  };
}

function generateAxios(
  request: HttpRequest,
  language: GeneratorLanguage,
): GeneratedCode {
  const body = bodyCode(request.body);
  const headers = headersCode(request, false);
  const entries = [
    `url: ${js(requestUrl(request))}`,
    `method: ${js(request.method.toLowerCase())}`,
  ];
  if (headers !== undefined) entries.push(`headers: ${headers}`);
  if (request.auth?.kind === "basic") {
    entries.push(
      `auth: { username: ${js(request.auth.username)}, password: ${js(request.auth.password)} }`,
    );
  }
  if (body.expression !== undefined) entries.push(`data: ${body.expression}`);
  if (!request.options.followRedirects) entries.push("maxRedirects: 0");
  const typeImport =
    language === "typescript" ? ", { type AxiosRequestConfig }" : "";
  const annotation =
    language === "typescript" ? " satisfies AxiosRequestConfig" : "";
  return {
    code: [
      `import axios${typeImport} from "axios";`,
      "",
      ...body.prelude,
      ...(body.prelude.length > 0 ? [""] : []),
      "const response = await axios({",
      ...entries.map((entry) => `  ${indent(entry, 2)},`),
      `}${annotation});`,
    ].join("\n"),
    language,
    client: "axios",
    dependency: "npm install axios",
  };
}

export class JavaScriptGenerator implements CodeGenerator {
  readonly id: GeneratorId;

  constructor(
    readonly language: "javascript" | "typescript",
    readonly client: "fetch" | "axios",
  ) {
    this.id = `${language}-${client}`;
  }

  generate(request: HttpRequest): GeneratedCode {
    return this.client === "fetch"
      ? generateFetch(request, this.language)
      : generateAxios(request, this.language);
  }
}
