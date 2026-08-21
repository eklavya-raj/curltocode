import { describe, expect, it } from "vitest";

import {
  codeToCurl,
  convert,
  DynamicExpressionError,
  generateCode,
  parseCode,
  parseCurl,
  parseCurlDetailed,
  supportedReverseTargets,
  supportedTargets,
} from "../src/index.js";

describe("curltocode public API", () => {
  it("offers a compact cURL to code facade", () => {
    const request = parseCurl("curl -L https://example.com -d 'name=Ada'");
    expect(request.method).toBe("POST");
    expect(
      generateCode(request, { language: "python", client: "requests" }),
    ).toContain("requests.post");
    expect(
      convert("curl -L https://example.com", {
        language: "javascript",
        client: "fetch",
      }),
    ).toContain("await fetch");
  });

  it("keeps warnings available without complicating the primary parse API", () => {
    expect(
      parseCurlDetailed("curl https://example.com/#fragment").warnings,
    ).toContainEqual(expect.objectContaining({ code: "URL_FRAGMENT_IGNORED" }));
  });

  it("offers lazily loaded code parsing and cURL generation", async () => {
    const code =
      'fetch("https://example.com", { method: "DELETE", redirect: "manual" });';
    expect((await parseCode(code)).request.method).toBe("DELETE");
    expect(await codeToCurl(code)).toContain("-X DELETE");
  });

  it("rejects invalid language/client combinations", () => {
    expect(() =>
      convert("curl https://example.com", {
        language: "python",
        client: "axios",
      }),
    ).toThrowError(/Unsupported language\/client/u);
  });

  it("exposes the registered forward targets for package consumers", () => {
    expect(supportedTargets.map(({ id }) => id)).toEqual([
      "javascript-fetch",
      "javascript-axios",
      "javascript-undici",
      "typescript-fetch",
      "typescript-axios",
      "typescript-undici",
      "javascript-jquery",
      "javascript-xhr",
      "nodejs-fetch",
      "nodejs-axios",
      "nodejs-got",
      "nodejs-ky",
      "nodejs-superagent",
      "nodejs-https",
      "python-requests",
      "python-httpx",
      "python-aiohttp",
      "python-httpclient",
      "python-urllib3",
      "go-nethttp",
      "go-resty",
      "php-curl",
      "php-guzzle",
      "php-symfony",
      "php-laravel",
      "java-httpclient",
      "java-okhttp",
      "java-apache",
      "java-httpurlconnection",
      "csharp-httpclient",
      "csharp-restsharp",
      "csharp-flurl",
      "ruby-nethttp",
      "ruby-faraday",
      "ruby-httparty",
      "ruby-restclient",
      "rust-reqwest",
      "rust-ureq",
      "kotlin-okhttp",
      "kotlin-ktor",
      "swift-urlsession",
      "swift-alamofire",
      "dart-http",
      "dart-dio",
      "objectivec-nsurlsession",
      "c-libcurl",
      "cpp-cpr",
      "clojure-cljhttp",
      "elixir-req",
      "elixir-httpoison",
      "perl-lwp",
      "r-httr2",
      "r-httr",
      "julia-http",
      "lua-http",
      "matlab-http",
      "ocaml-cohttp",
      "scala-sttp",
      "cfml-cfhttp",
      "nim-httpclient",
      "crystal-httpclient",
      "powershell-restmethod",
      "powershell-webrequest",
      "http-raw",
      "httpie-cli",
      "wget-cli",
      "har-json",
      "json-request",
      "ansible-uri",
      "postman-collection",
      "k6-script",
    ]);
  });

  it("exposes reverse-parser capabilities without loading the parsers", () => {
    expect(
      supportedReverseTargets.map(({ language, client, parserLanguage }) => ({
        language,
        client,
        parserLanguage,
      })),
    ).toEqual([
      {
        language: "javascript",
        client: "fetch",
        parserLanguage: "javascript",
      },
      {
        language: "javascript",
        client: "axios",
        parserLanguage: "javascript",
      },
      {
        language: "javascript",
        client: "undici",
        parserLanguage: "javascript",
      },
      {
        language: "typescript",
        client: "fetch",
        parserLanguage: "javascript",
      },
      {
        language: "typescript",
        client: "axios",
        parserLanguage: "javascript",
      },
      {
        language: "typescript",
        client: "undici",
        parserLanguage: "javascript",
      },
      {
        language: "javascript",
        client: "jquery",
        parserLanguage: "javascript",
      },
      {
        language: "javascript",
        client: "xhr",
        parserLanguage: "javascript",
      },
      {
        language: "nodejs",
        client: "fetch",
        parserLanguage: "javascript",
      },
      {
        language: "nodejs",
        client: "axios",
        parserLanguage: "javascript",
      },
      {
        language: "nodejs",
        client: "got",
        parserLanguage: "javascript",
      },
      {
        language: "nodejs",
        client: "ky",
        parserLanguage: "javascript",
      },
      {
        language: "nodejs",
        client: "superagent",
        parserLanguage: "javascript",
      },
      {
        language: "nodejs",
        client: "https",
        parserLanguage: "javascript",
      },
      {
        language: "python",
        client: "requests",
        parserLanguage: "python",
      },
      {
        language: "python",
        client: "httpx",
        parserLanguage: "python",
      },
      {
        language: "python",
        client: "aiohttp",
        parserLanguage: "python",
      },
      {
        language: "python",
        client: "httpclient",
        parserLanguage: "python",
      },
      {
        language: "python",
        client: "urllib3",
        parserLanguage: "python",
      },
      {
        language: "php",
        client: "curl",
        parserLanguage: "php",
      },
      {
        language: "php",
        client: "guzzle",
        parserLanguage: "php",
      },
      {
        language: "php",
        client: "symfony",
        parserLanguage: "php",
      },
      {
        language: "php",
        client: "laravel",
        parserLanguage: "php",
      },
      {
        language: "go",
        client: "nethttp",
        parserLanguage: "go",
      },
      {
        language: "go",
        client: "resty",
        parserLanguage: "go",
      },
      {
        language: "java",
        client: "httpclient",
        parserLanguage: "java",
      },
      {
        language: "java",
        client: "okhttp",
        parserLanguage: "java",
      },
      {
        language: "java",
        client: "apache",
        parserLanguage: "java",
      },
      {
        language: "java",
        client: "httpurlconnection",
        parserLanguage: "java",
      },
      {
        language: "csharp",
        client: "httpclient",
        parserLanguage: "csharp",
      },
      {
        language: "csharp",
        client: "restsharp",
        parserLanguage: "csharp",
      },
      {
        language: "csharp",
        client: "flurl",
        parserLanguage: "csharp",
      },
      {
        language: "ruby",
        client: "nethttp",
        parserLanguage: "ruby",
      },
      {
        language: "ruby",
        client: "faraday",
        parserLanguage: "ruby",
      },
      {
        language: "ruby",
        client: "httparty",
        parserLanguage: "ruby",
      },
      {
        language: "ruby",
        client: "restclient",
        parserLanguage: "ruby",
      },
      {
        language: "rust",
        client: "reqwest",
        parserLanguage: "rust",
      },
      {
        language: "rust",
        client: "ureq",
        parserLanguage: "rust",
      },
      {
        language: "kotlin",
        client: "okhttp",
        parserLanguage: "kotlin",
      },
      {
        language: "kotlin",
        client: "ktor",
        parserLanguage: "kotlin",
      },
      {
        language: "swift",
        client: "urlsession",
        parserLanguage: "swift",
      },
      {
        language: "swift",
        client: "alamofire",
        parserLanguage: "swift",
      },
      {
        language: "dart",
        client: "http",
        parserLanguage: "dart",
      },
      {
        language: "dart",
        client: "dio",
        parserLanguage: "dart",
      },
      {
        language: "http",
        client: "raw",
        parserLanguage: "http",
      },
      {
        language: "httpie",
        client: "cli",
        parserLanguage: "httpie",
      },
      {
        language: "wget",
        client: "cli",
        parserLanguage: "wget",
      },
      {
        language: "powershell",
        client: "restmethod",
        parserLanguage: "powershell",
      },
      {
        language: "powershell",
        client: "webrequest",
        parserLanguage: "powershell",
      },
      {
        language: "har",
        client: "json",
        parserLanguage: "har",
      },
      {
        language: "postman",
        client: "collection",
        parserLanguage: "postman",
      },
      {
        language: "json",
        client: "request",
        parserLanguage: "json",
      },
    ]);
  });

  it("exposes structured reverse-parser limitations without eagerly changing the API", async () => {
    expect.assertions(2);
    try {
      await parseCode("fetch(getUrl())");
    } catch (error) {
      expect(error).toBeInstanceOf(DynamicExpressionError);
      if (error instanceof DynamicExpressionError) {
        expect(error.issues).toContainEqual(
          expect.objectContaining({ kind: "url", expression: "getUrl()" }),
        );
      }
    }
  });
});
