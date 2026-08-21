import { requestUrl } from "@curltocode/core";
import type { HttpRequest } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { cfmlAttribute } from "./literal.js";

/** The verbs `cfhttp`'s method attribute accepts. */
const ALLOWED_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "HEAD",
  "TRACE",
  "OPTIONS",
  "PATCH",
]);

/**
 * ColdFusion and Lucee with `cfhttp`.
 *
 * Each header is its own `cfhttpparam` tag, so a repeated name is sent twice.
 */
export class CfhttpGenerator implements CodeGenerator {
  readonly id = "cfml-cfhttp" as const;
  readonly language = "cfml" as const;
  readonly client = "cfhttp" as const;

  generate(request: HttpRequest): GeneratedCode {
    if (!ALLOWED_METHODS.has(request.method)) {
      throw new GeneratorError(
        `The cfhttp method attribute accepts only ${[...ALLOWED_METHODS].join(", ")}, not ${request.method}.`,
        "GENERATOR_CLIENT_LIMITATION",
      );
    }
    const headers = materializeHeaders(request, {
      basicAuthHeader: false,
      cookieHeader: true,
    });
    const body = request.body;
    const params: string[] = [];

    const applicable =
      body?.kind === "multipart"
        ? // cfhttp writes the multipart Content-Type with its own boundary.
          headers.filter(
            (header) => header.name.toLowerCase() !== "content-type",
          )
        : headers;
    for (const header of applicable) {
      params.push(
        `    <cfhttpparam type="header" name=${cfmlAttribute(header.name)} value=${cfmlAttribute(header.value)}>`,
      );
    }
    if (body?.kind === "multipart") {
      for (const part of body.parts) {
        if (part.kind === "field") {
          params.push(
            `    <cfhttpparam type="formfield" name=${cfmlAttribute(part.name)} value=${cfmlAttribute(part.value)}>`,
          );
          continue;
        }
        const mimeType =
          part.contentType === undefined
            ? ""
            : ` mimetype=${cfmlAttribute(part.contentType)}`;
        params.push(
          `    <cfhttpparam type="file" name=${cfmlAttribute(part.name)} file=${cfmlAttribute(part.path)}${mimeType}>`,
        );
      }
    } else if (body?.kind === "binary" && body.source.kind === "file") {
      params.push(
        `    <cfhttpparam type="body" value="#fileReadBinary(${cfmlAttribute(body.source.path).replaceAll('"', "'")})#">`,
      );
    } else if (body !== undefined) {
      const payload =
        body.kind === "json" || body.kind === "form-urlencoded"
          ? body.raw
          : body.kind === "text"
            ? body.value
            : body.kind === "binary" && body.source.kind === "inline"
              ? body.source.value
              : "";
      params.push(
        `    <cfhttpparam type="body" value=${cfmlAttribute(payload)}>`,
      );
    }

    const attributes = [
      `url=${cfmlAttribute(requestUrl(request))}`,
      `method=${cfmlAttribute(request.method)}`,
      `redirect="${request.options.followRedirects}"`,
      'result="httpResponse"',
      'charset="utf-8"',
    ];
    if (request.auth?.kind === "basic") {
      attributes.push(
        `username=${cfmlAttribute(request.auth.username)}`,
        `password=${cfmlAttribute(request.auth.password)}`,
      );
    }

    return {
      code: [
        `<cfhttp ${attributes.join(" ")}>`,
        ...params,
        "</cfhttp>",
        "",
        "<cfoutput>#httpResponse.fileContent#</cfoutput>",
      ].join("\n"),
      language: this.language,
      client: this.client,
    };
  }
}
