import { requestUrl } from "@curltocode/core";
import type { HttpRequest, MultipartPart } from "@curltocode/core";

import { hasDuplicateHeaderNames, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { rubyString } from "./literal.js";

/** Ruby's usual default redirect budget for the clients that have one. */
const DEFAULT_REDIRECTS = 10;

/**
 * Both of these clients build a multipart body from a hash of Ruby `File`
 * objects and take each part's media type from the file itself, so a declared
 * type cannot be honoured.
 */
function assertMultipartRepresentable(
  parts: readonly MultipartPart[],
  client: string,
): void {
  const typed = parts.find(
    (part) => part.kind === "file" && part.contentType !== undefined,
  );
  if (typed !== undefined) {
    throw new GeneratorError(
      `${client} derives each multipart part's Content-Type from the file on disk, so the declared media type for ${typed.name} cannot be set. Pick Net::HTTP or Faraday, which build the part explicitly.`,
      "GENERATOR_CLIENT_LIMITATION",
    );
  }
  const names = new Set<string>();
  for (const part of parts) {
    if (names.has(part.name)) {
      throw new GeneratorError(
        `${client} takes multipart fields as a hash, so the repeated field ${part.name} cannot be sent twice.`,
        "GENERATOR_UNSUPPORTED_BODY",
      );
    }
    names.add(part.name);
  }
}

function headerHash(
  request: HttpRequest,
  client: string,
): readonly string[] | undefined {
  const headers = materializeHeaders(request, {
    basicAuthHeader: false,
    cookieHeader: true,
  });
  if (hasDuplicateHeaderNames(headers)) {
    throw new GeneratorError(
      `${client} takes request headers as a hash, so a repeated header name cannot be sent twice.`,
      "GENERATOR_DUPLICATE_HEADERS",
    );
  }
  if (headers.length === 0) return undefined;
  return [
    "  headers: {",
    ...headers.map(
      ({ name, value }) => `    ${rubyString(name)} => ${rubyString(value)},`,
    ),
    "  },",
  ];
}

/** Ruby with HTTParty. */
export class HTTPartyGenerator implements CodeGenerator {
  readonly id = "ruby-httparty" as const;
  readonly language = "ruby" as const;
  readonly client = "httparty" as const;

  generate(request: HttpRequest): GeneratedCode {
    const method = request.method.toLowerCase();
    const named = ["get", "post", "put", "patch", "delete", "head", "options"];
    if (!named.includes(method)) {
      throw new GeneratorError(
        `HTTParty exposes one class method per standard verb and has none for ${request.method}.`,
        "GENERATOR_CLIENT_LIMITATION",
      );
    }
    const headers = headerHash(request, "HTTParty");
    const options: string[] = [...(headers ?? [])];
    if (request.auth?.kind === "basic") {
      options.push(
        `  basic_auth: { username: ${rubyString(request.auth.username)}, password: ${rubyString(request.auth.password)} },`,
      );
    }
    const body = request.body;
    if (body?.kind === "multipart") {
      assertMultipartRepresentable(body.parts, "HTTParty");
      options.push(
        "  multipart: true,",
        "  body: {",
        ...body.parts.map((part) =>
          part.kind === "field"
            ? `    ${rubyString(part.name)} => ${rubyString(part.value)},`
            : `    ${rubyString(part.name)} => File.open(${rubyString(part.path)}),`,
        ),
        "  },",
      );
    } else if (body !== undefined) {
      const payload =
        body.kind === "json" || body.kind === "form-urlencoded"
          ? rubyString(body.raw)
          : body.kind === "text"
            ? rubyString(body.value)
            : body.source.kind === "file"
              ? `File.binread(${rubyString(body.source.path)})`
              : rubyString(body.source.value);
      options.push(`  body: ${payload},`);
    }
    options.push(`  follow_redirects: ${request.options.followRedirects},`);

    return {
      code: [
        'require "httparty"',
        "",
        `response = HTTParty.${method}(`,
        `  ${rubyString(requestUrl(request))},`,
        ...options,
        ")",
        "",
        "puts response.body",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: "gem install httparty",
    };
  }
}

/** Ruby with rest-client. */
export class RestClientGenerator implements CodeGenerator {
  readonly id = "ruby-restclient" as const;
  readonly language = "ruby" as const;
  readonly client = "restclient" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = headerHash(request, "rest-client");
    const options: string[] = [
      `  method: :${request.method.toLowerCase()},`,
      `  url: ${rubyString(requestUrl(request))},`,
      ...(headers ?? []),
    ];
    if (request.auth?.kind === "basic") {
      options.push(
        `  user: ${rubyString(request.auth.username)},`,
        `  password: ${rubyString(request.auth.password)},`,
      );
    }
    const body = request.body;
    if (body?.kind === "multipart") {
      assertMultipartRepresentable(body.parts, "rest-client");
      options.push(
        "  payload: {",
        "    multipart: true,",
        ...body.parts.map((part) =>
          part.kind === "field"
            ? `    ${rubyString(part.name)} => ${rubyString(part.value)},`
            : `    ${rubyString(part.name)} => File.new(${rubyString(part.path)}, "rb"),`,
        ),
        "  },",
      );
    } else if (body !== undefined) {
      const payload =
        body.kind === "json" || body.kind === "form-urlencoded"
          ? rubyString(body.raw)
          : body.kind === "text"
            ? rubyString(body.value)
            : body.source.kind === "file"
              ? `File.new(${rubyString(body.source.path)}, "rb")`
              : rubyString(body.source.value);
      options.push(`  payload: ${payload},`);
    }
    options.push(
      `  max_redirects: ${request.options.followRedirects ? DEFAULT_REDIRECTS : 0},`,
    );

    return {
      code: [
        'require "rest-client"',
        "",
        // rest-client raises on any non-2xx, and with max_redirects at 0 a 3xx
        // counts as one. cURL prints whatever came back, so the response is
        // recovered from the exception rather than allowed to escape.
        "begin",
        "  response = RestClient::Request.execute(",
        ...options.map((option) => `  ${option}`),
        "  )",
        "rescue RestClient::ExceptionWithResponse => error",
        "  response = error.response",
        "end",
        "",
        "puts response.body",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: "gem install rest-client",
    };
  }
}
