import { describe, expect, it } from "vitest";

import { parseCodeRequest } from "../src/reverse/index.js";
import { DynamicExpressionError } from "../src/reverse/types.js";

describe("Got", () => {
  it("reads the options form, including a boolean redirect policy", () => {
    const result = parseCodeRequest(`
      import got from "got";

      const response = await got("https://api.example.com/v1/accounts/acc_42", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: '{"active":true}',
        followRedirect: false,
        retry: { limit: 0 },
        throwHttpErrors: false,
      });
    `);
    expect(result.client).toBe("got");
    expect(result.request.method).toBe("PATCH");
    expect(result.request.url).toBe(
      "https://api.example.com/v1/accounts/acc_42",
    );
    expect(result.request.body).toEqual({
      kind: "json",
      value: { active: true },
      raw: '{"active":true}',
    });
    expect(result.request.options.followRedirects).toBe(false);
  });

  it("follows redirects when the option is absent, which is Got's default", () => {
    const result = parseCodeRequest(`
      import got from "got";
      const response = await got("https://api.example.com/v1/health");
    `);
    expect(result.request.options.followRedirects).toBe(true);
  });

  it("serializes the json option and states the content type it implies", () => {
    const result = parseCodeRequest(`
      import got from "got";
      await got("https://api.example.com/v1/events", {
        method: "POST",
        json: { name: "deploy", ok: true },
      });
    `);
    expect(result.request.body).toEqual({
      kind: "json",
      value: { name: "deploy", ok: true },
      raw: '{"name":"deploy","ok":true}',
    });
    expect(result.request.headers).toContainEqual({
      name: "Content-Type",
      value: "application/json",
    });
  });

  it("reads the form option as a urlencoded body", () => {
    const result = parseCodeRequest(`
      import got from "got";
      await got("https://auth.example.com/oauth/token", {
        method: "POST",
        form: { grant_type: "client_credentials" },
      });
    `);
    expect(result.request.body).toEqual({
      kind: "form-urlencoded",
      fields: [{ name: "grant_type", value: "client_credentials" }],
      raw: "grant_type=client_credentials",
    });
  });

  it("appends searchParams to the URL rather than losing them", () => {
    const result = parseCodeRequest(`
      import got from "got";
      await got("https://api.example.com/v1/search", {
        searchParams: { q: "hello world", tag: "ts" },
      });
    `);
    expect(result.request.query).toEqual([
      { name: "q", value: "hello world" },
      { name: "tag", value: "ts" },
    ]);
  });

  it("reads a per-verb shortcut as the method", () => {
    const result = parseCodeRequest(`
      import got from "got";
      await got.post("https://api.example.com/v1/imports", { body: "raw" });
    `);
    expect(result.request.method).toBe("POST");
  });

  it("reports an option it cannot represent instead of dropping it", () => {
    expect.assertions(2);
    try {
      parseCodeRequest(`
        import got from "got";
        await got("https://api.example.com/v1/x", { agent: { https: proxy } });
      `);
    } catch (error) {
      expect(error).toBeInstanceOf(DynamicExpressionError);
      expect((error as DynamicExpressionError).message).toContain("agent");
    }
  });
});

describe("Ky", () => {
  it("reads the fetch redirect enum Ky inherits", () => {
    const result = parseCodeRequest(`
      import ky from "ky";

      const response = await ky("https://api.example.com/v1/private", {
        method: "GET",
        headers: { Authorization: "Basic c2VydmljZS11c2VyOnBhc3M=" },
        redirect: "manual",
        retry: 0,
        throwHttpErrors: false,
      });
    `);
    expect(result.client).toBe("ky");
    expect(result.request.options.followRedirects).toBe(false);
    expect(result.request.auth).toEqual({
      kind: "basic",
      username: "service-user",
      password: "pass",
    });
  });

  it("adds the text content type fetch specifies for a string body", () => {
    const result = parseCodeRequest(`
      import ky from "ky";
      await ky("https://hooks.example.com/events", {
        method: "POST",
        body: "deployment complete",
      });
    `);
    expect(result.request.headers).toContainEqual({
      name: "Content-Type",
      value: "text/plain;charset=UTF-8",
    });
  });
});

describe("SuperAgent", () => {
  it("reads a chain built with the explicit method form", () => {
    const result = parseCodeRequest(`
      import superagent from "superagent";

      const request = superagent("PURGE", "https://cache.example.com/v1/entries/user-42")
        .set({ "X-Audit-Reason": "duplicate-account" })
        .redirects(0)
        .ok(() => true);
    `);
    expect(result.client).toBe("superagent");
    expect(result.request.method).toBe("PURGE");
    expect(result.request.headers).toEqual([
      { name: "X-Audit-Reason", value: "duplicate-account" },
    ]);
    expect(result.request.options.followRedirects).toBe(false);
  });

  it("reads the per-verb helpers, including del for DELETE", () => {
    const result = parseCodeRequest(`
      const superagent = require("superagent");
      superagent.del("https://api.example.com/v1/users/user-42").redirects(5);
    `);
    expect(result.request.method).toBe("DELETE");
    expect(result.request.options.followRedirects).toBe(true);
  });

  it("reads credentials, a two-argument set, and a sent body", () => {
    const result = parseCodeRequest(`
      import superagent from "superagent";
      superagent
        .post("https://api.example.com/v1/notes")
        .auth("service-user", "p@ss:word")
        .set("Content-Type", "text/plain; charset=utf-8")
        .send("hello");
    `);
    expect(result.request.auth).toEqual({
      kind: "basic",
      username: "service-user",
      password: "p@ss:word",
    });
    expect(result.request.body).toEqual({
      kind: "text",
      value: "hello",
      contentType: "text/plain; charset=utf-8",
    });
  });

  it("reads field and attach steps as a multipart body", () => {
    const result = parseCodeRequest(`
      import superagent from "superagent";
      superagent
        .post("https://uploads.example.com/v1/documents")
        .field("description", "Quarterly report")
        .attach("document", "/tmp/report.pdf", {
          filename: "report.pdf",
          contentType: "application/pdf",
        });
    `);
    expect(result.request.body).toEqual({
      kind: "multipart",
      parts: [
        { kind: "field", name: "description", value: "Quarterly report" },
        {
          kind: "file",
          name: "document",
          path: "/tmp/report.pdf",
          filename: "report.pdf",
          contentType: "application/pdf",
        },
      ],
    });
  });

  it("reports a chain step it does not understand", () => {
    expect.assertions(2);
    try {
      parseCodeRequest(`
        import superagent from "superagent";
        superagent.get("https://api.example.com/v1/x").pfx(clientCertificate);
      `);
    } catch (error) {
      expect(error).toBeInstanceOf(DynamicExpressionError);
      expect((error as DynamicExpressionError).message).toContain("pfx");
    }
  });
});

describe("node:https", () => {
  it("reads the options object and the payload written to the request", () => {
    const result = parseCodeRequest(`
      import { request } from "node:https";

      const options = {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      };

      const req = request("https://auth.example.com/oauth/token", options, (response) => {});
      req.write("grant_type=client_credentials&scope=read");
      req.end();
    `);
    expect(result.client).toBe("https");
    expect(result.request.method).toBe("POST");
    expect(result.request.body).toEqual({
      kind: "form-urlencoded",
      fields: [
        { name: "grant_type", value: "client_credentials" },
        { name: "scope", value: "read" },
      ],
      raw: "grant_type=client_credentials&scope=read",
    });
  });

  it("keeps a header name that appears twice as an array", () => {
    const result = parseCodeRequest(`
      const https = require("node:https");
      const req = https.request("https://api.example.com/v1/features", {
        method: "GET",
        headers: { "X-Feature": ["alpha", "beta"] },
      });
      req.end();
    `);
    expect(result.request.headers).toEqual([
      { name: "X-Feature", value: "alpha" },
      { name: "X-Feature", value: "beta" },
    ]);
  });

  it("never claims the core module follows redirects", () => {
    const result = parseCodeRequest(`
      import { request } from "node:https";
      const req = request("https://api.example.com/v1/health", { method: "GET" });
      req.end();
    `);
    expect(result.request.options.followRedirects).toBe(false);
  });

  it("reads a hand-written multipart payload back into its fields", () => {
    const result = parseCodeRequest(`
      import { request } from "node:https";
      const req = request("https://api.example.com/v1/imports", {
        method: "POST",
        headers: { "Content-Type": "multipart/form-data; boundary=X1" },
      });
      req.write("--X1\\r\\nContent-Disposition: form-data; name=\\"source\\"\\r\\n\\r\\n");
      req.write("mobile");
      req.write("\\r\\n");
      req.write("--X1--\\r\\n");
      req.end();
    `);
    expect(result.request.body).toEqual({
      kind: "multipart",
      parts: [{ kind: "field", name: "source", value: "mobile" }],
    });
    // The boundary belongs to this message rather than to the request.
    expect(result.request.headers).toEqual([]);
  });

  it("refuses a multipart payload that carries a file's bytes", () => {
    expect.assertions(2);
    try {
      parseCodeRequest(`
        import { request } from "node:https";
        const req = request("https://api.example.com/v1/imports", {
          method: "POST",
          headers: { "Content-Type": "multipart/form-data; boundary=X1" },
        });
        req.write("--X1\\r\\nContent-Disposition: form-data; name=\\"f\\"; filename=\\"a.bin\\"\\r\\n\\r\\n");
        req.write("bytes");
        req.write("\\r\\n--X1--\\r\\n");
        req.end();
      `);
    } catch (error) {
      expect(error).toBeInstanceOf(DynamicExpressionError);
      expect((error as DynamicExpressionError).message).toContain(
        "rather than its path",
      );
    }
  });
});

describe("jQuery", () => {
  it("reads $.ajax settings, taking contentType as the header it sets", () => {
    const result = parseCodeRequest(`
      $.ajax({
        url: "https://api.example.com/v1/accounts/acc_42",
        method: "PATCH",
        headers: { Authorization: "Bearer tok_live_123" },
        data: '{"active":true}',
        processData: false,
        contentType: "application/json",
      });
    `);
    expect(result.client).toBe("jquery");
    expect(result.request.method).toBe("PATCH");
    expect(result.request.body).toEqual({
      kind: "json",
      value: { active: true },
      raw: '{"active":true}',
    });
  });

  it("treats contentType false as no declared type", () => {
    const result = parseCodeRequest(`
      jQuery.ajax({ url: "https://api.example.com/v1/health", contentType: false });
    `);
    expect(result.request.headers).toEqual([]);
  });

  it("states that the request follows redirects, because it cannot not", () => {
    const result = parseCodeRequest(`
      $.ajax({ url: "https://api.example.com/v1/health", method: "GET" });
    `);
    expect(result.request.options.followRedirects).toBe(true);
  });

  it("reads a FormData body built before the call", () => {
    const result = parseCodeRequest(`
      const formData = new FormData();
      formData.append("source", "mobile");
      formData.append("tag", "alpha");

      $.ajax({
        url: "https://api.example.com/v1/imports",
        method: "POST",
        data: formData,
        processData: false,
        contentType: false,
      });
    `);
    expect(result.request.body).toEqual({
      kind: "multipart",
      parts: [
        { kind: "field", name: "source", value: "mobile" },
        { kind: "field", name: "tag", value: "alpha" },
      ],
    });
  });

  it("reports a setting it cannot represent", () => {
    expect.assertions(2);
    try {
      parseCodeRequest(`
        $.ajax({ url: "https://api.example.com/v1/x", xhrFields: { withCredentials: true } });
      `);
    } catch (error) {
      expect(error).toBeInstanceOf(DynamicExpressionError);
      expect((error as DynamicExpressionError).message).toContain("xhrFields");
    }
  });
});

describe("XMLHttpRequest", () => {
  it("reads open, setRequestHeader, and send as one request", () => {
    const result = parseCodeRequest(`
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "https://hooks.example.com/events");
      xhr.setRequestHeader("Content-Type", "text/plain; charset=utf-8");

      xhr.onload = () => console.log(xhr.status, xhr.responseText);
      xhr.send("deployment complete");
    `);
    expect(result.client).toBe("xhr");
    expect(result.request.method).toBe("POST");
    expect(result.request.url).toBe("https://hooks.example.com/events");
    expect(result.request.body).toEqual({
      kind: "text",
      value: "deployment complete",
      contentType: "text/plain; charset=utf-8",
    });
  });

  it("reads the credentials open accepts as its fourth and fifth arguments", () => {
    const result = parseCodeRequest(`
      const xhr = new XMLHttpRequest();
      xhr.open("GET", "https://api.example.com/v1/private", true, "service-user", "pass");
      xhr.send();
    `);
    expect(result.request.auth).toEqual({
      kind: "basic",
      username: "service-user",
      password: "pass",
    });
  });

  it("resolves a body declared just above the send", () => {
    const result = parseCodeRequest(`
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "https://api.example.com/v1/notes");
      const payload = "note body";
      xhr.send(payload);
    `);
    expect(result.request.body).toEqual({ kind: "text", value: "note body" });
  });

  it("reports a request that is never sent", () => {
    expect(() =>
      parseCodeRequest(`
        const xhr = new XMLHttpRequest();
        xhr.open("GET", "https://api.example.com/v1/health");
      `),
    ).toThrow(/never sent/u);
  });
});
