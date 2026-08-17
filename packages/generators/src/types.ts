import type { HttpRequest } from "@curltocode/core";

export type GeneratorLanguage =
  | "javascript"
  | "typescript"
  | "python"
  | "go"
  | "php"
  | "java"
  | "csharp"
  | "ruby"
  | "rust"
  /** Not a programming language: the request message itself. */
  | "http";

export type GeneratorClient =
  | "fetch"
  | "axios"
  | "undici"
  | "requests"
  | "httpx"
  | "aiohttp"
  | "nethttp"
  | "resty"
  | "curl"
  | "guzzle"
  | "httpclient"
  | "okhttp"
  | "apache"
  | "restsharp"
  | "faraday"
  | "reqwest"
  | "ureq"
  | "raw";

export type GeneratorId =
  | "javascript-fetch"
  | "javascript-axios"
  | "javascript-undici"
  | "typescript-fetch"
  | "typescript-axios"
  | "typescript-undici"
  | "python-requests"
  | "python-httpx"
  | "python-aiohttp"
  | "go-nethttp"
  | "go-resty"
  | "php-curl"
  | "php-guzzle"
  | "java-httpclient"
  | "java-okhttp"
  | "java-apache"
  | "csharp-httpclient"
  | "csharp-restsharp"
  | "ruby-nethttp"
  | "ruby-faraday"
  | "rust-reqwest"
  | "rust-ureq"
  | "http-raw";

export interface GeneratedCode {
  readonly code: string;
  readonly language: GeneratorLanguage;
  readonly client: GeneratorClient;
  readonly dependency?: string;
}

export interface CodeGenerator {
  readonly id: GeneratorId;
  readonly language: GeneratorLanguage;
  readonly client: GeneratorClient;
  generate(request: HttpRequest): GeneratedCode;
}

export interface GeneratorTarget {
  readonly id: GeneratorId;
  readonly language: GeneratorLanguage;
  readonly client: GeneratorClient;
}

export type GeneratorErrorCode =
  | "GENERATOR_UNSUPPORTED_BODY"
  | "GENERATOR_DUPLICATE_HEADERS"
  | "GENERATOR_DUPLICATE_COOKIES"
  | "GENERATOR_FILE_REFERENCE"
  | "GENERATOR_UNSUPPORTED_METHOD_BODY"
  /** The target client has no stable API for this part of the request. */
  | "GENERATOR_CLIENT_LIMITATION"
  /** The request cannot be written as a POSIX shell command. */
  | "GENERATOR_SHELL_LIMITATION";

export class GeneratorError extends Error {
  constructor(
    message: string,
    readonly code: GeneratorErrorCode = "GENERATOR_UNSUPPORTED_BODY",
  ) {
    super(message);
    this.name = "GeneratorError";
  }
}
