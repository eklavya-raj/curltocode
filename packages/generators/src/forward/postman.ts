import { requestUrl } from "@curltocode/core";
import type { HttpRequest, RequestBody } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";

const SCHEMA =
  "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

interface PostmanBody {
  readonly mode: string;
  readonly raw?: string;
  readonly options?: { readonly raw: { readonly language: string } };
  readonly formdata?: readonly Record<string, string>[];
  readonly file?: { readonly src: string };
}

function postmanBody(body: RequestBody): PostmanBody {
  if (body.kind === "json") {
    return {
      mode: "raw",
      raw: body.raw,
      // Postman uses this only to pick the editor's syntax highlighting; the
      // bytes it sends are `raw` either way.
      options: { raw: { language: "json" } },
    };
  }
  if (body.kind === "text") {
    return {
      mode: "raw",
      raw: body.value,
      options: { raw: { language: "text" } },
    };
  }
  if (body.kind === "form-urlencoded") {
    // Postman's `urlencoded` mode re-encodes each pair on send, which can
    // change the bytes on the wire when the original used a different but
    // equally valid encoding. Raw mode ships what cURL was going to ship; the
    // Content-Type header states the format.
    return {
      mode: "raw",
      raw: body.raw,
      options: { raw: { language: "text" } },
    };
  }
  if (body.kind === "multipart") {
    return {
      mode: "formdata",
      formdata: body.parts.map((part) =>
        part.kind === "field"
          ? { key: part.name, value: part.value, type: "text" }
          : {
              key: part.name,
              type: "file",
              src: part.path,
              ...(part.contentType === undefined
                ? {}
                : { contentType: part.contentType }),
            },
      ),
    };
  }
  return body.source.kind === "file"
    ? { mode: "file", file: { src: body.source.path } }
    : { mode: "raw", raw: body.source.value };
}

/**
 * Postman Collection v2.1, the interchange format Postman, Insomnia, Bruno,
 * Hoppscotch, and Newman all import.
 *
 * Item ids are deliberately omitted. They are optional, and Postman mints one
 * on import; generating a value here would either be random, which breaks
 * determinism, or fixed, which collides when two requests are imported.
 */
export class PostmanGenerator implements CodeGenerator {
  readonly id = "postman-collection" as const;
  readonly language = "postman" as const;
  readonly client = "collection" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      // Postman models authentication separately, so basic credentials go to
      // the auth block rather than a precomputed header.
      basicAuthHeader: false,
      cookieHeader: true,
    });
    const url = new URL(requestUrl(request));
    const name = `${request.method} ${url.pathname}`;

    const auth =
      request.auth?.kind === "basic"
        ? {
            type: "basic",
            basic: [
              { key: "username", value: request.auth.username, type: "string" },
              { key: "password", value: request.auth.password, type: "string" },
            ],
          }
        : undefined;

    const collection = {
      info: { name, schema: SCHEMA },
      item: [
        {
          name,
          request: {
            method: request.method,
            header: headers.map(({ name: key, value }) => ({
              key,
              value,
              type: "text",
            })),
            ...(auth === undefined ? {} : { auth }),
            url: {
              raw: url.toString(),
              protocol: url.protocol.replace(":", ""),
              host: url.hostname.split("."),
              ...(url.port === "" ? {} : { port: url.port }),
              path: url.pathname.replace(/^\//u, "").split("/"),
              ...(url.searchParams.size === 0
                ? {}
                : {
                    query: Array.from(url.searchParams, ([key, value]) => ({
                      key,
                      value,
                    })),
                  }),
            },
            ...(request.body === undefined
              ? {}
              : { body: postmanBody(request.body) }),
          },
          protocolProfileBehavior: {
            followRedirects: request.options.followRedirects,
          },
          response: [],
        },
      ],
    };

    return {
      code: JSON.stringify(collection, null, 2),
      language: this.language,
      client: this.client,
    };
  }
}
