import { describe, expect, it } from "vitest";

import {
  codeToCurl,
  convert,
  DynamicExpressionError,
  generateCode,
  parseCode,
  parseCurl,
  parseCurlDetailed,
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
