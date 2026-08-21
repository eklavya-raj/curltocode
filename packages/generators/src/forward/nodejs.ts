import { requestUrl } from "@curltocode/core";
import type { HttpRequest } from "@curltocode/core";

import { hasDuplicateHeaderNames, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import {
  fsImportLine,
  js,
  nodeBody,
  nodeStreamBody,
  rejectBodyOnBodylessMethod,
} from "./node-shared.js";

/** Node's own default redirect budget, written out so the policy is explicit. */
const DEFAULT_REDIRECTS = 20;

function headerObject(
  request: HttpRequest,
  client: string,
  options: { readonly basicAuthHeader: boolean },
): {
  readonly code: string | undefined;
  readonly contentType: string | undefined;
} {
  const headers = materializeHeaders(request, {
    basicAuthHeader: options.basicAuthHeader,
    cookieHeader: true,
  });
  if (hasDuplicateHeaderNames(headers)) {
    throw new GeneratorError(
      `${client} takes request headers as an object, so a repeated header name cannot be sent twice.`,
      "GENERATOR_DUPLICATE_HEADERS",
    );
  }
  const contentType = headers.find(
    (header) => header.name.toLowerCase() === "content-type",
  )?.value;
  if (headers.length === 0) return { code: undefined, contentType };
  return {
    code: `{\n${headers
      .map(({ name, value }) => `    ${js(name)}: ${js(value)},`)
      .join("\n")}\n  }`,
    contentType,
  };
}

/**
 * Node.js with the global `fetch`.
 *
 * Identical in shape to the browser target, and different in the one way that
 * matters: `openAsBlob` resolves a local path, so a file upload converts
 * instead of being refused.
 */
export class NodeFetchGenerator implements CodeGenerator {
  readonly id = "nodejs-fetch" as const;
  readonly language = "nodejs" as const;
  readonly client = "fetch" as const;

  generate(request: HttpRequest): GeneratedCode {
    rejectBodyOnBodylessMethod(request.method, request.body, "Fetch");
    const { code: headers, contentType } = headerObject(request, "Fetch", {
      basicAuthHeader: true,
    });
    const body = nodeBody(request.body, contentType);

    const options: string[] = [`  method: ${js(request.method)},`];
    if (headers !== undefined) options.push(`  headers: ${headers},`);
    if (body.expression !== undefined) {
      options.push(`  body: ${body.expression},`);
    }
    if (!request.options.followRedirects) options.push('  redirect: "manual",');

    return {
      code: [
        ...fsImportLine(body.fsImports),
        ...(body.fsImports.length > 0 ? [""] : []),
        ...body.prelude,
        ...(body.prelude.length > 0 ? [""] : []),
        `const response = await fetch(${js(requestUrl(request))}, {`,
        ...options,
        "});",
        "",
        "console.log(await response.text());",
      ].join("\n"),
      language: this.language,
      client: this.client,
    };
  }
}

/** Node.js with Axios, which accepts a read stream for a large upload. */
export class NodeAxiosGenerator implements CodeGenerator {
  readonly id = "nodejs-axios" as const;
  readonly language = "nodejs" as const;
  readonly client = "axios" as const;

  generate(request: HttpRequest): GeneratedCode {
    const { code: headers } = headerObject(request, "Axios", {
      basicAuthHeader: false,
    });
    const body = nodeStreamBody(request.body);

    const entries = [
      `  url: ${js(requestUrl(request))},`,
      `  method: ${js(request.method.toLowerCase())},`,
    ];
    if (headers !== undefined) entries.push(`  headers: ${headers},`);
    if (request.auth?.kind === "basic") {
      entries.push(
        `  auth: { username: ${js(request.auth.username)}, password: ${js(request.auth.password)} },`,
      );
    }
    if (body.expression !== undefined)
      entries.push(`  data: ${body.expression},`);
    entries.push(
      `  maxRedirects: ${request.options.followRedirects ? DEFAULT_REDIRECTS : 0},`,
    );

    return {
      code: [
        'import axios from "axios";',
        ...fsImportLine(body.fsImports),
        "",
        ...body.prelude,
        ...(body.prelude.length > 0 ? [""] : []),
        "const response = await axios({",
        ...entries,
        "});",
        "",
        "console.log(response.data);",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: "npm install axios",
    };
  }
}

/** Node.js with Got. */
export class GotGenerator implements CodeGenerator {
  readonly id = "nodejs-got" as const;
  readonly language = "nodejs" as const;
  readonly client = "got" as const;

  generate(request: HttpRequest): GeneratedCode {
    const { code: headers } = headerObject(request, "Got", {
      basicAuthHeader: true,
    });
    const body = nodeStreamBody(request.body);

    const options = [`  method: ${js(request.method)},`];
    if (headers !== undefined) options.push(`  headers: ${headers},`);
    if (body.expression !== undefined) {
      options.push(`  body: ${body.expression},`);
    }
    options.push(
      `  followRedirect: ${request.options.followRedirects},`,
      // Got retries and throws on non-2xx by default; cURL does neither, so
      // both are turned off to keep the converted request faithful.
      "  retry: { limit: 0 },",
      "  throwHttpErrors: false,",
    );

    return {
      code: [
        'import got from "got";',
        ...fsImportLine(body.fsImports),
        "",
        ...body.prelude,
        ...(body.prelude.length > 0 ? [""] : []),
        `const response = await got(${js(requestUrl(request))}, {`,
        ...options,
        "});",
        "",
        "console.log(response.body);",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: "npm install got",
    };
  }
}

/** Node.js with Ky, a small wrapper over fetch. */
export class KyGenerator implements CodeGenerator {
  readonly id = "nodejs-ky" as const;
  readonly language = "nodejs" as const;
  readonly client = "ky" as const;

  generate(request: HttpRequest): GeneratedCode {
    rejectBodyOnBodylessMethod(request.method, request.body, "Ky");
    const { code: headers, contentType } = headerObject(request, "Ky", {
      basicAuthHeader: true,
    });
    const body = nodeBody(request.body, contentType);

    const options = [`  method: ${js(request.method)},`];
    if (headers !== undefined) options.push(`  headers: ${headers},`);
    if (body.expression !== undefined) {
      options.push(`  body: ${body.expression},`);
    }
    if (!request.options.followRedirects) options.push('  redirect: "manual",');
    options.push(
      // Ky retries idempotent requests and throws on non-2xx by default; cURL
      // sends exactly one request and reports whatever comes back.
      "  retry: 0,",
      "  throwHttpErrors: false,",
    );

    return {
      code: [
        'import ky from "ky";',
        ...fsImportLine(body.fsImports),
        "",
        ...body.prelude,
        ...(body.prelude.length > 0 ? [""] : []),
        `const response = await ky(${js(requestUrl(request))}, {`,
        ...options,
        "});",
        "",
        "console.log(await response.text());",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: "npm install ky",
    };
  }
}
