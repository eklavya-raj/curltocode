import { requestUrl } from "@curltocode/core";
import type { HttpRequest, RequestBody } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { goString } from "./literal.js";

interface GoBody {
  /** Statements emitted before the request is constructed. */
  readonly prelude: readonly string[];
  /** Expression passed as the `http.NewRequest` body argument. */
  readonly reader: string;
  /** Imports required by the body construction. */
  readonly imports: readonly string[];
  /** Content-Type produced by the body itself, such as a multipart boundary. */
  readonly contentTypeExpression?: string;
}

function multipartBody(
  body: Extract<RequestBody, { kind: "multipart" }>,
): GoBody {
  const prelude = [
    "body := &bytes.Buffer{}",
    "writer := multipart.NewWriter(body)",
  ];
  const imports = ["bytes", "mime/multipart"];
  let fileIndex = 0;
  for (const part of body.parts) {
    if (part.kind === "field") {
      prelude.push(
        `if err := writer.WriteField(${goString(part.name)}, ${goString(part.value)}); err != nil {`,
        "\tpanic(err)",
        "}",
      );
      continue;
    }
    // Each file part needs distinct identifiers because Go rejects a short
    // variable declaration that introduces no new name in the same scope.
    fileIndex += 1;
    const fileVar = `file${fileIndex}`;
    const partVar = `part${fileIndex}`;
    const filename = part.filename ?? part.path.split("/").at(-1) ?? part.path;
    imports.push("os", "io");
    prelude.push(
      `${fileVar}, err := os.Open(${goString(part.path)})`,
      "if err != nil {",
      "\tpanic(err)",
      "}",
    );
    if (part.contentType === undefined) {
      prelude.push(
        `${partVar}, err := writer.CreateFormFile(${goString(part.name)}, ${goString(filename)})`,
      );
    } else {
      // CreateFormFile hardcodes application/octet-stream, so an explicit part
      // media type has to go through CreatePart.
      imports.push("net/textproto");
      prelude.push(
        `${partVar}Header := make(textproto.MIMEHeader)`,
        `${partVar}Header.Set("Content-Disposition", ${goString(
          `form-data; name="${part.name}"; filename="${filename}"`,
        )})`,
        `${partVar}Header.Set("Content-Type", ${goString(part.contentType)})`,
        `${partVar}, err := writer.CreatePart(${partVar}Header)`,
      );
    }
    prelude.push(
      "if err != nil {",
      "\tpanic(err)",
      "}",
      `if _, err := io.Copy(${partVar}, ${fileVar}); err != nil {`,
      "\tpanic(err)",
      "}",
      `${fileVar}.Close()`,
    );
  }
  prelude.push("if err := writer.Close(); err != nil {", "\tpanic(err)", "}");
  return {
    prelude,
    reader: "body",
    imports,
    contentTypeExpression: "writer.FormDataContentType()",
  };
}

function goBody(body: RequestBody | undefined): GoBody {
  if (body === undefined) return { prelude: [], reader: "nil", imports: [] };
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return {
      prelude: [`payload := strings.NewReader(${goString(body.raw)})`],
      reader: "payload",
      imports: ["strings"],
    };
  }
  if (body.kind === "text") {
    return {
      prelude: [`payload := strings.NewReader(${goString(body.value)})`],
      reader: "payload",
      imports: ["strings"],
    };
  }
  if (body.kind === "multipart") return multipartBody(body);
  if (body.source.kind === "inline") {
    return {
      prelude: [`payload := strings.NewReader(${goString(body.source.value)})`],
      reader: "payload",
      imports: ["strings"],
    };
  }
  return {
    prelude: [
      `payload, err := os.Open(${goString(body.source.path)})`,
      "if err != nil {",
      "\tpanic(err)",
      "}",
      "defer payload.Close()",
    ],
    reader: "payload",
    imports: ["os"],
  };
}

/**
 * Every generated program imports at least fmt, io, and net/http, so the
 * grouped import form is always the correct one.
 */
function importBlock(imports: readonly string[]): readonly string[] {
  const unique = [...new Set(imports)].sort();
  return ["import (", ...unique.map((entry) => `\t${goString(entry)}`), ")"];
}

export class GoGenerator implements CodeGenerator {
  readonly id = "go-nethttp" as const;
  readonly language = "go" as const;
  readonly client = "nethttp" as const;

  generate(request: HttpRequest): GeneratedCode {
    if (
      request.body !== undefined &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      // net/http permits this, but cURL and the browser clients do not agree on
      // the semantics, so the request is rejected for consistency.
      throw new GeneratorError(
        `A ${request.method} request body is not represented consistently across HTTP clients.`,
        "GENERATOR_UNSUPPORTED_METHOD_BODY",
      );
    }
    const body = goBody(request.body);
    const headers = materializeHeaders(request, {
      basicAuthHeader: false,
      cookieHeader: false,
    });
    const imports = new Set(["fmt", "io", "net/http", ...body.imports]);

    const lines: string[] = [];
    lines.push(...body.prelude);
    if (body.prelude.length > 0) lines.push("");

    const clientExpression = request.options.followRedirects
      ? "http.DefaultClient"
      : "client";
    if (!request.options.followRedirects) {
      lines.push(
        "client := &http.Client{",
        "\tCheckRedirect: func(req *http.Request, via []*http.Request) error {",
        "\t\treturn http.ErrUseLastResponse",
        "\t},",
        "}",
        "",
      );
    }

    lines.push(
      `req, err := http.NewRequest(${goString(request.method)}, ${goString(requestUrl(request))}, ${body.reader})`,
      "if err != nil {",
      "\tpanic(err)",
      "}",
      "",
    );

    for (const header of headers) {
      // Add rather than Set so repeated header names are preserved exactly.
      lines.push(
        `req.Header.Add(${goString(header.name)}, ${goString(header.value)})`,
      );
    }
    if (body.contentTypeExpression !== undefined) {
      lines.push(
        `req.Header.Set("Content-Type", ${body.contentTypeExpression})`,
      );
    }
    for (const cookie of request.cookies) {
      lines.push(
        `req.AddCookie(&http.Cookie{Name: ${goString(cookie.name)}, Value: ${goString(cookie.value)}})`,
      );
    }
    if (request.auth?.kind === "basic") {
      lines.push(
        `req.SetBasicAuth(${goString(request.auth.username)}, ${goString(request.auth.password)})`,
      );
    }
    if (
      headers.length > 0 ||
      request.cookies.length > 0 ||
      request.auth !== undefined ||
      body.contentTypeExpression !== undefined
    ) {
      lines.push("");
    }

    lines.push(
      `res, err := ${clientExpression}.Do(req)`,
      "if err != nil {",
      "\tpanic(err)",
      "}",
      "defer res.Body.Close()",
      "",
      "data, err := io.ReadAll(res.Body)",
      "if err != nil {",
      "\tpanic(err)",
      "}",
      "fmt.Println(string(data))",
    );

    return {
      code: [
        "package main",
        "",
        ...importBlock([...imports]),
        "",
        "func main() {",
        ...lines.map((line) => (line.length === 0 ? "" : `\t${line}`)),
        "}",
      ].join("\n"),
      language: this.language,
      client: this.client,
    };
  }
}
