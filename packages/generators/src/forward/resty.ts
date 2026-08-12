import { requestUrl } from "@curltocode/core";
import type { HttpRequest, RequestBody } from "@curltocode/core";

import { hasHeader, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { goString } from "./literal.js";

interface RestyBody {
  readonly imports: readonly string[];
  readonly prelude: readonly string[];
  readonly requestLines: readonly string[];
}

function bodyCode(body: RequestBody | undefined): RestyBody {
  if (body === undefined) return { imports: [], prelude: [], requestLines: [] };
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return {
      imports: [],
      prelude: [],
      requestLines: [`request.SetBody(${goString(body.raw)})`],
    };
  }
  if (body.kind === "text") {
    return {
      imports: [],
      prelude: [],
      requestLines: [`request.SetBody(${goString(body.value)})`],
    };
  }
  if (body.kind === "multipart") {
    const prelude: string[] = [];
    const requestLines: string[] = [];
    let fileIndex = 0;
    for (const part of body.parts) {
      if (part.kind === "field") {
        requestLines.push(
          `request.SetMultipartOrderedFormData(${goString(part.name)}, []string{${goString(part.value)}})`,
        );
        continue;
      }
      fileIndex += 1;
      const file = `file${fileIndex}`;
      const filename =
        part.filename ?? part.path.split("/").at(-1) ?? part.path;
      prelude.push(
        `${file}, err := os.Open(${goString(part.path)})`,
        "if err != nil {",
        "\tpanic(err)",
        "}",
        `defer ${file}.Close()`,
      );
      requestLines.push(
        `request.SetMultipartField(${goString(part.name)}, ${goString(filename)}, ${goString(part.contentType ?? "")}, ${file})`,
      );
    }
    return {
      imports: fileIndex > 0 ? ["os"] : [],
      prelude,
      requestLines,
    };
  }
  if (body.source.kind === "inline") {
    return {
      imports: [],
      prelude: [],
      requestLines: [`request.SetBody(${goString(body.source.value)})`],
    };
  }
  return {
    imports: ["os"],
    prelude: [
      `payload, err := os.Open(${goString(body.source.path)})`,
      "if err != nil {",
      "\tpanic(err)",
      "}",
      "defer payload.Close()",
    ],
    requestLines: ["request.SetBody(payload)"],
  };
}

function importBlock(imports: readonly string[]): readonly string[] {
  return [
    "import (",
    ...[...new Set(imports)].sort().map((entry) => `\t${goString(entry)}`),
    ")",
  ];
}

export class RestyGenerator implements CodeGenerator {
  readonly id = "go-resty" as const;
  readonly language = "go" as const;
  readonly client = "resty" as const;

  generate(request: HttpRequest): GeneratedCode {
    if (request.body !== undefined && request.method === "HEAD") {
      throw new GeneratorError(
        "Resty does not expose a safe HEAD-with-body convenience path.",
        "GENERATOR_UNSUPPORTED_METHOD_BODY",
      );
    }
    if (
      request.body?.kind === "multipart" &&
      hasHeader(request.headers, "content-type")
    ) {
      throw new GeneratorError(
        "Resty must generate the multipart Content-Type boundary; an explicit Content-Type header cannot be preserved safely.",
        "GENERATOR_UNSUPPORTED_BODY",
      );
    }
    const headers = materializeHeaders(request, {
      basicAuthHeader: false,
      cookieHeader: true,
    });
    const body = bodyCode(request.body);
    const lines: string[] = ["client := resty.New()", "defer client.Close()"];
    if (!request.options.followRedirects) {
      lines.push("client.SetRedirectPolicy(resty.NoRedirectPolicy())");
    }
    lines.push("", ...body.prelude);
    if (body.prelude.length > 0) lines.push("");
    lines.push("request := client.R()");
    if (request.body !== undefined && request.method === "GET") {
      lines.push("request.SetMethodGetAllowPayload(true)");
    }
    if (request.body !== undefined && request.method === "DELETE") {
      lines.push("request.SetMethodDeleteAllowPayload(true)");
    }
    for (const header of headers) {
      // Request.Header is an http.Header. Add preserves repeated field values.
      lines.push(
        `request.Header.Add(${goString(header.name)}, ${goString(header.value)})`,
      );
    }
    if (request.auth?.kind === "basic") {
      lines.push(
        `request.SetBasicAuth(${goString(request.auth.username)}, ${goString(request.auth.password)})`,
      );
    }
    lines.push(...body.requestLines, "");
    lines.push(
      `response, err := request.Execute(${goString(request.method)}, ${goString(requestUrl(request))})`,
      "if err != nil {",
      "\tpanic(err)",
      "}",
      "",
      "fmt.Println(response.StatusCode())",
      "fmt.Println(response.String())",
    );

    return {
      code: [
        "package main",
        "",
        ...importBlock(["fmt", "resty.dev/v3", ...body.imports]),
        "",
        "func main() {",
        ...lines.map((line) => (line.length === 0 ? "" : `\t${line}`)),
        "}",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: "go get resty.dev/v3",
    };
  }
}
