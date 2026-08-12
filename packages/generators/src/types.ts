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
  | "rust";

export type GeneratorClient =
  | "fetch"
  | "axios"
  | "requests"
  | "httpx"
  | "nethttp"
  | "curl"
  | "httpclient"
  | "okhttp"
  | "reqwest";

export type GeneratorId =
  | "javascript-fetch"
  | "javascript-axios"
  | "typescript-fetch"
  | "typescript-axios"
  | "python-requests"
  | "python-httpx"
  | "go-nethttp"
  | "php-curl"
  | "java-httpclient"
  | "java-okhttp"
  | "csharp-httpclient"
  | "ruby-nethttp"
  | "rust-reqwest";

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
