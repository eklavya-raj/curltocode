import { requestUrl } from "@curltocode/core";
import type { HttpRequest, MultipartPart, RequestBody } from "@curltocode/core";

import { hasDuplicateHeaderNames, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";

/**
 * An `ansible.builtin.uri` task.
 *
 * Scalars are written as JSON. YAML 1.2 is a superset of JSON, so a
 * `JSON.stringify` result is a valid double-quoted YAML scalar, and it is the
 * only quoting style that survives newlines, tabs, and leading or trailing
 * whitespace without folding them.
 */
const yamlScalar = (value: string): string => JSON.stringify(value);

/**
 * Plain YAML keys stay unquoted, which is how a playbook is written by hand.
 * Anything that could be read as another YAML type — a number, a boolean, a
 * value with a colon or leading space — falls back to the quoted form.
 */
const PLAIN_KEY = /^[A-Za-z][A-Za-z0-9_.-]*$/u;

const yamlKey = (name: string): string =>
  PLAIN_KEY.test(name) ? name : yamlScalar(name);

interface AnsibleBody {
  readonly lines: readonly string[];
}

function multipartBody(parts: readonly MultipartPart[]): AnsibleBody {
  const names = new Set<string>();
  const lines = ["    body_format: form-multipart", "    body:"];
  for (const part of parts) {
    if (names.has(part.name)) {
      throw new GeneratorError(
        `form-multipart takes a mapping of field names, so the repeated multipart field ${part.name} cannot be sent twice.`,
        "GENERATOR_UNSUPPORTED_BODY",
      );
    }
    names.add(part.name);
    if (part.kind === "field") {
      lines.push(`      ${yamlKey(part.name)}: ${yamlScalar(part.value)}`);
      continue;
    }
    lines.push(`      ${yamlKey(part.name)}:`);
    lines.push(`        filename: ${yamlScalar(part.path)}`);
    if (part.contentType !== undefined) {
      lines.push(`        mime_type: ${yamlScalar(part.contentType)}`);
    }
  }
  return { lines };
}

function ansibleBody(body: RequestBody | undefined): AnsibleBody {
  if (body === undefined) return { lines: [] };
  if (body.kind === "multipart") return multipartBody(body.parts);
  // body_format defaults to `raw`, which sends the string exactly as given.
  // The json and form-urlencoded formats re-serialize a structure instead,
  // which would not reproduce the original bytes.
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return { lines: [`    body: ${yamlScalar(body.raw)}`] };
  }
  if (body.kind === "text") {
    return { lines: [`    body: ${yamlScalar(body.value)}`] };
  }
  return body.source.kind === "file"
    ? { lines: [`    src: ${yamlScalar(body.source.path)}`] }
    : { lines: [`    body: ${yamlScalar(body.source.value)}`] };
}

export class AnsibleGenerator implements CodeGenerator {
  readonly id = "ansible-uri" as const;
  readonly language = "ansible" as const;
  readonly client = "uri" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      // The module has url_username/url_password, so basic credentials use
      // them rather than a precomputed header.
      basicAuthHeader: false,
      cookieHeader: true,
    });
    if (hasDuplicateHeaderNames(headers)) {
      throw new GeneratorError(
        "The uri module takes headers as a mapping, so a repeated header name cannot be sent twice.",
        "GENERATOR_DUPLICATE_HEADERS",
      );
    }
    const url = new URL(requestUrl(request));
    const body = ansibleBody(request.body);

    const lines = [
      `- name: ${yamlScalar(`${request.method} ${url.pathname}`)}`,
      "  ansible.builtin.uri:",
      `    url: ${yamlScalar(url.toString())}`,
      `    method: ${request.method}`,
    ];
    if (headers.length > 0) {
      lines.push("    headers:");
      for (const header of headers) {
        lines.push(
          `      ${yamlKey(header.name)}: ${yamlScalar(header.value)}`,
        );
      }
    }
    if (request.auth?.kind === "basic") {
      lines.push(
        `    url_username: ${yamlScalar(request.auth.username)}`,
        `    url_password: ${yamlScalar(request.auth.password)}`,
        // Without this the module waits for a 401 challenge, where cURL's -u
        // sends the credentials on the first request.
        "    force_basic_auth: true",
      );
    }
    lines.push(...body.lines);
    lines.push(
      `    follow_redirects: ${request.options.followRedirects ? "all" : "none"}`,
      // The module discards the response body unless asked to keep it, which
      // makes the task useless as a stand-in for the original command.
      "    return_content: true",
    );

    return {
      code: lines.join("\n"),
      language: this.language,
      client: this.client,
    };
  }
}
