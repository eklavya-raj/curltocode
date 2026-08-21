import { requestUrl } from "@curltocode/core";
import type { HttpRequest } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { ocamlString } from "./literal.js";
import {
  assertNoBoundaryCollision,
  MULTIPART_CONTENT_TYPE,
  MULTIPART_EPILOGUE,
  multipartPartHeader,
} from "./multipart.js";

/** Verbs Cohttp names as a polymorphic variant of their own. */
const NAMED_METHODS = new Set([
  "GET",
  "POST",
  "HEAD",
  "DELETE",
  "PATCH",
  "PUT",
  "OPTIONS",
  "TRACE",
  "CONNECT",
]);

/**
 * OCaml with Cohttp and Lwt.
 *
 * `Header.add` appends, so a repeated header name survives. Cohttp does not
 * follow redirects at all, which is why `-L` is refused rather than ignored.
 */
export class CohttpGenerator implements CodeGenerator {
  readonly id = "ocaml-cohttp" as const;
  readonly language = "ocaml" as const;
  readonly client = "cohttp" as const;

  generate(request: HttpRequest): GeneratedCode {
    if (request.options.followRedirects) {
      throw new GeneratorError(
        "Cohttp does not follow redirects; a 3xx response has to be re-requested by hand.",
        "GENERATOR_CLIENT_LIMITATION",
      );
    }
    const materialized = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    const body = request.body;

    const prelude: string[] = [];
    let bodyExpression = "Cohttp_lwt.Body.empty";
    let contentType: string | undefined;

    if (body?.kind === "multipart") {
      const chunks: string[] = [];
      for (const part of body.parts) {
        chunks.push(`         ${ocamlString(multipartPartHeader(part))};`);
        if (part.kind === "field") {
          assertNoBoundaryCollision(part.name, part.value);
          chunks.push(`         ${ocamlString(part.value)};`);
        } else {
          chunks.push(
            `         In_channel.with_open_bin ${ocamlString(part.path)} In_channel.input_all;`,
          );
        }
        chunks.push(`         ${ocamlString("\r\n")};`);
      }
      chunks.push(`         ${ocamlString(MULTIPART_EPILOGUE)};`);
      prelude.push(
        "     let payload =",
        '       String.concat ""',
        "         [",
        ...chunks,
        "         ]",
        "     in",
      );
      bodyExpression = "Cohttp_lwt.Body.of_string payload";
      contentType = MULTIPART_CONTENT_TYPE;
    } else if (body?.kind === "binary" && body.source.kind === "file") {
      prelude.push(
        `     let payload = In_channel.with_open_bin ${ocamlString(body.source.path)} In_channel.input_all in`,
      );
      bodyExpression = "Cohttp_lwt.Body.of_string payload";
    } else if (body !== undefined) {
      const payload =
        body.kind === "json" || body.kind === "form-urlencoded"
          ? body.raw
          : body.kind === "text"
            ? body.value
            : body.kind === "binary" && body.source.kind === "inline"
              ? body.source.value
              : "";
      bodyExpression = `Cohttp_lwt.Body.of_string ${ocamlString(payload)}`;
    }

    const headers =
      contentType === undefined
        ? materialized
        : [
            ...materialized.filter(
              (header) => header.name.toLowerCase() !== "content-type",
            ),
            { name: "Content-Type", value: contentType },
          ];

    const method = NAMED_METHODS.has(request.method)
      ? `\`${request.method}`
      : `\`Other ${ocamlString(request.method)}`;

    return {
      code: [
        "open Lwt.Syntax",
        "",
        "let () =",
        "  Lwt_main.run",
        "    (let headers =",
        "       Cohttp.Header.of_list",
        "         [",
        ...headers.map(
          ({ name, value }) =>
            `           (${ocamlString(name)}, ${ocamlString(value)});`,
        ),
        "         ]",
        "     in",
        ...prelude,
        `     let body = ${bodyExpression} in`,
        "     let* _, response_body =",
        `       Cohttp_lwt_unix.Client.call ~headers ~body ${method}`,
        `         (Uri.of_string ${ocamlString(requestUrl(request))})`,
        "     in",
        "     let* text = Cohttp_lwt.Body.to_string response_body in",
        "     Lwt_io.printl text)",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: "opam install cohttp-lwt-unix",
    };
  }
}
