import {
  normalizeRequest,
  parseCurl,
  requestsAreSemanticallyEqual,
} from "@curltocode/core";
import { describe, expect, it } from "vitest";

import { generateCode, generateCurl } from "../src/index.js";
import {
  DynamicExpressionError,
  parseJavaScriptRequest,
} from "../src/reverse/index.js";

describe("parseJavaScriptRequest", () => {
  it("parses static JavaScript fetch requests", () => {
    const parsed = parseJavaScriptRequest(`
      const response = await fetch("https://api.example.com/users?page=1", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer secret",
          Cookie: "session=abc; theme=dark"
        },
        body: JSON.stringify({ name: "Eklavya", active: true }),
        redirect: "manual"
      });
    `);
    expect(parsed.client).toBe("fetch");
    expect(parsed.request).toMatchObject({
      method: "POST",
      url: "https://api.example.com/users",
      query: [{ name: "page", value: "1" }],
      auth: { kind: "bearer", token: "secret" },
      cookies: [
        { name: "session", value: "abc" },
        { name: "theme", value: "dark" },
      ],
      options: { followRedirects: false },
      body: { kind: "json", value: { name: "Eklavya", active: true } },
    });
  });

  it("parses TypeScript fetch with duplicate Headers entries and URLSearchParams", () => {
    const parsed = parseJavaScriptRequest(`
      fetch("https://example.com", {
        method: "POST",
        headers: new Headers([["X-Test", "a"], ["X-Test", "b"]]),
        body: new URLSearchParams([["tag", "a"], ["tag", "b"]])
      } satisfies RequestInit)
    `);
    expect(parsed.request.headers).toEqual([
      { name: "X-Test", value: "a" },
      { name: "X-Test", value: "b" },
    ]);
    expect(parsed.request.body).toEqual({
      kind: "form-urlencoded",
      raw: "tag=a&tag=b",
      fields: [
        { name: "tag", value: "a" },
        { name: "tag", value: "b" },
      ],
    });
  });

  it("uses headers and client defaults to preserve body semantics", () => {
    const fetchWithoutJsonHeader = parseJavaScriptRequest(
      'fetch("https://example.com", { method: "POST", body: JSON.stringify({ name: "Ada" }) });',
    );
    expect(fetchWithoutJsonHeader.request.body).toEqual({
      kind: "text",
      value: '{"name":"Ada"}',
    });
    expect(fetchWithoutJsonHeader.request.headers).toContainEqual({
      name: "Content-Type",
      value: "text/plain;charset=UTF-8",
    });

    const axiosObject = parseJavaScriptRequest(
      'axios.post("https://example.com", { name: "Ada" });',
    );
    expect(axiosObject.request.headers).toContainEqual({
      name: "Content-Type",
      value: "application/json",
    });
    expect(axiosObject.request.body).toMatchObject({ kind: "json" });

    const axiosString = parseJavaScriptRequest(
      'axios.post("https://example.com", "name=Ada");',
    );
    expect(axiosString.request.body).toEqual({
      kind: "form-urlencoded",
      raw: "name=Ada",
      fields: [{ name: "name", value: "Ada" }],
    });

    const fetchForm = parseJavaScriptRequest(`
      fetch("https://example.com", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "tag=a&tag=b"
      });
    `);
    expect(fetchForm.request.body).toEqual({
      kind: "form-urlencoded",
      raw: "tag=a&tag=b",
      fields: [
        { name: "tag", value: "a" },
        { name: "tag", value: "b" },
      ],
    });
  });

  it("parses Axios configuration and convenience calls", () => {
    const configured = parseJavaScriptRequest(`
      axios({
        url: "https://example.com/items",
        method: "patch",
        params: { page: 2, active: true },
        headers: { "X-Key": "secret" },
        data: { name: "Ada" },
        maxRedirects: 0,
        auth: { username: "ada", password: "secret" }
      });
    `);
    expect(configured.request).toMatchObject({
      method: "PATCH",
      query: [
        { name: "page", value: "2" },
        { name: "active", value: "true" },
      ],
      body: { kind: "json", value: { name: "Ada" } },
      options: { followRedirects: false },
      auth: { kind: "basic", username: "ada", password: "secret" },
    });
    expect(
      parseJavaScriptRequest('axios.post("https://example.com", "hello");')
        .request,
    ).toMatchObject({
      method: "POST",
      body: {
        kind: "form-urlencoded",
        raw: "hello",
        fields: [{ name: "hello", value: "" }],
      },
    });
  });

  it("supports qualified Fetch and imported Axios aliases", () => {
    expect(
      parseJavaScriptRequest(
        'globalThis.fetch("https://example.com", { method: "DELETE" });',
      ).request.method,
    ).toBe("DELETE");
    const aliased = parseJavaScriptRequest(`
      import http from "axios";
      http.patch("https://example.com/items", { active: true });
    `);
    expect(aliased).toMatchObject({
      client: "axios",
      request: {
        method: "PATCH",
        body: { kind: "json", value: { active: true } },
      },
    });
  });

  it("resolves safe program-level const bindings without executing code", () => {
    const parsed = parseJavaScriptRequest(`
      const baseUrl = "https://api.example.com";
      const url = baseUrl;
      const headers = { "Content-Type": "application/json", "X-Key": "local" };
      const payload = { name: "Ada", active: true };
      const options = {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        redirect: "manual"
      };
      fetch(url, options);
    `);
    expect(parsed.request).toMatchObject({
      method: "POST",
      url: "https://api.example.com/",
      headers: [
        { name: "Content-Type", value: "application/json" },
        { name: "X-Key", value: "local" },
      ],
      body: { kind: "json", value: { name: "Ada", active: true } },
      options: { followRedirects: false },
    });
  });

  it("resolves static concatenation, template interpolation, and JSON spacing", () => {
    const parsed = parseJavaScriptRequest(`
      const origin = "https://api.example.com";
      const version = 2;
      const url = origin + "/v" + version + "/items";
      const payload = { name: "Ada" };
      fetch(\`${"${url}"}?active=${"${true}"}\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload, null, 2)
      });
    `);
    expect(parsed.request).toMatchObject({
      url: "https://api.example.com/v2/items",
      query: [{ name: "active", value: "true" }],
      body: { kind: "json", raw: '{\n  "name": "Ada"\n}' },
    });
  });

  it("resolves const bindings in the lexical function and block containing the request", () => {
    const parsed = parseJavaScriptRequest(`
      function sendRequest() {
        const url = "https://api.example.com/items";
        const method = "PUT";
        if (true) {
          const body = { name: "Ada" };
          const init = {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          };
          return fetch(url, init);
        }
      }
    `);
    expect(parsed.request).toMatchObject({
      method: "PUT",
      url: "https://api.example.com/items",
      body: { kind: "json", value: { name: "Ada" } },
    });
  });

  it("does not resolve const objects that may have been mutated", () => {
    expect(() =>
      parseJavaScriptRequest(`
        const options = { method: "POST" };
        options.method = "DELETE";
        fetch("https://example.com", options);
      `),
    ).toThrowError(/Dynamic fetch options/u);
  });

  it("does not resolve FormData passed to unknown code before the request", () => {
    expect(() =>
      parseJavaScriptRequest(`
        const formData = new FormData();
        formData.append("name", "Ada");
        mutate(formData);
        fetch("https://example.com", { method: "POST", body: formData });
      `),
    ).toThrowError(/Dynamic body/u);
  });

  it("rejects unsupported request options instead of silently discarding them", () => {
    expect(() =>
      parseJavaScriptRequest(
        'fetch("https://example.com", { credentials: "include" });',
      ),
    ).toThrowError(/Unsupported fetch option/u);
    expect(() =>
      parseJavaScriptRequest(
        'axios({ url: "https://example.com", timeout: 1000 });',
      ),
    ).toThrowError(/Unsupported Axios option/u);
    expect(() =>
      parseJavaScriptRequest(`
        axios.post("https://example.com", { name: "Ada" }, {
          headers: { "Content-Type": "multipart/form-data" }
        });
      `),
    ).toThrowError(/automatic object serialization/u);
  });

  it("models JSON.stringify bytes using an explicit form content type", () => {
    const parsed = parseJavaScriptRequest(`
      fetch("https://example.com", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: JSON.stringify({ name: "Ada" })
      });
    `);
    expect(parsed.request.body).toEqual({
      kind: "form-urlencoded",
      raw: '{"name":"Ada"}',
      fields: [{ name: '{"name":"Ada"}', value: "" }],
    });
  });

  it("returns structured issues for dynamic expressions without inventing values", () => {
    expect.assertions(6);
    try {
      parseJavaScriptRequest(
        "fetch(getApiUrl(), { headers: getHeaders(), body: makeBody() });",
      );
    } catch (error) {
      expect(error).toBeInstanceOf(DynamicExpressionError);
      if (error instanceof DynamicExpressionError) {
        expect(error.issues.map((entry) => entry.kind)).toEqual([
          "url",
          "headers",
          "body",
        ]);
        expect(error.issues[0]?.expression).toBe("getApiUrl()");
        expect(error.partial).toEqual({ client: "fetch", method: "GET" });
        expect(error.message).toContain("Unable to statically resolve");
        expect(error.partial).not.toHaveProperty("body");
      }
    }
  });

  it("retains every safely resolved detail when another expression is dynamic", () => {
    expect.assertions(2);
    try {
      parseJavaScriptRequest(`
        fetch(getApiUrl(), {
          method: "PATCH",
          headers: { Authorization: "Bearer local-token" },
          body: "known body",
          redirect: "manual"
        });
      `);
    } catch (error) {
      expect(error).toBeInstanceOf(DynamicExpressionError);
      if (error instanceof DynamicExpressionError) {
        expect(error.partial).toMatchObject({
          client: "fetch",
          method: "PATCH",
          auth: { kind: "bearer", token: "local-token" },
          body: { kind: "text", value: "known body" },
          followRedirects: false,
        });
      }
    }
  });

  it("returns a controlled syntax error and missing-request error", () => {
    expect(() => parseJavaScriptRequest("fetch(")).toThrowError(
      expect.objectContaining({ code: "CODE_PARSE_ERROR" }),
    );
    expect(() => parseJavaScriptRequest("const value = 1;")).toThrowError(
      /No supported JavaScript request was found/u,
    );
  });

  it.each([
    "javascript-fetch",
    "typescript-fetch",
    "javascript-axios",
    "typescript-axios",
  ] as const)("round-trips semantic request data through %s", (id) => {
    const original = parseCurl(
      `curl -L 'https://api.example.com/users?tag=a&tag=b' -X POST -H 'Content-Type: application/json' -H 'X-Trace: one' -u 'ada:sëcret' -b 'session=abc; theme=dark' --data-raw '{"name":"こんにちは","active":true}'`,
    ).request;
    const code = generateCode(original, id).code;
    const reversed = parseJavaScriptRequest(code).request;
    expect(
      requestsAreSemanticallyEqual(original, reversed),
      `\n${code}\n${JSON.stringify(normalizeRequest(reversed))}`,
    ).toBe(true);
    expect(generateCurl(reversed).code).toContain(
      "https://api.example.com/users?tag=a&tag=b",
    );
  });

  it.each([
    "javascript-fetch",
    "typescript-fetch",
    "javascript-axios",
    "typescript-axios",
  ] as const)("round-trips form bytes through %s", (id) => {
    const original = parseCurl(
      "curl -L https://example.com -d 'tag=a' -d 'tag=b' --data-urlencode 'q=a b'",
    ).request;
    const reversed = parseJavaScriptRequest(
      generateCode(original, id).code,
    ).request;
    expect(
      requestsAreSemanticallyEqual(original, reversed),
      JSON.stringify(
        {
          original: normalizeRequest(original),
          reversed: normalizeRequest(reversed),
          code: generateCode(original, id).code,
        },
        null,
        2,
      ),
    ).toBe(true);
  });

  it.each([
    "javascript-fetch",
    "typescript-fetch",
    "javascript-axios",
    "typescript-axios",
  ] as const)("round-trips inline binary bytes through %s", (id) => {
    const original = parseCurl(
      "curl https://example.com --data-binary 'zero\\n😀bytes'",
    ).request;
    const code = generateCode(original, id).code;
    const reversed = parseJavaScriptRequest(code).request;
    expect(
      requestsAreSemanticallyEqual(original, reversed),
      JSON.stringify({ code, reversed: normalizeRequest(reversed) }, null, 2),
    ).toBe(true);
  });

  it.each([
    "javascript-fetch",
    "typescript-fetch",
    "javascript-axios",
    "typescript-axios",
  ] as const)("round-trips static multipart fields through %s", (id) => {
    const original = parseCurl(
      "curl https://example.com -F 'tag=a' -F 'tag=b' -F 'message=こんにちは'",
    ).request;
    const code = generateCode(original, id).code;
    const reversed = parseJavaScriptRequest(code).request;
    expect(
      requestsAreSemanticallyEqual(original, reversed),
      JSON.stringify({ code, reversed: normalizeRequest(reversed) }, null, 2),
    ).toBe(true);
  });

  it.each([
    "javascript-fetch",
    "typescript-fetch",
    "javascript-axios",
    "typescript-axios",
  ] as const)("round-trips explicit text bodies through %s", (id) => {
    const original = parseCurl(
      "curl https://example.com/notes -X PUT -H 'Content-Type: text/plain' --data-raw 'line one\\nこんにちは'",
    ).request;
    const code = generateCode(original, id).code;
    const reversed = parseJavaScriptRequest(code).request;
    expect(requestsAreSemanticallyEqual(original, reversed)).toBe(true);
  });
});

describe("Undici reverse parsing", () => {
  it.each([
    "curl 'https://api.example.com/items?tag=a&tag=b' -H 'Accept: application/json'",
    "curl -X POST 'https://api.example.com/items' -H 'Content-Type: application/json' --data-raw '{\"n\":1}' -u 'u:p' -b 'sid=1' -L",
    "curl -X POST 'https://api.example.com/f' -d 'a=1&b=2'",
    "curl -X PUT 'https://api.example.com/x' -H 'X-D: 1' -H 'X-D: 2' --data-raw 'hello'",
  ])("round-trips %s through the Undici generator", (command) => {
    for (const id of ["javascript-undici", "typescript-undici"] as const) {
      const original = parseCurl(command).request;
      const code = generateCode(original, id).code;
      const reversed = parseJavaScriptRequest(code);
      expect(reversed.client).toBe("undici");
      expect(
        requestsAreSemanticallyEqual(original, reversed.request),
        JSON.stringify({ id, code }, null, 2),
      ).toBe(true);
    }
  });

  it("reads a hand-written request with query and object headers", () => {
    const result = parseJavaScriptRequest(
      [
        'import { request } from "undici";',
        'const response = await request("https://api.example.com/x", {',
        '  method: "POST",',
        '  headers: { "content-type": "application/json" },',
        "  body: JSON.stringify({ a: 1 }),",
        '  query: { p: "1" },',
        "});",
      ].join("\n"),
    );
    expect(result.client).toBe("undici");
    expect(result.request.method).toBe("POST");
    expect(result.request.query).toEqual([{ name: "p", value: "1" }]);
    expect(result.request.body).toMatchObject({ kind: "json" });
  });

  it("treats redirects as opt-in, unlike fetch", () => {
    const namespaced = 'import undici from "undici";\n';
    expect(
      parseJavaScriptRequest(
        `${namespaced}await undici.request("https://api.example.com/y");`,
      ).request.options.followRedirects,
    ).toBe(false);
    expect(
      parseJavaScriptRequest(
        `${namespaced}await undici.request("https://api.example.com/y", { maxRedirections: 5 });`,
      ).request.options.followRedirects,
    ).toBe(true);
  });

  it("reports an unsupported Undici option instead of dropping it", () => {
    expect(() =>
      parseJavaScriptRequest(
        [
          'import { request } from "undici";',
          'await request("https://api.example.com/x", { bodyTimeout: 500 });',
        ].join("\n"),
      ),
    ).toThrowError(DynamicExpressionError);
  });
});

describe("Axios instances", () => {
  it("resolves a baseURL and merges instance headers", () => {
    const result = parseJavaScriptRequest(
      [
        'import axios from "axios";',
        "const client = axios.create({",
        '  baseURL: "https://api.example.com/v1",',
        '  headers: { "X-Key": "instance", Accept: "application/json" },',
        "});",
        'await client.get("/users", { headers: { "X-Key": "call" } });',
      ].join("\n"),
    );
    expect(result.client).toBe("axios");
    expect(result.request.url).toBe("https://api.example.com/v1/users");
    // A per-call header replaces the instance default rather than duplicating it.
    expect(result.request.headers).toEqual([
      { name: "Accept", value: "application/json" },
      { name: "X-Key", value: "call" },
    ]);
  });

  it("keeps an absolute call URL in preference to the baseURL", () => {
    const result = parseJavaScriptRequest(
      [
        'import axios from "axios";',
        'const client = axios.create({ baseURL: "https://api.example.com" });',
        'await client.delete("https://other.example.com/z");',
      ].join("\n"),
    );
    expect(result.request.url).toBe("https://other.example.com/z");
    expect(result.request.method).toBe("DELETE");
  });

  it("takes instance auth when the call does not override it", () => {
    const result = parseJavaScriptRequest(
      [
        'import axios from "axios";',
        'const client = axios.create({ auth: { username: "u", password: "p" } });',
        'await client.get("https://api.example.com/x");',
      ].join("\n"),
    );
    expect(result.request.auth).toEqual({
      kind: "basic",
      username: "u",
      password: "p",
    });
  });

  it("supports head and options methods", () => {
    expect(
      parseJavaScriptRequest('axios.head("https://api.example.com/x")').request
        .method,
    ).toBe("HEAD");
    expect(
      parseJavaScriptRequest('axios.options("https://api.example.com/x")')
        .request.method,
    ).toBe("OPTIONS");
  });
});

describe("fetch URL and Request forms", () => {
  it("reads fetch(new URL(...)) including the relative base form", () => {
    expect(
      parseJavaScriptRequest('fetch(new URL("https://api.example.com/x"))')
        .request.url,
    ).toBe("https://api.example.com/x");
    expect(
      parseJavaScriptRequest(
        'fetch(new URL("/v2/items", "https://api.example.com"))',
      ).request.url,
    ).toBe("https://api.example.com/v2/items");
  });

  it("reads new Request(url, init) and lets a later init override it", () => {
    const result = parseJavaScriptRequest(
      [
        'const req = new Request("https://api.example.com/x", {',
        '  method: "PUT",',
        '  headers: { "X-A": "1" },',
        "});",
        "await fetch(req);",
      ].join("\n"),
    );
    expect(result.request.method).toBe("PUT");
    expect(result.request.headers).toEqual([{ name: "X-A", value: "1" }]);
  });
});
