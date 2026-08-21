import { requestUrl } from "@curltocode/core";
import type { HttpRequest, RequestBody } from "@curltocode/core";

import { hasDuplicateHeaderNames, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { shellArgument, shellOption } from "./shell.js";

/**
 * HTTPie's command line, which is a request description rather than a program.
 *
 * Request items are positional: `Name:value` sets a header, `name=value` sets a
 * form or JSON field, and `name@path` attaches a file. Because the separator is
 * the first unescaped occurrence of its character, any of `:`, `=`, and `@`
 * appearing inside a *name* has to be backslash-escaped or HTTPie splits the
 * item in the wrong place.
 */
function escapeItemName(name: string): string {
  return name.replaceAll(/[:=@\\]/gu, (character) => `\\${character}`);
}

function headerItem(name: string, value: string): string {
  // `Name;` is HTTPie's syntax for a header sent with an empty value; the
  // ordinary `Name:` form asks HTTPie to *remove* a header it would have sent.
  return value.length === 0
    ? shellArgument(`${escapeItemName(name)};`)
    : shellOption(`${escapeItemName(name)}:`, value);
}

interface HttpieBody {
  /** Request items appended after the headers. */
  readonly items: readonly string[];
  /** Flags such as `--multipart` that the body form requires. */
  readonly flags: readonly string[];
  /** Trailing shell redirection, used when the body comes from a file. */
  readonly redirect?: string;
}

function multipartBody(
  body: Extract<RequestBody, { kind: "multipart" }>,
): HttpieBody {
  const items = body.parts.map((part) => {
    if (part.kind === "field") {
      return shellOption(`${escapeItemName(part.name)}=`, part.value);
    }
    const options = [
      part.contentType === undefined ? "" : `;type=${part.contentType}`,
      part.filename === undefined ? "" : `;filename=${part.filename}`,
    ].join("");
    return shellOption(
      `${escapeItemName(part.name)}@`,
      `${part.path}${options}`,
    );
  });
  // --multipart forces the multipart encoding even when no part is a file,
  // which `-f` alone would downgrade to form-urlencoded.
  return { items, flags: ["--multipart"] };
}

function httpieBody(body: RequestBody | undefined): HttpieBody {
  if (body === undefined) return { items: [], flags: [] };
  if (body.kind === "multipart") return multipartBody(body);
  // --raw sends the given string as the body verbatim. Every other way of
  // supplying a body to HTTPie re-serializes it, which would not preserve the
  // exact bytes cURL was going to send.
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return { items: [shellOption("--raw=", body.raw)], flags: [] };
  }
  if (body.kind === "text") {
    return { items: [shellOption("--raw=", body.value)], flags: [] };
  }
  if (body.source.kind === "inline") {
    return { items: [shellOption("--raw=", body.source.value)], flags: [] };
  }
  // HTTPie reads a request body from standard input, so a file-backed body is
  // a shell redirection rather than a request item.
  return {
    items: [],
    flags: [],
    redirect: `< ${shellArgument(body.source.path)}`,
  };
}

export class HttpieGenerator implements CodeGenerator {
  readonly id = "httpie-cli" as const;
  readonly language = "httpie" as const;
  readonly client = "cli" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      // HTTPie has a native basic-auth flag, so credentials stay out of the
      // headers; a bearer token has no flag and becomes an Authorization item.
      basicAuthHeader: false,
      cookieHeader: true,
    });
    if (hasDuplicateHeaderNames(headers)) {
      throw new GeneratorError(
        "HTTPie stores request headers in a case-insensitive mapping, so a repeated header name replaces the earlier value instead of being sent twice.",
        "GENERATOR_DUPLICATE_HEADERS",
      );
    }
    const body = httpieBody(request.body);

    const flags = [...body.flags];
    if (request.options.followRedirects) flags.push("--follow");
    if (request.auth?.kind === "basic") {
      flags.push(
        shellOption(
          "--auth=",
          `${request.auth.username}:${request.auth.password}`,
        ),
        "--auth-type=basic",
      );
    }

    const invocation = [
      "http",
      ...flags,
      request.method,
      shellArgument(requestUrl(request)),
    ].join(" ");
    const items = [
      ...headers.map((header) => headerItem(header.name, header.value)),
      ...body.items,
    ];
    if (body.redirect !== undefined) items.push(body.redirect);

    return {
      code: [invocation, ...items].join(" \\\n  "),
      language: this.language,
      client: this.client,
      dependency: "pip install httpie",
    };
  }
}
