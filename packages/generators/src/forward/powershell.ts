import { requestUrl } from "@curltocode/core";
import type { HttpRequest, RequestBody } from "@curltocode/core";

import { hasDuplicateHeaderNames, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode, GeneratorId } from "../types.js";
import { GeneratorError } from "../types.js";

/**
 * Methods `-Method` accepts as a `WebRequestMethod`. Anything else has to go
 * through `-CustomMethod`, which exists precisely for verbs the enum omits.
 */
const ENUM_METHODS = new Set([
  "DEFAULT",
  "DELETE",
  "GET",
  "HEAD",
  "MERGE",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
  "TRACE",
]);

/** PowerShell's default redirect budget, written out for the same reason wget's is. */
const DEFAULT_MAX_REDIRECTION = 5;

/**
 * Single-quoted PowerShell strings are literal: no `$` interpolation, no
 * backtick escapes, and newlines may appear directly. Only the quote itself
 * needs handling, by doubling it.
 */
function psString(value: string): string {
  if (value.includes("\0")) {
    throw new GeneratorError(
      "A PowerShell string literal cannot contain a null byte, so this request cannot be written as a cmdlet invocation.",
      "GENERATOR_UNSUPPORTED_BODY",
    );
  }
  return `'${value.replaceAll("'", "''")}'`;
}

interface PowerShellBody {
  /** Statements emitted before the cmdlet invocation. */
  readonly prelude: readonly string[];
  /** Parameters appended to the invocation. */
  readonly parameters: readonly string[];
  /** Whether the body form already carries its own content type. */
  readonly ownContentType: boolean;
}

function multipartBody(
  body: Extract<RequestBody, { kind: "multipart" }>,
): PowerShellBody {
  const typed = body.parts.find(
    (part) => part.kind === "file" && part.contentType !== undefined,
  );
  if (typed !== undefined) {
    throw new GeneratorError(
      `-Form derives each part's Content-Type from the file itself, so the declared media type for ${typed.name} cannot be set. Pick a client that builds the multipart body explicitly.`,
      "GENERATOR_CLIENT_LIMITATION",
    );
  }
  const names = new Set<string>();
  const entries = body.parts.map((part) => {
    if (names.has(part.name)) {
      throw new GeneratorError(
        `-Form takes a hashtable, so the repeated multipart field ${part.name} cannot be sent twice.`,
        "GENERATOR_UNSUPPORTED_BODY",
      );
    }
    names.add(part.name);
    const value =
      part.kind === "field"
        ? psString(part.value)
        : `Get-Item ${psString(part.path)}`;
    return `    ${psString(part.name)} = ${value}`;
  });
  return {
    prelude: ["$form = @{", ...entries, "}", ""],
    parameters: ["-Form $form"],
    ownContentType: true,
  };
}

function powerShellBody(body: RequestBody | undefined): PowerShellBody {
  if (body === undefined) {
    return { prelude: [], parameters: [], ownContentType: false };
  }
  if (body.kind === "multipart") return multipartBody(body);
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return {
      prelude: [`$body = ${psString(body.raw)}`, ""],
      parameters: ["-Body $body"],
      ownContentType: false,
    };
  }
  if (body.kind === "text") {
    return {
      prelude: [`$body = ${psString(body.value)}`, ""],
      parameters: ["-Body $body"],
      ownContentType: false,
    };
  }
  if (body.source.kind === "file") {
    // -InFile streams the file, so the payload never has to be materialized
    // into a PowerShell string.
    return {
      prelude: [],
      parameters: [`-InFile ${psString(body.source.path)}`],
      ownContentType: false,
    };
  }
  return {
    prelude: [
      `$body = [System.Text.Encoding]::UTF8.GetBytes(${psString(body.source.value)})`,
      "",
    ],
    parameters: ["-Body $body"],
    ownContentType: false,
  };
}

export class PowerShellGenerator implements CodeGenerator {
  readonly id: GeneratorId;
  readonly language = "powershell" as const;

  constructor(readonly client: "restmethod" | "webrequest") {
    this.id = `powershell-${client}`;
  }

  private get cmdlet(): string {
    return this.client === "restmethod"
      ? "Invoke-RestMethod"
      : "Invoke-WebRequest";
  }

  generate(request: HttpRequest): GeneratedCode {
    const materialized = materializeHeaders(request, {
      // Building a PSCredential inline needs ConvertTo-SecureString and a
      // -AllowUnencryptedAuthentication caveat over plain HTTP; the precomputed
      // header is both shorter and exactly what cURL's -u sends.
      basicAuthHeader: true,
      cookieHeader: true,
    });
    if (hasDuplicateHeaderNames(materialized)) {
      throw new GeneratorError(
        "-Headers takes a hashtable, so a repeated request header name cannot be sent twice.",
        "GENERATOR_DUPLICATE_HEADERS",
      );
    }
    const body = powerShellBody(request.body);

    // -ContentType and a Content-Type entry in -Headers are two ways to set the
    // same field, and supplying both is an error in Windows PowerShell. The
    // dedicated parameter wins.
    const contentType = body.ownContentType
      ? undefined
      : materialized.find(
          (header) => header.name.toLowerCase() === "content-type",
        )?.value;
    const headers = materialized.filter(
      (header) =>
        !(
          contentType !== undefined &&
          header.name.toLowerCase() === "content-type"
        ),
    );

    const lines: string[] = [];
    if (headers.length > 0) {
      lines.push(
        "$headers = @{",
        ...headers.map(
          ({ name, value }) => `    ${psString(name)} = ${psString(value)}`,
        ),
        "}",
        "",
      );
    }
    lines.push(...body.prelude);

    const parameters = [`-Uri ${psString(requestUrl(request))}`];
    parameters.push(
      ENUM_METHODS.has(request.method)
        ? `-Method ${psString(request.method)}`
        : `-CustomMethod ${psString(request.method)}`,
    );
    if (headers.length > 0) parameters.push("-Headers $headers");
    if (contentType !== undefined) {
      parameters.push(`-ContentType ${psString(contentType)}`);
    }
    parameters.push(...body.parameters);
    parameters.push(
      `-MaximumRedirection ${request.options.followRedirects ? DEFAULT_MAX_REDIRECTION : 0}`,
    );

    lines.push(
      `$response = ${this.cmdlet} \``,
      ...parameters.map(
        (parameter, index) =>
          `    ${parameter}${index === parameters.length - 1 ? "" : " `"}`,
      ),
      "",
      // Invoke-RestMethod already returns the deserialized payload; the web
      // request cmdlet returns the whole response object.
      this.client === "restmethod" ? "$response" : "$response.Content",
    );

    return {
      code: lines.join("\n"),
      language: this.language,
      client: this.client,
    };
  }
}
