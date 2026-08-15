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
      "python-requests",
      "python-httpx",
      "python-aiohttp",
      "go-nethttp",
      "go-resty",
      "php-curl",
      "php-guzzle",
      "java-httpclient",
      "java-okhttp",
      "java-apache",
      "csharp-httpclient",
      "csharp-restsharp",
      "ruby-nethttp",
      "ruby-faraday",
      "rust-reqwest",
      "rust-ureq",
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
        language: "rust",
        client: "reqwest",
        parserLanguage: "rust",
      },
      {
        language: "rust",
        client: "ureq",
        parserLanguage: "rust",
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
