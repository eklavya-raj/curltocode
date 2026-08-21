import { Buffer } from "node:buffer";

import { parseCurl } from "@curltocode/core";
import { describe, expect, it } from "vitest";

import {
  generateCode,
  GeneratorError,
  generatorTargets,
} from "../src/index.js";
import type { GeneratorErrorCode, GeneratorId } from "../src/index.js";
import { REAL_WORLD_REQUESTS } from "./real-world-fixtures.js";

interface TargetProfile {
  readonly signature: string;
  readonly dependency: string | undefined;
  readonly duplicateHeaders: "preserve" | GeneratorErrorCode;
  readonly duplicateCookies: "preserve" | GeneratorErrorCode;
  readonly customMethod: "preserve" | GeneratorErrorCode;
  /**
   * PATCH is ordinary in every REST API and yet `HttpURLConnection` rejects it
   * outright, so it needs a capability of its own rather than being folded into
   * `customMethod`. Absent means preserved.
   */
  readonly patch?: "preserve" | GeneratorErrorCode;
  /**
   * `unrepresentable` is for a target whose output format has nowhere to put
   * redirect policy. It is not a limitation to refuse over — the request itself
   * is still exact — but the flag must then make no difference at all, which is
   * asserted rather than assumed.
   *
   * `always-follows` is the harder case: the client follows redirects and
   * offers no way to stop it, so cURL's default of *not* following cannot be
   * reproduced. Refusing every such request would make the target useless, so
   * the generated code has to say so in a comment, and that comment is
   * asserted here rather than left to the reader to notice.
   */
  readonly redirects:
    "preserve" | "unrepresentable" | "always-follows" | GeneratorErrorCode;
  /**
   * How the target writes the request URL. Client targets embed the absolute
   * URL; a raw message splits it into an origin-form target and a Host header,
   * which is the format's defining property rather than a gap in it.
   */
  readonly urlForm?: "absolute" | "origin" | "split";
  /**
   * What happens when two multipart parts share a field name.
   *
   * A form may legitimately repeat a name, and several client APIs take the
   * parts as a map keyed by name, where the second part silently replaces the
   * first. That is a lost field rather than a formatting difference, so each
   * target has to say whether it keeps both or refuses. Absent means preserved.
   */
  readonly duplicateFields?: "preserve" | GeneratorErrorCode;
  readonly multipartFile: "preserve" | GeneratorErrorCode;
  readonly binaryFile: "preserve" | GeneratorErrorCode;
}

const profiles = {
  "javascript-fetch": {
    signature: "await fetch(",
    dependency: undefined,
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "GENERATOR_FILE_REFERENCE",
    binaryFile: "GENERATOR_FILE_REFERENCE",
  },
  "javascript-axios": {
    signature: "await axios({",
    dependency: "npm install axios",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "GENERATOR_FILE_REFERENCE",
    binaryFile: "GENERATOR_FILE_REFERENCE",
  },
  "javascript-undici": {
    signature: 'from "undici"',
    dependency: "npm install undici",
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "typescript-fetch": {
    signature: "satisfies RequestInit",
    dependency: undefined,
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "GENERATOR_FILE_REFERENCE",
    binaryFile: "GENERATOR_FILE_REFERENCE",
  },
  "typescript-axios": {
    signature: "satisfies AxiosRequestConfig",
    dependency: "npm install axios",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "GENERATOR_FILE_REFERENCE",
    binaryFile: "GENERATOR_FILE_REFERENCE",
  },
  "typescript-undici": {
    signature: 'from "undici"',
    dependency: "npm install undici",
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "javascript-jquery": {
    signature: "$.ajax({",
    dependency: "npm install jquery",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "always-follows",
    multipartFile: "GENERATOR_FILE_REFERENCE",
    binaryFile: "GENERATOR_FILE_REFERENCE",
  },
  "javascript-xhr": {
    signature: "new XMLHttpRequest()",
    dependency: undefined,
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "always-follows",
    multipartFile: "GENERATOR_FILE_REFERENCE",
    binaryFile: "GENERATOR_FILE_REFERENCE",
  },
  "nodejs-fetch": {
    signature: "await fetch(",
    dependency: undefined,
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    // Unlike the browser target of the same library, Node can resolve a path.
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "nodejs-axios": {
    signature: "await axios({",
    dependency: "npm install axios",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "nodejs-got": {
    signature: 'import got from "got";',
    dependency: "npm install got",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "nodejs-ky": {
    signature: 'import ky from "ky";',
    dependency: "npm install ky",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "nodejs-superagent": {
    signature: 'import superagent from "superagent";',
    dependency: "npm install superagent",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "nodejs-https": {
    signature: 'from "node:https";',
    dependency: undefined,
    // node:http takes either a string or an array of strings per header name,
    // which is why this target keeps duplicates the object clients cannot.
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "GENERATOR_CLIENT_LIMITATION",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "python-requests": {
    signature: "response = requests.get(",
    dependency: "pip install requests",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "GENERATOR_DUPLICATE_COOKIES",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "python-httpx": {
    signature: "response = httpx.get(",
    dependency: "pip install httpx",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "GENERATOR_DUPLICATE_COOKIES",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "python-aiohttp": {
    signature: "aiohttp.ClientSession()",
    dependency: "pip install aiohttp",
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "python-httpclient": {
    signature: "http.client.HTTPSConnection(",
    dependency: undefined,
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "GENERATOR_CLIENT_LIMITATION",
    // The connection takes the host and the request takes the path, so the URL
    // never appears whole.
    urlForm: "split",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "python-urllib3": {
    signature: "urllib3.PoolManager()",
    dependency: "pip install urllib3",
    // HTTPHeaderDict keeps repeated names, unlike requests and httpx.
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "go-nethttp": {
    signature: "http.NewRequest(",
    dependency: undefined,
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "go-resty": {
    signature: "resty.New()",
    dependency: "go get resty.dev/v3",
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "php-curl": {
    signature: "curl_setopt_array",
    dependency: "Requires the PHP cURL extension (ext-curl).",
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "php-guzzle": {
    signature: "new GuzzleHttp\\Client()",
    dependency: "composer require guzzlehttp/guzzle",
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "java-httpurlconnection": {
    signature: "HttpURLConnection connection",
    dependency: undefined,
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    // setRequestMethod raises ProtocolException for anything outside its set,
    // and that set famously excludes PATCH.
    customMethod: "GENERATOR_CLIENT_LIMITATION",
    patch: "GENERATOR_CLIENT_LIMITATION",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "java-httpclient": {
    signature: "HttpRequest.newBuilder()",
    dependency: undefined,
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    duplicateFields: "GENERATOR_UNSUPPORTED_BODY",
    multipartFile: "GENERATOR_UNSUPPORTED_BODY",
    binaryFile: "preserve",
  },
  "java-okhttp": {
    signature: "new OkHttpClient.Builder()",
    dependency: 'implementation("com.squareup.okhttp3:okhttp:5.3.2")',
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "java-apache": {
    signature: "HttpClients.custom()",
    dependency:
      'implementation("org.apache.httpcomponents.client5:httpclient5:5.6.2")',
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "csharp-httpclient": {
    signature: "new HttpRequestMessage(",
    dependency: undefined,
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "csharp-restsharp": {
    signature: "new RestRequest(",
    dependency: "dotnet add package RestSharp --version 114.0.0",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "GENERATOR_CLIENT_LIMITATION",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "csharp-flurl": {
    signature: "using Flurl.Http;",
    dependency: "dotnet add package Flurl.Http",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "php-symfony": {
    signature: "HttpClient::create()",
    dependency: "composer require symfony/http-client symfony/mime",
    // An array header value tells Symfony to send the field once per element.
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    duplicateFields: "GENERATOR_UNSUPPORTED_BODY",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "php-laravel": {
    signature: "use Illuminate\\Support\\Facades\\Http;",
    dependency: "composer require guzzlehttp/guzzle",
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "ruby-httparty": {
    signature: "HTTParty.",
    dependency: "gem install httparty",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "GENERATOR_CLIENT_LIMITATION",
    redirects: "preserve",
    // Both Ruby wrappers take the part media type from the file on disk.
    duplicateFields: "GENERATOR_UNSUPPORTED_BODY",
    multipartFile: "GENERATOR_CLIENT_LIMITATION",
    binaryFile: "preserve",
  },
  "ruby-restclient": {
    signature: "RestClient::Request.execute(",
    dependency: "gem install rest-client",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    duplicateFields: "GENERATOR_UNSUPPORTED_BODY",
    multipartFile: "GENERATOR_CLIENT_LIMITATION",
    binaryFile: "preserve",
  },
  "ruby-nethttp": {
    signature: "Net::HTTP::Get.new(uri)",
    dependency: undefined,
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "GENERATOR_UNSUPPORTED_BODY",
    redirects: "GENERATOR_CLIENT_LIMITATION",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "ruby-faraday": {
    signature: "Faraday.new",
    dependency: "gem install faraday",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    duplicateFields: "GENERATOR_UNSUPPORTED_BODY",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "rust-reqwest": {
    signature: "reqwest::Client::builder()",
    dependency:
      'reqwest = "0.13"\ntokio = { version = "1", features = ["full"] }',
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "rust-ureq": {
    signature: "Agent::config_builder()",
    dependency: 'ureq = "3.3"',
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    duplicateFields: "GENERATOR_UNSUPPORTED_BODY",
    multipartFile: "GENERATOR_UNSUPPORTED_BODY",
    binaryFile: "preserve",
  },
  "kotlin-okhttp": {
    signature: "Request.Builder()",
    dependency: 'implementation("com.squareup.okhttp3:okhttp:5.3.2")',
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "kotlin-ktor": {
    signature: "HttpClient(CIO)",
    dependency: 'implementation("io.ktor:ktor-client-cio:3.4.0")',
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "swift-urlsession": {
    signature: "URLRequest(url:",
    dependency: undefined,
    // addValue folds repeated names into one comma-separated value rather than
    // sending the field twice, which is not equivalent for every header.
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "swift-alamofire": {
    signature: "import Alamofire",
    dependency:
      '.package(url: "https://github.com/Alamofire/Alamofire.git", from: "5.12.0")',
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "dart-http": {
    signature: "http.Request(",
    dependency: "dart pub add http",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    duplicateFields: "GENERATOR_UNSUPPORTED_BODY",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "dart-dio": {
    signature: "final dio = Dio();",
    dependency: "dart pub add dio",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "objectivec-nsurlsession": {
    signature: "NSMutableURLRequest",
    dependency: undefined,
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "c-libcurl": {
    signature: "curl_easy_init()",
    dependency: undefined,
    // curl_slist appends, so a repeated header name is sent twice.
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "cpp-cpr": {
    signature: "#include <cpr/cpr.h>",
    dependency: "vcpkg install cpr",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "GENERATOR_CLIENT_LIMITATION",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "clojure-cljhttp": {
    signature: "clj-http.client",
    dependency: 'clj-http/clj-http {:mvn/version "3.13.1"}',
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "elixir-req": {
    signature: "Req.request!(",
    dependency: '{:req, "~> 0.7"}',
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "elixir-httpoison": {
    signature: "HTTPoison.request!(",
    dependency: '{:httpoison, "~> 2.2"}',
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "perl-lwp": {
    signature: "LWP::UserAgent->new(",
    dependency: "cpanm LWP::UserAgent",
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "r-httr2": {
    signature: "req_perform(request)",
    dependency: 'install.packages("httr2")',
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "r-httr": {
    signature: "response <- VERB(",
    dependency: 'install.packages("httr")',
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "julia-http": {
    signature: "HTTP.request(",
    dependency: 'using Pkg; Pkg.add("HTTP")',
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "lua-http": {
    signature: "http.request({",
    dependency: "luarocks install luasocket luasec",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "matlab-http": {
    signature: "RequestMessage(",
    dependency: undefined,
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    // FileProvider takes the part media type from the file's extension.
    multipartFile: "GENERATOR_CLIENT_LIMITATION",
    binaryFile: "preserve",
  },
  "ocaml-cohttp": {
    signature: "Cohttp_lwt_unix.Client.call",
    dependency: "opam install cohttp-lwt-unix",
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "GENERATOR_CLIENT_LIMITATION",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "scala-sttp": {
    signature: "quickRequest",
    dependency: '"com.softwaremill.sttp.client4" %% "core" % "4.0.26"',
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "cfml-cfhttp": {
    signature: "<cfhttp ",
    dependency: undefined,
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "GENERATOR_CLIENT_LIMITATION",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "nim-httpclient": {
    signature: "newHttpClient(",
    dependency: undefined,
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "crystal-httpclient": {
    signature: "HTTP::Client.exec(",
    dependency: undefined,
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "GENERATOR_CLIENT_LIMITATION",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "powershell-restmethod": {
    signature: "Invoke-RestMethod",
    dependency: undefined,
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    duplicateFields: "GENERATOR_UNSUPPORTED_BODY",
    multipartFile: "GENERATOR_CLIENT_LIMITATION",
    binaryFile: "preserve",
  },
  "powershell-webrequest": {
    signature: "Invoke-WebRequest",
    dependency: undefined,
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    duplicateFields: "GENERATOR_UNSUPPORTED_BODY",
    multipartFile: "GENERATOR_CLIENT_LIMITATION",
    binaryFile: "preserve",
  },
  "httpie-cli": {
    signature: "http GET ",
    dependency: "pip install httpie",
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "wget-cli": {
    signature: "wget -O - ",
    dependency: undefined,
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    duplicateFields: "GENERATOR_CLIENT_LIMITATION",
    multipartFile: "GENERATOR_CLIENT_LIMITATION",
    binaryFile: "preserve",
  },
  "har-json": {
    signature: '"version": "1.2"',
    dependency: undefined,
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    // A HAR request object has no field for a redirect policy. The entry still
    // describes the request exactly, so this is the format's shape rather than
    // a dropped option, and the flag is asserted to make no difference.
    redirects: "unrepresentable",
    multipartFile: "preserve",
    binaryFile: "GENERATOR_FILE_REFERENCE",
  },
  "json-request": {
    signature: '"followRedirects"',
    dependency: undefined,
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "ansible-uri": {
    signature: "ansible.builtin.uri:",
    dependency: undefined,
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    duplicateFields: "GENERATOR_UNSUPPORTED_BODY",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "postman-collection": {
    signature: "schema.getpostman.com",
    dependency: undefined,
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "k6-script": {
    signature: 'import http from "k6/http";',
    dependency: undefined,
    duplicateHeaders: "GENERATOR_DUPLICATE_HEADERS",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "preserve",
    duplicateFields: "GENERATOR_UNSUPPORTED_BODY",
    multipartFile: "preserve",
    binaryFile: "preserve",
  },
  "http-raw": {
    signature: " HTTP/1.1",
    dependency: undefined,
    duplicateHeaders: "preserve",
    duplicateCookies: "preserve",
    customMethod: "preserve",
    redirects: "unrepresentable",
    // A message carries the bytes it sends, and the contents of a local file
    // are not known at conversion time.
    multipartFile: "GENERATOR_FILE_REFERENCE",
    binaryFile: "GENERATOR_FILE_REFERENCE",
    urlForm: "origin",
  },
} as const satisfies Readonly<Record<GeneratorId, TargetProfile>>;

function result(command: string, id: GeneratorId) {
  return generateCode(parseCurl(command).request, id);
}

function code(command: string, id: GeneratorId): string {
  return result(command, id).code;
}

function expectCapability(
  command: string,
  id: GeneratorId,
  capability: "preserve" | GeneratorErrorCode,
  assertions: (generated: string) => void,
): void {
  if (capability === "preserve") {
    assertions(code(command, id));
    return;
  }
  try {
    code(command, id);
    expect.unreachable(`${id} should report ${capability}`);
  } catch (error) {
    expect(error).toBeInstanceOf(GeneratorError);
    expect((error as GeneratorError).code).toBe(capability);
  }
}

describe("real-world target profiles", () => {
  it("covers every registered language and library exactly once", () => {
    expect(Object.keys(profiles).sort()).toEqual(
      generatorTargets.map(({ id }) => id).sort(),
    );
  });
});

describe.each(generatorTargets)("$id real-world conformance", (target) => {
  // Widened to the interface so the optional fields are readable; the literal
  // types are still checked by the `satisfies` on the table itself.
  const profile: TargetProfile = profiles[target.id];

  it("reports accurate registry metadata and dependency guidance", () => {
    const generated = result(REAL_WORLD_REQUESTS.health, target.id);
    expect(generated.language).toBe(target.language);
    expect(generated.client).toBe(target.client);
    expect(generated.dependency).toBe(profile.dependency);
    expect(generated.code).toContain(profile.signature);
  });

  it("preserves encoded and duplicate query parameters plus request headers", () => {
    const generated = code(REAL_WORLD_REQUESTS.search, target.id);
    if (profile.urlForm === "split") {
      // The host and the path reach the client through different arguments, so
      // both halves are asserted rather than the joined URL.
      expect(generated).toContain(
        "/v1/search?q=hello+world&tag=typescript&tag=security",
      );
      expect(generated).toContain("api.example.com");
    } else if (profile.urlForm === "origin") {
      expect(generated).toContain(
        "GET /v1/search?q=hello+world&tag=typescript&tag=security HTTP/1.1",
      );
      expect(generated).toContain("Host: api.example.com");
    } else {
      expect(generated).toContain(
        "https://api.example.com/v1/search?q=hello+world&tag=typescript&tag=security",
      );
    }
    expect(generated).toContain("Accept");
    expect(generated).toContain("application/json");
    expect(generated).toContain("X-Request-ID");
    expect(generated).toContain("req-2026-08-13");
  });

  it("preserves PATCH JSON, bearer auth, cookies, arrays, and Unicode", () => {
    expectCapability(
      REAL_WORLD_REQUESTS.accountPatch,
      target.id,
      profile.patch ?? "preserve",
      (generated) => {
        expect(generated.toLowerCase()).toContain("patch");
        expect(generated).toContain("tok_live_123");
        expect(generated).toContain("session");
        expect(generated).toContain("sess_abc");
        expect(generated).toContain("locale");
        expect(generated).toContain("en-IN");
        expect(generated).toContain("displayName");
        expect(generated).toContain("Eklavya 👋");
        expect(generated).toContain("developer");
      },
    );
  });

  it("preserves basic-auth credentials without dropping password colons", () => {
    const generated = code(REAL_WORLD_REQUESTS.basicAuth, target.id);
    const encoded = Buffer.from("service-user:p@ss:word").toString("base64");
    expect(
      (generated.includes("service-user") && generated.includes("p@ss:word")) ||
        generated.includes(encoded),
    ).toBe(true);
  });

  it("preserves exact OAuth form bytes and repeated fields", () => {
    const generated = code(REAL_WORLD_REQUESTS.oauthForm, target.id);
    expect(generated).toContain(
      "grant_type=client_credentials&scope=read&scope=write",
    );
    expect(generated).toContain("application/x-www-form-urlencoded");
  });

  it("preserves multiline UTF-8 text and its content type", () => {
    const generated = code(REAL_WORLD_REQUESTS.webhookText, target.id);
    expect(generated.toLowerCase()).toContain("post");
    expect(generated).toContain("text/plain; charset=utf-8");
    expect(generated).toContain("deployment complete 🚀");
    expect(generated).toContain("second line");
  });

  it("preserves redirect policy or returns the documented limitation", () => {
    if (profile.redirects === "always-follows") {
      const followed = code(
        REAL_WORLD_REQUESTS.search.replace("curl ", "curl -L "),
        target.id,
      );
      const notFollowed = code(REAL_WORLD_REQUESTS.search, target.id);
      expect(followed).toBe(notFollowed);
      // The difference from cURL's default has to be stated in the output
      // itself, not just known to whoever wrote the generator.
      expect(notFollowed.toLowerCase()).toContain("always follows redirects");
      return;
    }
    if (profile.redirects === "unrepresentable") {
      // With nowhere to record the policy, -L has to make no difference at
      // all. Asserting that keeps a genuinely dropped flag from passing here
      // as though the format had handled it.
      expect(
        code(
          REAL_WORLD_REQUESTS.search.replace("curl ", "curl -L "),
          target.id,
        ),
      ).toBe(code(REAL_WORLD_REQUESTS.search, target.id));
      return;
    }
    expectCapability(
      REAL_WORLD_REQUESTS.search.replace("curl ", "curl -L "),
      target.id,
      profile.redirects,
      (followed) => {
        const notFollowed = code(REAL_WORLD_REQUESTS.search, target.id);
        expect(followed).not.toBe(notFollowed);
      },
    );
  });

  it("preserves a custom PURGE method or returns a typed limitation", () => {
    expectCapability(
      REAL_WORLD_REQUESTS.customMethod,
      target.id,
      profile.customMethod,
      (generated) => {
        expect(generated.toLowerCase()).toContain("purge");
        expect(generated).toContain("user-42");
      },
    );
  });

  it("preserves duplicate headers or returns a duplicate-header error", () => {
    expectCapability(
      REAL_WORLD_REQUESTS.duplicateHeaders,
      target.id,
      profile.duplicateHeaders,
      (generated) => {
        expect(generated).toContain("alpha");
        expect(generated).toContain("beta");
      },
    );
  });

  it("preserves duplicate cookies or returns a duplicate-cookie error", () => {
    expectCapability(
      REAL_WORLD_REQUESTS.duplicateCookies,
      target.id,
      profile.duplicateCookies,
      (generated) => {
        expect(generated).toContain("first");
        expect(generated).toContain("second");
      },
    );
  });

  it("keeps a repeated multipart field name or refuses it outright", () => {
    expectCapability(
      REAL_WORLD_REQUESTS.duplicateFields,
      target.id,
      profile.duplicateFields ?? "preserve",
      (generated) => {
        // Both values have to survive; a map keyed by field name keeps only
        // the last one, which is the failure this asserts against.
        expect(generated).toContain("alpha");
        expect(generated).toContain("beta");
      },
    );
  });

  it("preserves multipart metadata or returns a file/body limitation", () => {
    expectCapability(
      REAL_WORLD_REQUESTS.multipartUpload,
      target.id,
      profile.multipartFile,
      (generated) => {
        expect(generated).toContain("description");
        expect(generated).toContain("Quarterly report");
        expect(generated).toContain("document");
        expect(generated).toContain("/tmp/report.pdf");
        expect(generated).toContain("application/pdf");
      },
    );
  });

  it("preserves file-backed binary bodies or returns a file limitation", () => {
    expectCapability(
      REAL_WORLD_REQUESTS.binaryFile,
      target.id,
      profile.binaryFile,
      (generated) => {
        expect(generated.toLowerCase()).toContain("put");
        expect(generated).toContain("payload.bin");
        expect(generated).toContain("application/octet-stream");
      },
    );
  });

  it("preserves inline binary bytes separately from file references", () => {
    const generated = code(REAL_WORLD_REQUESTS.inlineBinary, target.id);
    expect(generated).toContain("protobuf-wire-bytes-01");
    expect(generated).toContain("application/octet-stream");
  });

  it("preserves DELETE queries, preconditions, and audit headers", () => {
    const generated = code(REAL_WORLD_REQUESTS.deleteWithTrace, target.id);
    expect(generated.toLowerCase()).toContain("delete");
    expect(generated).toContain("user-42?hard=true");
    expect(generated).toContain("If-Match");
    expect(generated).toContain("etag-user-42");
    expect(generated).toContain("X-Audit-Reason");
    expect(generated).toContain("duplicate-account");
  });

  it("is deterministic across repeated generation", () => {
    const request =
      (profile.patch ?? "preserve") === "preserve"
        ? REAL_WORLD_REQUESTS.accountPatch
        : REAL_WORLD_REQUESTS.search;
    expect(code(request, target.id)).toBe(code(request, target.id));
  });
});
