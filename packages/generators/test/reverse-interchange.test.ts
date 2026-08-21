import { describe, expect, it } from "vitest";

import { generateCurl } from "../src/index.js";
import {
  listInterchangeRequests,
  parseCodeRequest,
} from "../src/reverse/index.js";

const toCurl = (source: string): string =>
  generateCurl(parseCodeRequest(source).request).code;

/** Shaped like a Chrome DevTools export: several entries, one of interest. */
const DEVTOOLS_HAR = JSON.stringify({
  log: {
    version: "1.2",
    creator: { name: "WebInspector", version: "537.36" },
    entries: [
      {
        startedDateTime: "2026-08-20T09:00:00.000Z",
        request: {
          method: "POST",
          url: "https://api.example.com/v1/accounts?dry=true",
          httpVersion: "http/2.0",
          headers: [
            { name: ":authority", value: "api.example.com" },
            { name: "content-type", value: "application/json" },
            { name: "authorization", value: "Bearer tok_123" },
          ],
          cookies: [{ name: "session", value: "abc" }],
          queryString: [{ name: "dry", value: "true" }],
          postData: {
            mimeType: "application/json",
            text: '{"name":"Ada"}',
          },
          headersSize: -1,
          bodySize: 14,
        },
      },
      {
        startedDateTime: "2026-08-20T09:00:01.000Z",
        request: {
          method: "GET",
          url: "https://api.example.com/v1/ping",
          httpVersion: "http/2.0",
          headers: [],
          cookies: [],
          queryString: [],
          headersSize: -1,
          bodySize: 0,
        },
      },
    ],
  },
});

describe("HAR", () => {
  it("recovers the first entry of a browser export", () => {
    const curl = toCurl(DEVTOOLS_HAR);
    expect(curl).toContain("https://api.example.com/v1/accounts?dry=true");
    expect(curl).toContain("-X POST");
    expect(curl).toContain("Bearer tok_123");
    expect(curl).toContain('{"name":"Ada"}');
    expect(curl).toContain("session=abc");
  });

  it("lists every entry so a caller can choose one", () => {
    const entries = listInterchangeRequests(DEVTOOLS_HAR);
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.name)).toEqual([
      "POST /v1/accounts",
      "GET /v1/ping",
    ]);
  });

  it("does not send a cookie twice when the archive lists it in both places", () => {
    const har = JSON.stringify({
      log: {
        version: "1.2",
        entries: [
          {
            request: {
              method: "GET",
              url: "https://example.com/",
              headers: [{ name: "Cookie", value: "a=1" }],
              cookies: [{ name: "a", value: "1" }],
            },
          },
        ],
      },
    });
    expect(toCurl(har).match(/a=1/gu)).toHaveLength(1);
  });

  it("recovers a multipart upload with its file path and media type", () => {
    const har = JSON.stringify({
      log: {
        version: "1.2",
        entries: [
          {
            request: {
              method: "POST",
              url: "https://example.com/upload",
              headers: [],
              postData: {
                mimeType: "multipart/form-data",
                params: [
                  { name: "note", value: "hello" },
                  {
                    name: "doc",
                    fileName: "/tmp/a.pdf",
                    contentType: "application/pdf",
                  },
                ],
              },
            },
          },
        ],
      },
    });
    const curl = toCurl(har);
    expect(curl).toContain("-F 'note=hello'");
    expect(curl).toContain("-F 'doc=@/tmp/a.pdf;type=application/pdf'");
  });
});

describe("Postman collections", () => {
  const collection = JSON.stringify({
    info: {
      name: "Example",
      schema:
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: [
      {
        name: "Folder",
        item: [
          {
            name: "Create account",
            request: {
              method: "POST",
              header: [
                { key: "Content-Type", value: "application/json" },
                { key: "X-Skip", value: "yes", disabled: true },
              ],
              auth: {
                type: "basic",
                basic: [
                  { key: "username", value: "ada" },
                  { key: "password", value: "p@ss" },
                ],
              },
              url: {
                raw: "https://api.example.com/v1/accounts",
                protocol: "https",
                host: ["api", "example", "com"],
                path: ["v1", "accounts"],
              },
              body: { mode: "raw", raw: '{"name":"Ada"}' },
            },
            protocolProfileBehavior: { followRedirects: true },
          },
        ],
      },
    ],
  });

  it("reaches a request nested inside a folder", () => {
    const curl = toCurl(collection);
    expect(curl).toContain("https://api.example.com/v1/accounts");
    expect(curl).toContain('{"name":"Ada"}');
  });

  it("maps the collection auth block back to -u", () => {
    expect(toCurl(collection)).toContain("-u 'ada:p@ss'");
  });

  it("keeps the follow-redirects behaviour the item recorded", () => {
    expect(toCurl(collection)).toContain("-L");
  });

  it("skips a header the collection marked as disabled", () => {
    expect(toCurl(collection)).not.toContain("X-Skip");
  });

  it("reads a file body written as the file mode", () => {
    const withFile = JSON.stringify({
      info: {
        schema:
          "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      item: [
        {
          name: "Upload",
          request: {
            method: "PUT",
            header: [],
            url: { raw: "https://example.com/raw" },
            body: { mode: "file", file: { src: "payload.bin" } },
          },
        },
      ],
    });
    expect(toCurl(withFile)).toContain("--data-binary '@payload.bin'");
  });
});

describe("JSON request documents", () => {
  it("round-trips a document this project generated", () => {
    const document = JSON.stringify({
      method: "PUT",
      url: "https://example.com/a?x=1",
      headers: [
        { name: "X-A", value: "one" },
        { name: "X-A", value: "two" },
      ],
      cookies: [{ name: "k", value: "v" }],
      auth: { kind: "bearer", token: "tok" },
      body: { kind: "text", value: "hello", contentType: "text/plain" },
      options: { followRedirects: true },
    });
    const curl = toCurl(document);
    expect(curl).toContain("-X PUT");
    expect(curl).toContain("X-A: one");
    expect(curl).toContain("X-A: two");
    expect(curl).toContain("k=v");
    expect(curl).toContain("Bearer tok");
    expect(curl).toContain("hello");
    expect(curl).toContain("-L");
  });
});

describe("format detection", () => {
  it("reports what a JSON document has to look like when it matches none", () => {
    expect(() => parseCodeRequest('{"hello":"world"}')).toThrowError(
      /not a HAR archive, a Postman collection, or a request document/u,
    );
  });

  it("explains a JSON syntax error rather than falling through to a parser", () => {
    expect(() => parseCodeRequest('{"log": {')).toThrowError(
      /No supported request was found/u,
    );
  });
});
