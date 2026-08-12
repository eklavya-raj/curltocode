import { describe, expect, it } from "vitest";

import { createHttpRequest } from "../src/index.js";

describe("createHttpRequest validation", () => {
  it("rejects invalid methods, headers, cookies, auth, and multipart values", () => {
    expect(() =>
      createHttpRequest("https://example.com", { method: "bad method" }),
    ).toThrowError(
      expect.objectContaining({ code: "VALIDATION_INVALID_METHOD" }),
    );
    expect(() =>
      createHttpRequest("https://example.com", {
        headers: [{ name: "Bad Header", value: "value" }],
      }),
    ).toThrowError(
      expect.objectContaining({ code: "VALIDATION_INVALID_REQUEST" }),
    );
    expect(() =>
      createHttpRequest("https://example.com", {
        cookies: [{ name: "session id", value: "secret" }],
      }),
    ).toThrowError(/invalid cookie/u);
    expect(() =>
      createHttpRequest("https://example.com", {
        auth: { kind: "bearer", token: "" },
      }),
    ).toThrowError(/invalid bearer token/u);
    expect(() =>
      createHttpRequest("https://example.com", {
        body: {
          kind: "multipart",
          parts: [{ kind: "field", name: "", value: "Ada" }],
        },
      }),
    ).toThrowError(/invalid multipart part/u);
  });

  it("accepts duplicate valid headers and cookies for clients that support them", () => {
    const request = createHttpRequest("https://example.com", {
      headers: [
        { name: "X-Trace", value: "one" },
        { name: "X-Trace", value: "two" },
      ],
      cookies: [
        { name: "session", value: "one" },
        { name: "session", value: "two" },
      ],
    });
    expect(request.headers).toHaveLength(2);
    expect(request.cookies).toHaveLength(2);
  });
});
