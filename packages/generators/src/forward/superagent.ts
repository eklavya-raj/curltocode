import { requestUrl } from "@curltocode/core";
import type { HttpRequest } from "@curltocode/core";

import { hasDuplicateHeaderNames, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { fsImportLine, js } from "./node-shared.js";

/** SuperAgent's own default redirect budget. */
const DEFAULT_REDIRECTS = 5;

/**
 * Node.js with SuperAgent.
 *
 * A raw file body is piped into the request rather than buffered, because
 * `.send()` only accepts a string, object, or Buffer.
 */
export class SuperagentGenerator implements CodeGenerator {
  readonly id = "nodejs-superagent" as const;
  readonly language = "nodejs" as const;
  readonly client = "superagent" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: false,
      cookieHeader: true,
    });
    if (hasDuplicateHeaderNames(headers)) {
      throw new GeneratorError(
        "SuperAgent's .set() writes each header through setHeader, so a repeated name replaces the earlier value instead of being sent twice.",
        "GENERATOR_DUPLICATE_HEADERS",
      );
    }
    const body = request.body;
    const multipart = body?.kind === "multipart";

    const chain: string[] = [];
    const applicable = multipart
      ? // SuperAgent writes its own Content-Type with the boundary it builds.
        headers.filter((header) => header.name.toLowerCase() !== "content-type")
      : headers;
    if (applicable.length > 0) {
      chain.push(
        "  .set({",
        ...applicable.map(
          ({ name, value }) => `    ${js(name)}: ${js(value)},`,
        ),
        "  })",
      );
    }
    if (request.auth?.kind === "basic") {
      chain.push(
        `  .auth(${js(request.auth.username)}, ${js(request.auth.password)})`,
      );
    }
    chain.push(
      `  .redirects(${request.options.followRedirects ? DEFAULT_REDIRECTS : 0})`,
      // SuperAgent rejects the promise on a non-2xx status; cURL prints the
      // response whatever it is.
      "  .ok(() => true)",
    );

    const fsImports: string[] = [];
    const trailer: string[] = [];
    if (body !== undefined) {
      if (body.kind === "multipart") {
        for (const part of body.parts) {
          if (part.kind === "field") {
            chain.push(`  .field(${js(part.name)}, ${js(part.value)})`);
            continue;
          }
          const filename =
            part.filename ?? part.path.split("/").at(-1) ?? part.path;
          const options = [`filename: ${js(filename)}`];
          if (part.contentType !== undefined) {
            options.push(`contentType: ${js(part.contentType)}`);
          }
          chain.push(
            `  .attach(${js(part.name)}, ${js(part.path)}, { ${options.join(", ")} })`,
          );
        }
      } else if (body.kind === "binary" && body.source.kind === "file") {
        fsImports.push("createReadStream");
        trailer.push(
          "",
          `createReadStream(${js(body.source.path)}).pipe(request);`,
        );
      } else {
        const payload =
          body.kind === "json" || body.kind === "form-urlencoded"
            ? body.raw
            : body.kind === "text"
              ? body.value
              : body.kind === "binary" && body.source.kind === "inline"
                ? body.source.value
                : "";
        chain.push(`  .send(${js(payload)})`);
      }
    }

    return {
      code: [
        'import superagent from "superagent";',
        ...fsImportLine(fsImports),
        "",
        `const request = superagent(${js(request.method)}, ${js(requestUrl(request))})`,
        // The statement is terminated on its last chained call rather than on a
        // line of its own.
        ...chain.map((line, index) =>
          index === chain.length - 1 ? `${line};` : line,
        ),
        ...trailer,
        "",
        "const response = await request;",
        "console.log(response.text);",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: "npm install superagent",
    };
  }
}
