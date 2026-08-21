import { requestUrl } from "@curltocode/core";
import type { HttpRequest } from "@curltocode/core";

import { hasHeader } from "./headers.js";
import { GeneratorError } from "./types.js";

export interface GeneratedCurl {
  readonly code: string;
  readonly shell: "posix";
  /**
   * Environment variables the command expects, in the order they appear, with
   * the value each one stands for. Empty unless secrets were lifted out.
   */
  readonly variables: readonly {
    readonly name: string;
    readonly value: string;
  }[];
}

export interface CurlOptions {
  /**
   * `environment` replaces credentials with shell variable references, so the
   * command can be pasted into a README, a ticket, or a CI file without the
   * token going with it. The default keeps every value inline, which is what a
   * command you are about to run needs.
   */
  readonly secrets?: "inline" | "environment";
}

/**
 * Header names whose value is a credential.
 *
 * Deliberately a short list of fields that carry nothing but a secret. A header
 * that merely *may* contain one — a `Referer`, a custom trace header — is left
 * alone, because replacing it would change a request in a way the reader did
 * not ask for.
 */
const SECRET_HEADERS: ReadonlySet<string> = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "x-api-key",
  "api-key",
  "x-auth-token",
  "x-access-token",
]);

/** A shell variable name derived from what the value is for. */
function variableName(source: string): string {
  const name = source
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  return /^[0-9]/u.test(name) ? `V_${name}` : name;
}

/**
 * A double-quoted shell word with variable references left live.
 *
 * Single quotes cannot be used here: the shell does not expand anything inside
 * them, so `$TOKEN` would be sent literally.
 */
function quoteInterpolated(
  segments: readonly (
    { readonly text: string } | { readonly variable: string }
  )[],
): string {
  const body = segments
    .map((segment) =>
      "variable" in segment
        ? `$${segment.variable}`
        : segment.text.replaceAll(/[\\"`$]/gu, (character) => `\\${character}`),
    )
    .join("");
  return `"${body}"`;
}

export function quoteShell(value: string): string {
  if (value.includes("\0")) {
    throw new GeneratorError(
      "POSIX shell arguments cannot contain a null byte, so this request cannot be represented as a cURL command.",
      "GENERATOR_SHELL_LIMITATION",
    );
  }
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function generateCurl(
  request: HttpRequest,
  options: CurlOptions = {},
): GeneratedCurl {
  const lift = options.secrets === "environment";
  const variables: { name: string; value: string }[] = [];
  /** Record a value under a variable name, reusing one already taken. */
  const capture = (source: string, value: string): string => {
    const base = variableName(source);
    const existing = variables.find((entry) => entry.name === base);
    if (existing !== undefined && existing.value === value) return base;
    let name = base;
    let suffix = 2;
    while (variables.some((entry) => entry.name === name)) {
      name = `${base}_${suffix}`;
      suffix += 1;
    }
    variables.push({ name, value });
    return name;
  };

  const parts = [`curl ${quoteShell(requestUrl(request))}`];
  if (request.method !== "GET") parts.push(`-X ${request.method}`);
  if (request.options.followRedirects) parts.push("-L");
  for (const header of request.headers) {
    if (lift && SECRET_HEADERS.has(header.name.toLowerCase())) {
      // `Bearer <token>` and `Basic <credentials>` name a scheme that is not
      // itself secret, so only the credential after it is replaced.
      const scheme = /^(\S+ )(.+)$/u.exec(header.value);
      const keepScheme =
        scheme !== null &&
        /^(?:bearer|basic|token|digest) $/iu.test(scheme[1] ?? "");
      const secret = keepScheme ? (scheme?.[2] ?? "") : header.value;
      const name = capture(header.name, secret);
      parts.push(
        `-H ${quoteInterpolated([
          { text: `${header.name}: ${keepScheme ? (scheme?.[1] ?? "") : ""}` },
          { variable: name },
        ])}`,
      );
      continue;
    }
    parts.push(`-H ${quoteShell(`${header.name}: ${header.value}`)}`);
  }
  const body = request.body;
  const implicitCurlContentType =
    body?.kind === "form-urlencoded" || body?.kind === "binary"
      ? "application/x-www-form-urlencoded"
      : undefined;
  const bodyContentType =
    body?.kind === "json"
      ? "application/json"
      : body?.kind === "text"
        ? (body.contentType ?? "text/plain;charset=UTF-8")
        : body?.kind === "binary"
          ? body.contentType
          : body?.kind === "form-urlencoded"
            ? "application/x-www-form-urlencoded"
            : undefined;
  if (
    bodyContentType !== undefined &&
    bodyContentType !== implicitCurlContentType &&
    !hasHeader(request.headers, "content-type")
  ) {
    parts.push(`-H ${quoteShell(`Content-Type: ${bodyContentType}`)}`);
  }
  if (request.auth?.kind === "basic") {
    const { username, password } = request.auth;
    parts.push(
      lift
        ? `-u ${quoteInterpolated([
            { text: `${username}:` },
            { variable: capture("basic_auth_password", password) },
          ])}`
        : `-u ${quoteShell(`${username}:${password}`)}`,
    );
  } else if (
    request.auth?.kind === "bearer" &&
    !hasHeader(request.headers, "authorization")
  ) {
    const { token } = request.auth;
    parts.push(
      lift
        ? `-H ${quoteInterpolated([
            { text: "Authorization: Bearer " },
            { variable: capture("bearer_token", token) },
          ])}`
        : `-H ${quoteShell(`Authorization: Bearer ${token}`)}`,
    );
  }
  if (request.cookies.length > 0 && !hasHeader(request.headers, "cookie")) {
    const cookieHeader = request.cookies
      .map(({ name, value }) => `${name}=${value}`)
      .join("; ");
    parts.push(
      lift
        ? `-b ${quoteInterpolated([{ variable: capture("cookie", cookieHeader) }])}`
        : `-b ${quoteShell(cookieHeader)}`,
    );
  }
  if (body?.kind === "json") parts.push(`--data-raw ${quoteShell(body.raw)}`);
  else if (body?.kind === "text")
    parts.push(`--data-raw ${quoteShell(body.value)}`);
  else if (body?.kind === "form-urlencoded") {
    parts.push(`--data-raw ${quoteShell(body.raw)}`);
  } else if (body?.kind === "binary") {
    parts.push(
      `--data-binary ${quoteShell(body.source.kind === "file" ? `@${body.source.path}` : body.source.value)}`,
    );
  } else if (body?.kind === "multipart") {
    for (const part of body.parts) {
      if (part.kind === "field")
        parts.push(`-F ${quoteShell(`${part.name}=${part.value}`)}`);
      else {
        const metadata = [
          part.contentType === undefined ? "" : `;type=${part.contentType}`,
          part.filename === undefined ? "" : `;filename=${part.filename}`,
        ].join("");
        parts.push(`-F ${quoteShell(`${part.name}=@${part.path}${metadata}`)}`);
      }
    }
  }
  return { code: parts.join(" \\\n  "), shell: "posix", variables };
}
