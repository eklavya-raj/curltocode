import { requestUrl } from "@curltocode/core";
import type { Header, HttpRequest, RequestBody } from "@curltocode/core";

import { hasHeader, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";

const py = (value: string): string =>
  JSON.stringify(value).replaceAll("\\/", "/");

function headerList(headers: readonly Header[]): string {
  return `[\n${headers
    .map(({ name, value }) => `        (${py(name)}, ${py(value)}),`)
    .join("\n")}\n    ]`;
}

interface AiohttpBody {
  readonly prelude: readonly string[];
  readonly argument?: string;
  readonly usesFiles: boolean;
}

function bodyCode(body: RequestBody | undefined): AiohttpBody {
  if (body === undefined) return { prelude: [], usesFiles: false };
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return { prelude: [], argument: `data=${py(body.raw)}`, usesFiles: false };
  }
  if (body.kind === "text") {
    return {
      prelude: [],
      argument: `data=${py(body.value)}`,
      usesFiles: false,
    };
  }
  if (body.kind === "multipart") {
    const lines = ["form = aiohttp.FormData()"];
    let fileIndex = 0;
    for (const part of body.parts) {
      if (part.kind === "field") {
        lines.push(`form.add_field(${py(part.name)}, ${py(part.value)})`);
        continue;
      }
      fileIndex += 1;
      const file = `file_${fileIndex}`;
      const filename =
        part.filename ?? part.path.split("/").at(-1) ?? part.path;
      lines.push(
        `${file} = files.enter_context(open(${py(part.path)}, "rb"))`,
        `form.add_field(${py(part.name)}, ${file}, filename=${py(filename)}${
          part.contentType === undefined
            ? ""
            : `, content_type=${py(part.contentType)}`
        })`,
      );
    }
    return {
      prelude: lines,
      argument: "data=form",
      usesFiles: fileIndex > 0,
    };
  }
  if (body.source.kind === "inline") {
    return {
      prelude: [],
      argument: `data=${py(body.source.value)}.encode("utf-8")`,
      usesFiles: false,
    };
  }
  return {
    prelude: [
      `payload = files.enter_context(open(${py(body.source.path)}, "rb"))`,
    ],
    argument: "data=payload",
    usesFiles: true,
  };
}

export class AiohttpGenerator implements CodeGenerator {
  readonly id = "python-aiohttp" as const;
  readonly language = "python" as const;
  readonly client = "aiohttp" as const;

  generate(request: HttpRequest): GeneratedCode {
    if (
      request.body?.kind === "multipart" &&
      hasHeader(request.headers, "content-type")
    ) {
      throw new GeneratorError(
        "aiohttp must generate the multipart Content-Type boundary; an explicit Content-Type header cannot be preserved safely.",
        "GENERATOR_UNSUPPORTED_BODY",
      );
    }
    const headers = materializeHeaders(request, {
      basicAuthHeader: false,
      cookieHeader: true,
    });
    const body = bodyCode(request.body);
    const arguments_: string[] = [];
    if (headers.length > 0) arguments_.push(`headers=${headerList(headers)}`);
    if (request.auth?.kind === "basic") {
      arguments_.push(
        `auth=aiohttp.BasicAuth(${py(request.auth.username)}, ${py(request.auth.password)})`,
      );
    }
    if (body.argument !== undefined) arguments_.push(body.argument);
    arguments_.push(
      `allow_redirects=${request.options.followRedirects ? "True" : "False"}`,
    );

    const imports = ["import asyncio", "import aiohttp"];
    if (body.usesFiles)
      imports.splice(1, 0, "from contextlib import ExitStack");
    const mainLines: string[] = [];
    const inner: string[] = [];
    inner.push(...body.prelude);
    if (body.prelude.length > 0) inner.push("");
    inner.push(
      "async with aiohttp.ClientSession() as session:",
      `    async with session.request(${py(request.method)}, ${py(requestUrl(request))},`,
      ...arguments_.map(
        (argument) => `        ${argument.replaceAll("\n", "\n        ")},`,
      ),
      "    ) as response:",
      "        print(response.status)",
      "        print(await response.text())",
    );
    if (body.usesFiles) {
      mainLines.push(
        "with ExitStack() as files:",
        ...inner.map((line) => (line.length === 0 ? "" : `    ${line}`)),
      );
    } else {
      mainLines.push(...inner);
    }

    return {
      code: [
        ...imports,
        "",
        "",
        "async def main():",
        ...mainLines.map((line) => (line.length === 0 ? "" : `    ${line}`)),
        "",
        "",
        "asyncio.run(main())",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: "pip install aiohttp",
    };
  }
}
