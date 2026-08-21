import { requestUrl } from "@curltocode/core";
import type { HttpRequest, RequestBody } from "@curltocode/core";

import { hasDuplicateHeaderNames, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { js } from "./node-shared.js";

/**
 * Both of these run on XMLHttpRequest, which follows redirects itself and
 * exposes no way to stop it. cURL without `-L` does the opposite, so the
 * difference is written into the generated code rather than left unsaid.
 */
const REDIRECT_NOTE =
  "// XMLHttpRequest always follows redirects, and neither jQuery nor the raw\n// API can turn that off, so a 3xx will be followed even though cURL without\n// -L would have stopped and shown it.";

interface LegacyBody {
  readonly prelude: readonly string[];
  readonly expression: string | undefined;
  /** True when the client must be told not to set a Content-Type itself. */
  readonly formData: boolean;
}

function legacyBody(body: RequestBody | undefined, client: string): LegacyBody {
  if (body === undefined) {
    return { prelude: [], expression: undefined, formData: false };
  }
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return { prelude: [], expression: js(body.raw), formData: false };
  }
  if (body.kind === "text") {
    return { prelude: [], expression: js(body.value), formData: false };
  }
  if (body.kind === "multipart") {
    const lines = ["const formData = new FormData();"];
    for (const part of body.parts) {
      if (part.kind === "file") {
        throw new GeneratorError(
          `${client} runs in the browser and cannot read the local file ${part.path}. Take the File object from an <input type="file"> and append it instead.`,
          "GENERATOR_FILE_REFERENCE",
        );
      }
      lines.push(`formData.append(${js(part.name)}, ${js(part.value)});`);
    }
    return { prelude: lines, expression: "formData", formData: true };
  }
  if (body.source.kind === "inline") {
    return {
      prelude: [],
      expression: `new Blob([new TextEncoder().encode(${js(body.source.value)})])`,
      formData: false,
    };
  }
  throw new GeneratorError(
    `${client} runs in the browser and cannot read the local file ${body.source.path}.`,
    "GENERATOR_FILE_REFERENCE",
  );
}

/** jQuery's `$.ajax`, still the request layer of a great many existing pages. */
export class JQueryGenerator implements CodeGenerator {
  readonly id = "javascript-jquery" as const;
  readonly language = "javascript" as const;
  readonly client = "jquery" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: true,
      // Matches the Fetch target: the Cookie header is written out so the
      // request stays complete. A browser will substitute its own cookie jar,
      // but every other JavaScript runtime sends what is written here.
      cookieHeader: true,
    });
    if (hasDuplicateHeaderNames(headers)) {
      throw new GeneratorError(
        "jQuery takes request headers as an object, so a repeated header name cannot be sent twice.",
        "GENERATOR_DUPLICATE_HEADERS",
      );
    }
    const body = legacyBody(request.body, "jQuery");
    // `contentType` is jQuery's own option for the field; setting it in both
    // places is how the two end up disagreeing.
    const contentType = headers.find(
      (header) => header.name.toLowerCase() === "content-type",
    )?.value;
    const rest = headers.filter(
      (header) => header.name.toLowerCase() !== "content-type",
    );

    const settings = [`  url: ${js(requestUrl(request))},`];
    settings.push(`  method: ${js(request.method)},`);
    if (rest.length > 0) {
      settings.push(
        "  headers: {",
        ...rest.map(({ name, value }) => `    ${js(name)}: ${js(value)},`),
        "  },",
      );
    }
    if (body.expression !== undefined) {
      settings.push(`  data: ${body.expression},`);
      // Without this jQuery serializes the payload again as a query string.
      settings.push("  processData: false,");
    }
    settings.push(
      body.formData
        ? // FormData must set its own Content-Type so the boundary matches.
          "  contentType: false,"
        : contentType === undefined
          ? "  contentType: false,"
          : `  contentType: ${js(contentType)},`,
    );

    return {
      code: [
        REDIRECT_NOTE,
        ...body.prelude,
        ...(body.prelude.length > 0 ? [""] : []),
        "$.ajax({",
        ...settings,
        "})",
        "  .done((data) => console.log(data))",
        "  .fail((xhr) => console.error(xhr.status, xhr.responseText));",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: "npm install jquery",
    };
  }
}

/** The raw XMLHttpRequest API, with no library at all. */
export class XhrGenerator implements CodeGenerator {
  readonly id = "javascript-xhr" as const;
  readonly language = "javascript" as const;
  readonly client = "xhr" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: true,
      // Matches the Fetch target: the Cookie header is written out so the
      // request stays complete. A browser will substitute its own cookie jar,
      // but every other JavaScript runtime sends what is written here.
      cookieHeader: true,
    });
    if (hasDuplicateHeaderNames(headers)) {
      throw new GeneratorError(
        "XMLHttpRequest.setRequestHeader combines a repeated header name into one comma-separated value rather than sending the field twice, which is not equivalent for every header.",
        "GENERATOR_DUPLICATE_HEADERS",
      );
    }
    const body = legacyBody(request.body, "XMLHttpRequest");
    const applicable = body.formData
      ? // The browser writes the multipart Content-Type with its own boundary.
        headers.filter((header) => header.name.toLowerCase() !== "content-type")
      : headers;

    return {
      code: [
        REDIRECT_NOTE,
        ...body.prelude,
        ...(body.prelude.length > 0 ? [""] : []),
        "const xhr = new XMLHttpRequest();",
        `xhr.open(${js(request.method)}, ${js(requestUrl(request))});`,
        ...applicable.map(
          ({ name, value }) =>
            `xhr.setRequestHeader(${js(name)}, ${js(value)});`,
        ),
        "",
        "xhr.onload = () => console.log(xhr.status, xhr.responseText);",
        "xhr.onerror = () => console.error(xhr.status);",
        `xhr.send(${body.expression ?? ""});`,
      ].join("\n"),
      language: this.language,
      client: this.client,
    };
  }
}
