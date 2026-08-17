import { parseCurl, requestsAreSemanticallyEqual } from "@curltocode/core";
import { describe, expect, it } from "vitest";

import { GeneratorError, generateCode } from "../src/index.js";
import {
  detectReverseLanguage,
  parseCodeRequest,
  parseHttpMessageRequest,
} from "../src/reverse/index.js";
import { CodeParseError } from "../src/reverse/types.js";

const toMessage = (curl: string) =>
  generateCode(parseCurl(curl).request, "http-raw").code;
const request = (source: string) => parseHttpMessageRequest(source).request;

describe("cURL to a raw HTTP message", () => {
  it("writes an origin-form request line with the authority in Host", () => {
    expect(toMessage("curl 'https://api.example.com/v1/users?page=2'")).toBe(
      ["GET /v1/users?page=2 HTTP/1.1", "Host: api.example.com", "", ""].join(
        "\n",
      ),
    );
  });

  it("keeps a non-default port on the Host line", () => {
    expect(toMessage("curl 'http://localhost:8080/health'")).toContain(
      "Host: localhost:8080",
    );
  });

  it("counts Content-Length in bytes rather than characters", () => {
    // "é" is two bytes in UTF-8, so a character count would report 6 here.
    const message = toMessage(
      `curl 'https://api.example.com/v1/notes' --data-raw '{"n":"é"}'`,
    );
    expect(message).toContain("Content-Length: 10");
  });

  it("materializes auth and cookies as the headers they become on the wire", () => {
    const message = toMessage(
      "curl 'https://api.example.com/v1/me' -u 'ada:secret' -b 'session=abc; locale=en'",
    );
    expect(message).toContain("Authorization: Basic YWRhOnNlY3JldA==");
    expect(message).toContain("Cookie: session=abc; locale=en");
  });

  it("prefers an explicit Host header over the URL authority, without repeating it", () => {
    const message = toMessage(
      "curl 'https://10.0.0.5/health' -H 'Host: api.example.com'",
    );
    expect(message).toContain("Host: api.example.com");
    expect(message.match(/^Host:/gmu)).toHaveLength(1);
  });

  it("replaces an inbound multipart content type with the boundary it uses", () => {
    const message = toMessage(
      "curl 'https://api.example.com/v1/imports' -H 'Content-Type: multipart/form-data' -F 'source=mobile'",
    );
    const boundary = /boundary=(\S+)/u.exec(message)?.[1];
    expect(boundary).toBeDefined();
    expect(message.match(/^Content-Type:/gmu)).toHaveLength(1);
    expect(message).toContain(`--${boundary}\n`);
    expect(message).toContain('Content-Disposition: form-data; name="source"');
    expect(message).toContain(`--${boundary}--`);
  });

  it("refuses a file-backed body rather than inventing its contents", () => {
    expect(() =>
      toMessage(
        "curl 'https://uploads.example.com/v1/raw' -X PUT --data-binary '@payload.bin'",
      ),
    ).toThrowError(GeneratorError);
    try {
      toMessage("curl 'https://uploads.example.com/v1' -F 'doc=@/tmp/a.pdf'");
      expect.unreachable("a file part has no known contents");
    } catch (error) {
      expect((error as GeneratorError).code).toBe("GENERATOR_FILE_REFERENCE");
    }
  });
});

describe("a raw HTTP message back to a request", () => {
  it("is detected ahead of the language heuristics", () => {
    // Without the version this is just a sentence, and must not be claimed.
    expect(
      detectReverseLanguage("GET /v1/users HTTP/1.1\nHost: a.example"),
    ).toBe("http");
    expect(detectReverseLanguage("POST something to the queue")).not.toBe(
      "http",
    );
  });

  it("reads CRLF line endings as readily as LF", () => {
    const parsed = request(
      'POST /v1/items HTTP/1.1\r\nHost: api.example.com\r\nContent-Type: application/json\r\n\r\n{"n":1}',
    );
    expect(parsed.method).toBe("POST");
    expect(parsed.body).toEqual({
      kind: "json",
      value: { n: 1 },
      raw: '{"n":1}',
    });
  });

  it("accepts the absolute-form target a proxy request carries", () => {
    expect(
      request("GET https://api.example.com/v1/users HTTP/1.1\nHost: proxy").url,
    ).toBe("https://api.example.com/v1/users");
  });

  it("unfolds an obsolete continuation line instead of losing it", () => {
    expect(
      request(
        "GET /v1 HTTP/1.1\nHost: api.example.com\nX-Note: first\n  second",
      ).headers,
    ).toEqual([{ name: "X-Note", value: "first second" }]);
  });

  it("lifts Cookie and Authorization back out of the header block", () => {
    const parsed = request(
      [
        "GET /v1/me HTTP/1.1",
        "Host: api.example.com",
        "Authorization: Bearer tok_123",
        "Cookie: session=abc; locale=en",
      ].join("\n"),
    );
    expect(parsed.auth).toEqual({ kind: "bearer", token: "tok_123" });
    expect(parsed.cookies).toEqual([
      { name: "session", value: "abc" },
      { name: "locale", value: "en" },
    ]);
    expect(parsed.headers).toEqual([]);
  });

  it("infers the scheme the message cannot state", () => {
    const url = (host: string, extra = "") =>
      request(`GET /v1 HTTP/1.1\nHost: ${host}${extra}`).url;
    // A public authority with no port is HTTPS in practice.
    expect(url("api.example.com")).toBe("https://api.example.com/v1");
    expect(url("api.example.com:443")).toBe("https://api.example.com/v1");
    // Local development and explicit ports are not.
    expect(url("localhost:3000")).toBe("http://localhost:3000/v1");
    expect(url("127.0.0.1")).toBe("http://127.0.0.1/v1");
    // A forwarding header settles it outright, either way.
    expect(url("api.example.com", "\nX-Forwarded-Proto: http")).toBe(
      "http://api.example.com/v1",
    );
  });

  it("keeps redirect policy at the default a message cannot override", () => {
    expect(
      request("GET /v1 HTTP/1.1\nHost: api.example.com").options
        .followRedirects,
    ).toBe(false);
  });

  it("drops Content-Length, which the next target reframes for itself", () => {
    expect(
      request(
        "POST /v1 HTTP/1.1\nHost: api.example.com\nContent-Length: 7\n\nhi there",
      ).headers,
    ).toEqual([]);
  });

  it("reports a message with no way to name its host", () => {
    expect(() => request("GET /v1/users HTTP/1.1\nAccept: */*")).toThrowError(
      CodeParseError,
    );
  });

  it("reports a line that is neither a request line nor a header", () => {
    expect(() =>
      request("GET /v1 HTTP/1.1\nHost: api.example.com\nnot a header"),
    ).toThrowError(CodeParseError);
  });

  it("round-trips a multipart message through the shared entry point", () => {
    const original = parseCurl(
      "curl 'https://api.example.com/v1/imports' -F 'source=mobile' -F 'tag=alpha'",
    ).request;
    const recovered = parseCodeRequest(generateCode(original, "http-raw").code);
    expect(recovered.client).toBe("raw");
    expect(requestsAreSemanticallyEqual(original, recovered.request)).toBe(
      true,
    );
  });
});
