import { parseCurl, requestsAreSemanticallyEqual } from "@curltocode/core";
import { describe, expect, it } from "vitest";

import { generateCode } from "../src/index.js";
import { generateCurl } from "../src/curl.js";
import { parseCodeRequest, parsePhpRequest } from "../src/reverse/index.js";
import { DynamicExpressionError } from "../src/reverse/types.js";

const request = (source: string) => parsePhpRequest(source).request;
const php = (body: string) => `<?php\n\n${body}\n`;

describe("PHP cURL extension", () => {
  it("reads a curl_setopt_array configuration", () => {
    const result = parsePhpRequest(
      php(`
$curl = curl_init();
curl_setopt_array($curl, [
    CURLOPT_URL => "https://api.example.com/v1/items?page=2",
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST => "POST",
    CURLOPT_HTTPHEADER => [
        "Content-Type: application/json",
        "X-Token: abc",
    ],
    CURLOPT_POSTFIELDS => "{\\"n\\":1}",
]);
$response = curl_exec($curl);`),
    );
    expect(result.client).toBe("curl");
    expect(result.request.method).toBe("POST");
    expect(result.request.url).toBe("https://api.example.com/v1/items");
    expect(result.request.query).toEqual([{ name: "page", value: "2" }]);
    expect(result.request.headers).toEqual([
      { name: "Content-Type", value: "application/json" },
      { name: "X-Token", value: "abc" },
    ]);
    expect(result.request.body).toMatchObject({ kind: "json", raw: '{"n":1}' });
  });

  it("reads repeated curl_setopt calls", () => {
    const parsed = request(
      php(`
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, "https://api.example.com/x");
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "DELETE");
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_exec($ch);`),
    );
    expect(parsed.method).toBe("DELETE");
    expect(parsed.options.followRedirects).toBe(true);
  });

  it("sends an array of post fields as multipart, the way PHP does", () => {
    // A string CURLOPT_POSTFIELDS is raw; an array switches the request to
    // multipart/form-data. The option name alone does not say which.
    expect(
      request(
        php(`curl_setopt_array($c, [
  CURLOPT_URL => "https://x.test/u",
  CURLOPT_POSTFIELDS => ["source" => "mobile", "tag" => "alpha"],
]);`),
      ).body,
    ).toEqual({
      kind: "multipart",
      parts: [
        { kind: "field", name: "source", value: "mobile" },
        { kind: "field", name: "tag", value: "alpha" },
      ],
    });
  });

  it("reads cookies, user agent, and referer options as headers", () => {
    const parsed = request(
      php(`curl_setopt_array($c, [
  CURLOPT_URL => "https://x.test/",
  CURLOPT_COOKIE => "session=abc; locale=en-IN",
  CURLOPT_USERAGENT => "MyApp/1.0",
  CURLOPT_REFERER => "https://ref.test/",
]);`),
    );
    expect(parsed.cookies).toEqual([
      { name: "session", value: "abc" },
      { name: "locale", value: "en-IN" },
    ]);
    expect(parsed.headers).toEqual([
      { name: "User-Agent", value: "MyApp/1.0" },
      { name: "Referer", value: "https://ref.test/" },
    ]);
  });

  it("resolves a variable bound once to a static value", () => {
    expect(
      request(
        php(`
$url = "https://api.example.com/from-var";
curl_setopt_array($c, [CURLOPT_URL => $url]);`),
      ).url,
    ).toBe("https://api.example.com/from-var");
  });

  it("reports a variable it cannot resolve rather than guessing", () => {
    expect(() =>
      parsePhpRequest(php(`curl_setopt_array($c, [CURLOPT_URL => $apiUrl]);`)),
    ).toThrowError(DynamicExpressionError);
  });

  it("does not resolve a variable that is assigned twice", () => {
    // Without following control flow there is no way to know which value wins.
    expect(() =>
      parsePhpRequest(
        php(`
$url = "https://a.test/";
$url = "https://b.test/";
curl_setopt_array($c, [CURLOPT_URL => $url]);`),
      ),
    ).toThrowError(DynamicExpressionError);
  });

  it("folds static string concatenation", () => {
    expect(
      request(
        php(
          `curl_setopt_array($c, [CURLOPT_URL => "https://api.test" . "/v1/items"]);`,
        ),
      ).url,
    ).toBe("https://api.test/v1/items");
  });

  it("folds concatenation whose operand is a bound variable", () => {
    // The fold has to resolve bindings first, or a base-URL constant joined to
    // a path reads as dynamic even though both halves are known.
    expect(
      request(
        php(`
$base = "https://api.test";
curl_setopt_array($c, [CURLOPT_URL => $base . "/v1/items"]);`),
      ).url,
    ).toBe("https://api.test/v1/items");
  });
});

describe("PHP Guzzle", () => {
  it("reads a request call with options", () => {
    const result = parsePhpRequest(
      php(`
$client = new GuzzleHttp\\Client();
$response = $client->request("POST", "https://api.example.com/v1/items", [
    "headers" => ["Content-Type" => "application/json"],
    "body" => "{\\"n\\":1}",
    "allow_redirects" => false,
]);`),
    );
    expect(result.client).toBe("guzzle");
    expect(result.request.method).toBe("POST");
    expect(result.request.options.followRedirects).toBe(false);
    expect(result.request.body).toMatchObject({ kind: "json" });
  });

  it("reads the json, query, and auth options", () => {
    const result = parsePhpRequest(
      php(`
$client = new GuzzleHttp\\Client();
$client->post("https://api.example.com/x", [
    "json" => ["name" => "Ada", "active" => true],
    "query" => ["page" => "2"],
    "auth" => ["user", "pass"],
]);`),
    );
    expect(result.request.query).toEqual([{ name: "page", value: "2" }]);
    expect(result.request.auth).toEqual({
      kind: "basic",
      username: "user",
      password: "pass",
    });
    expect(result.request.body).toMatchObject({
      kind: "json",
      raw: '{"name":"Ada","active":true}',
    });
  });

  it("defaults to following redirects, unlike the cURL extension", () => {
    expect(
      parsePhpRequest(php(`$client->get("https://x.test/");`)).request.options
        .followRedirects,
    ).toBe(true);
  });

  it("reads form_params as a urlencoded body", () => {
    expect(
      request(
        php(
          `$client->post("https://x.test/", ["form_params" => ["a" => "1", "b" => "2"]]);`,
        ),
      ).body,
    ).toMatchObject({ kind: "form-urlencoded", raw: "a=1&b=2" });
  });
});

describe("PHP round trips", () => {
  it.each([
    "curl 'https://api.example.com/items?tag=a&tag=b' -H 'Accept: application/json'",
    `curl -X POST 'https://api.example.com/items' -H 'Content-Type: application/json' --data-raw '{"n":1}'`,
    "curl -X PUT 'https://api.example.com/x' -d 'a=1&b=2'",
    "curl -X DELETE 'https://api.example.com/x' -H 'X-Token: abc' -L",
    "curl 'https://api.example.com/x' -u 'user:pass'",
    "curl -X POST 'https://api.example.com/u' -F 'source=mobile' -F 'tag=alpha'",
  ])("round-trips %s through both PHP generators", (command) => {
    for (const id of ["php-curl", "php-guzzle"] as const) {
      const original = parseCurl(command).request;
      const code = generateCode(original, id).code;
      const reversed = parseCodeRequest(code);
      expect(
        requestsAreSemanticallyEqual(original, reversed.request),
        JSON.stringify({ id, code, curl: generateCurl(reversed.request).code }),
      ).toBe(true);
    }
  });
});
