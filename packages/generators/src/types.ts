import type { HttpRequest } from "@curltocode/core";

export type GeneratorLanguage =
  | "javascript"
  | "typescript"
  | "nodejs"
  | "python"
  | "go"
  | "php"
  | "java"
  | "csharp"
  | "ruby"
  | "rust"
  | "kotlin"
  | "swift"
  | "dart"
  | "objectivec"
  | "c"
  | "cpp"
  | "clojure"
  | "elixir"
  | "perl"
  | "r"
  | "julia"
  | "lua"
  | "matlab"
  | "ocaml"
  | "scala"
  | "cfml"
  | "nim"
  | "crystal"
  | "powershell"
  /**
   * Formats rather than programming languages. Each one still describes a
   * single request, which is what makes it a legitimate conversion target: the
   * output is the request expressed in that format, not a program that sends
   * it.
   */
  | "http"
  | "httpie"
  | "wget"
  | "har"
  | "json"
  | "ansible"
  | "postman"
  | "k6";

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
  | "urllib3"
  | "httpurlconnection"
  | "httparty"
  | "restclient"
  | "symfony"
  | "laravel"
  | "flurl"
  | "got"
  | "ky"
  | "superagent"
  | "https"
  | "jquery"
  | "xhr"
  | "ktor"
  | "urlsession"
  | "alamofire"
  | "http"
  | "dio"
  | "nsurlsession"
  | "libcurl"
  | "cpr"
  | "cljhttp"
  | "req"
  | "httpoison"
  | "lwp"
  | "httr"
  | "httr2"
  | "cohttp"
  | "sttp"
  | "cfhttp"
  | "raw"
  | "cli"
  | "restmethod"
  | "webrequest"
  | "json"
  | "request"
  | "uri"
  | "collection"
  | "script";

export type GeneratorId =
  | "javascript-fetch"
  | "javascript-axios"
  | "javascript-undici"
  | "typescript-fetch"
  | "typescript-axios"
  | "typescript-undici"
  | "javascript-jquery"
  | "javascript-xhr"
  | "nodejs-fetch"
  | "nodejs-axios"
  | "nodejs-got"
  | "nodejs-ky"
  | "nodejs-superagent"
  | "nodejs-https"
  | "python-requests"
  | "python-httpx"
  | "python-aiohttp"
  | "python-httpclient"
  | "python-urllib3"
  | "go-nethttp"
  | "go-resty"
  | "php-curl"
  | "php-guzzle"
  | "php-symfony"
  | "php-laravel"
  | "java-httpclient"
  | "java-okhttp"
  | "java-apache"
  | "java-httpurlconnection"
  | "csharp-httpclient"
  | "csharp-restsharp"
  | "csharp-flurl"
  | "ruby-nethttp"
  | "ruby-faraday"
  | "ruby-httparty"
  | "ruby-restclient"
  | "rust-reqwest"
  | "rust-ureq"
  | "kotlin-okhttp"
  | "kotlin-ktor"
  | "swift-urlsession"
  | "swift-alamofire"
  | "dart-http"
  | "dart-dio"
  | "objectivec-nsurlsession"
  | "c-libcurl"
  | "cpp-cpr"
  | "clojure-cljhttp"
  | "elixir-req"
  | "elixir-httpoison"
  | "perl-lwp"
  | "r-httr2"
  | "r-httr"
  | "julia-http"
  | "lua-http"
  | "matlab-http"
  | "ocaml-cohttp"
  | "scala-sttp"
  | "cfml-cfhttp"
  | "nim-httpclient"
  | "crystal-httpclient"
  | "http-raw"
  | "httpie-cli"
  | "wget-cli"
  | "powershell-restmethod"
  | "powershell-webrequest"
  | "har-json"
  | "json-request"
  | "ansible-uri"
  | "postman-collection"
  | "k6-script";

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
