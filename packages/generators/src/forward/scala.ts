import { requestUrl } from "@curltocode/core";
import type { HttpRequest } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { javaString } from "./literal.js";

/** Verbs sttp exposes as a named `Method` constant. */
const NAMED_METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "DELETE",
  "OPTIONS",
  "PATCH",
  "CONNECT",
  "TRACE",
]);

/**
 * Scala with sttp client4.
 *
 * `.header(name, value)` appends unless asked to replace, so a repeated header
 * name is sent twice.
 */
export class SttpGenerator implements CodeGenerator {
  readonly id = "scala-sttp" as const;
  readonly language = "scala" as const;
  readonly client = "sttp" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: false,
      cookieHeader: true,
    });
    const body = request.body;
    const imports = new Set(["sttp.client4.*", "sttp.client4.quick.*"]);
    const method = NAMED_METHODS.has(request.method)
      ? `Method.${request.method}`
      : `Method(${javaString(request.method)})`;

    const steps = [`  .method(${method}, uri"${requestUrl(request)}")`];
    const applicable =
      body?.kind === "multipart"
        ? // sttp writes the multipart Content-Type with its own boundary.
          headers.filter(
            (header) => header.name.toLowerCase() !== "content-type",
          )
        : headers;
    for (const header of applicable) {
      steps.push(
        `  .header(${javaString(header.name)}, ${javaString(header.value)})`,
      );
    }
    if (request.auth?.kind === "basic") {
      steps.push(
        `  .auth.basic(${javaString(request.auth.username)}, ${javaString(request.auth.password)})`,
      );
    }
    if (body?.kind === "multipart") {
      const parts = body.parts.map((part) => {
        if (part.kind === "field") {
          return `    multipart(${javaString(part.name)}, ${javaString(part.value)}),`;
        }
        imports.add("java.io.File");
        const filename =
          part.filename ?? part.path.split("/").at(-1) ?? part.path;
        const type =
          part.contentType === undefined
            ? ""
            : `.contentType(${javaString(part.contentType)})`;
        return `    multipartFile(${javaString(part.name)}, File(${javaString(part.path)})).fileName(${javaString(filename)})${type},`;
      });
      steps.push(["  .multipartBody(", ...parts, "  )"].join("\n"));
    } else if (body?.kind === "binary" && body.source.kind === "file") {
      imports.add("java.io.File");
      steps.push(`  .body(File(${javaString(body.source.path)}))`);
    } else if (body !== undefined) {
      const payload =
        body.kind === "json" || body.kind === "form-urlencoded"
          ? body.raw
          : body.kind === "text"
            ? body.value
            : body.kind === "binary" && body.source.kind === "inline"
              ? body.source.value
              : "";
      steps.push(`  .body(${javaString(payload)})`);
    }
    steps.push(`  .followRedirects(${request.options.followRedirects})`);

    return {
      code: [
        ...[...imports].sort().map((entry) => `import ${entry}`),
        "",
        "val response = quickRequest",
        ...steps,
        "  .send()",
        "",
        "println(response.body)",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: '"com.softwaremill.sttp.client4" %% "core" % "4.0.26"',
    };
  }
}
