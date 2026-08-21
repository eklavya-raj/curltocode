import { requestUrl } from "@curltocode/core";
import type { HttpRequest } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { Header } from "@curltocode/core";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { fsImportLine, js } from "./node-shared.js";
import {
  assertNoBoundaryCollision,
  MULTIPART_CONTENT_TYPE,
  MULTIPART_EPILOGUE,
  multipartPartHeader,
} from "./multipart.js";

/**
 * Group headers by name so a repeated name becomes an array value.
 *
 * `node:http` is one of the few clients whose header option takes either a
 * string or an array of strings, which is why this target preserves duplicates
 * where the object-based clients cannot.
 */
function headerEntries(headers: readonly Header[]): readonly string[] {
  const grouped = new Map<string, { name: string; values: string[] }>();
  for (const header of headers) {
    const key = header.name.toLowerCase();
    const existing = grouped.get(key);
    if (existing === undefined) {
      grouped.set(key, { name: header.name, values: [header.value] });
    } else {
      existing.values.push(header.value);
    }
  }
  return [...grouped.values()].map(({ name, values }) => {
    const value =
      values.length === 1
        ? js(values[0]!)
        : `[${values.map((entry) => js(entry)).join(", ")}]`;
    return `    ${js(name)}: ${value},`;
  });
}

/**
 * Node.js with the core `node:http` and `node:https` modules, which need no
 * dependency at all.
 *
 * The module is chosen from the URL's scheme: `node:https` cannot speak plain
 * HTTP and vice versa.
 */
export class NodeHttpsGenerator implements CodeGenerator {
  readonly id = "nodejs-https" as const;
  readonly language = "nodejs" as const;
  readonly client = "https" as const;

  generate(request: HttpRequest): GeneratedCode {
    if (request.options.followRedirects) {
      throw new GeneratorError(
        "The core node:http and node:https modules do not follow redirects; a 3xx response has to be re-requested by hand. Pick a client target that implements a redirect policy.",
        "GENERATOR_CLIENT_LIMITATION",
      );
    }
    const url = requestUrl(request);
    const module = url.startsWith("https:") ? "node:https" : "node:http";
    const body = request.body;
    const multipart = body?.kind === "multipart";
    const materialized = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    const headers = multipart
      ? [
          ...materialized.filter(
            (header) => header.name.toLowerCase() !== "content-type",
          ),
          { name: "Content-Type", value: MULTIPART_CONTENT_TYPE },
        ]
      : materialized;

    const fsImports: string[] = [];
    const writes: string[] = [];
    let end = "req.end();";
    if (body !== undefined) {
      if (body.kind === "multipart") {
        fsImports.push("readFileSync");
        for (const part of body.parts) {
          writes.push(`req.write(${js(multipartPartHeader(part))});`);
          if (part.kind === "field") {
            assertNoBoundaryCollision(part.name, part.value);
            writes.push(`req.write(${js(part.value)});`);
          } else {
            writes.push(`req.write(readFileSync(${js(part.path)}));`);
          }
          writes.push('req.write("\\r\\n");');
        }
        writes.push(`req.write(${js(MULTIPART_EPILOGUE)});`);
      } else if (body.kind === "binary" && body.source.kind === "file") {
        fsImports.push("createReadStream");
        // Piping ends the request itself, so an explicit end() would close it
        // before the file had been written.
        end = `createReadStream(${js(body.source.path)}).pipe(req);`;
      } else {
        const payload =
          body.kind === "json" || body.kind === "form-urlencoded"
            ? body.raw
            : body.kind === "text"
              ? body.value
              : body.kind === "binary" && body.source.kind === "inline"
                ? body.source.value
                : "";
        writes.push(`req.write(${js(payload)});`);
      }
    }

    return {
      code: [
        `import { request } from ${js(module)};`,
        ...fsImportLine(fsImports),
        "",
        "const options = {",
        `  method: ${js(request.method)},`,
        ...(headers.length === 0
          ? []
          : ["  headers: {", ...headerEntries(headers), "  },"]),
        "};",
        "",
        `const req = request(${js(url)}, options, (response) => {`,
        "  const chunks = [];",
        '  response.on("data", (chunk) => chunks.push(chunk));',
        '  response.on("end", () => {',
        '    console.log(Buffer.concat(chunks).toString("utf8"));',
        "  });",
        "});",
        "",
        'req.on("error", (error) => console.error(error));',
        ...writes,
        end,
      ].join("\n"),
      language: this.language,
      client: this.client,
    };
  }
}
