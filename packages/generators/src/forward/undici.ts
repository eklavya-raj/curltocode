import { requestUrl } from "@curltocode/core";
import type { HttpRequest, MultipartPart, RequestBody } from "@curltocode/core";

import { hasHeader, materializeHeaders } from "../headers.js";
import type {
  CodeGenerator,
  GeneratedCode,
  GeneratorLanguage,
} from "../types.js";
import { GeneratorError } from "../types.js";

const js = (value: string): string => JSON.stringify(value);

interface UndiciBody {
  readonly imports: readonly string[];
  readonly prelude: readonly string[];
  readonly expression?: string;
}

function multipartBody(parts: readonly MultipartPart[]): UndiciBody {
  const imports: string[] = [];
  const lines = ["const formData = new FormData();"];
  for (const part of parts) {
    if (part.kind === "field") {
      lines.push(`formData.append(${js(part.name)}, ${js(part.value)});`);
      continue;
    }
    imports.push("readFile");
    const filename = part.filename ?? part.path.split("/").at(-1) ?? part.path;
    const blobOptions =
      part.contentType === undefined
        ? ""
        : `, { type: ${js(part.contentType)} }`;
    lines.push(
      `formData.append(${js(part.name)}, new Blob([await readFile(${js(part.path)})]${blobOptions}), ${js(filename)});`,
    );
  }
  return { imports, prelude: lines, expression: "formData" };
}

function bodyCode(body: RequestBody | undefined): UndiciBody {
  if (body === undefined) return { imports: [], prelude: [] };
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return { imports: [], prelude: [], expression: js(body.raw) };
  }
  if (body.kind === "text") {
    return { imports: [], prelude: [], expression: js(body.value) };
  }
  if (body.kind === "multipart") return multipartBody(body.parts);
  if (body.source.kind === "inline") {
    return {
      imports: [],
      prelude: [],
      expression: `new TextEncoder().encode(${js(body.source.value)})`,
    };
  }
  return {
    imports: ["readFile"],
    prelude: [],
    expression: `await readFile(${js(body.source.path)})`,
  };
}

export class UndiciGenerator implements CodeGenerator {
  readonly id: "javascript-undici" | "typescript-undici";
  readonly client = "undici" as const;

  constructor(
    readonly language: Extract<GeneratorLanguage, "javascript" | "typescript">,
  ) {
    this.id = `${language}-undici`;
  }

  generate(request: HttpRequest): GeneratedCode {
    if (
      request.body !== undefined &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      throw new GeneratorError(
        `Undici does not permit a ${request.method} request body through its request API.`,
        "GENERATOR_UNSUPPORTED_METHOD_BODY",
      );
    }
    if (request.method === "CONNECT") {
      throw new GeneratorError(
        "Undici's request API does not support the CONNECT method.",
        "GENERATOR_CLIENT_LIMITATION",
      );
    }
    if (
      request.body?.kind === "multipart" &&
      hasHeader(request.headers, "content-type")
    ) {
      throw new GeneratorError(
        "Undici must generate the multipart Content-Type boundary; an explicit Content-Type header cannot be preserved safely.",
        "GENERATOR_UNSUPPORTED_BODY",
      );
    }
    const headers = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    const expect = headers.find(
      (header) => header.name.toLowerCase() === "expect",
    );
    if (expect !== undefined) {
      throw new GeneratorError(
        "Undici does not support the Expect request header.",
        "GENERATOR_CLIENT_LIMITATION",
      );
    }

    const body = bodyCode(request.body);
    const undiciImports = [
      ...(request.options.followRedirects ? ["Agent", "interceptors"] : []),
      ...(request.body?.kind === "multipart" ? ["FormData"] : []),
      "request",
    ];
    const lines: string[] = [
      `import { ${undiciImports.join(", ")} } from "undici";`,
    ];
    if (body.imports.length > 0) {
      lines.push(
        `import { ${[...new Set(body.imports)].sort().join(", ")} } from "node:fs/promises";`,
      );
    }
    lines.push("");
    if (request.options.followRedirects) {
      lines.push(
        "const dispatcher = new Agent().compose(",
        "  interceptors.redirect({ maxRedirections: 10 }),",
        ");",
        "",
      );
    }
    lines.push(...body.prelude);
    if (body.prelude.length > 0) lines.push("");

    const options: string[] = [`method: ${js(request.method)}`];
    if (headers.length > 0) {
      options.push(
        `headers: [\n${headers
          .flatMap(({ name, value }) => [`  ${js(name)},`, `  ${js(value)},`])
          .join("\n")}\n]`,
      );
    }
    if (body.expression !== undefined) options.push(`body: ${body.expression}`);
    if (request.options.followRedirects) options.push("dispatcher");

    lines.push(
      `const { statusCode, body: responseBody } = await request(${js(requestUrl(request))}, {`,
      ...options.map((option) => `  ${option.replaceAll("\n", "\n  ")},`),
      "});",
      "",
      "console.log(statusCode);",
      "console.log(await responseBody.text());",
    );
    if (request.options.followRedirects)
      lines.push("await dispatcher.close();");

    return {
      code: lines.join("\n"),
      language: this.language,
      client: this.client,
      dependency: "npm install undici",
    };
  }
}
