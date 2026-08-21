import { requestUrl } from "@curltocode/core";
import type { HttpRequest } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";

/**
 * The normalized request itself, as JSON.
 *
 * Every other target loses something to the shape of its client library: a
 * mapping cannot hold a repeated header, a form helper re-encodes the payload.
 * This one is lossless by construction, which makes it the format to reach for
 * when a request has to be stored, diffed, or fed to another program rather
 * than executed.
 *
 * Content types the request only implies are written out, so a consumer does
 * not have to re-derive them from the body kind.
 */
export class JsonRequestGenerator implements CodeGenerator {
  readonly id = "json-request" as const;
  readonly language = "json" as const;
  readonly client = "request" as const;

  generate(request: HttpRequest): GeneratedCode {
    const document = {
      method: request.method,
      url: requestUrl(request),
      headers: materializeHeaders(request, {
        // Authentication and cookies keep their own structured fields, so
        // folding them into the header list too would state them twice.
        basicAuthHeader: false,
        cookieHeader: false,
      }),
      cookies: request.cookies,
      ...(request.auth === undefined ? {} : { auth: request.auth }),
      ...(request.body === undefined ? {} : { body: request.body }),
      options: request.options,
    };
    return {
      code: JSON.stringify(document, null, 2),
      language: this.language,
      client: this.client,
    };
  }
}
