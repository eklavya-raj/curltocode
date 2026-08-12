import { parseCurl } from "@curltocode/core";
import { describe, expect, it } from "vitest";

import { generateCode } from "../src/index.js";
import type { GeneratorId } from "../src/index.js";

const ids = [
  "javascript-undici",
  "typescript-undici",
  "python-aiohttp",
  "go-resty",
  "php-guzzle",
  "java-apache",
  "csharp-restsharp",
  "ruby-faraday",
  "rust-ureq",
] as const satisfies readonly GeneratorId[];

const generate = (curl: string, id: GeneratorId): string =>
  generateCode(parseCurl(curl).request, id).code;

describe("common HTTP client generators", () => {
  it.each(ids)("%s is deterministic and preserves the complete URL", (id) => {
    const curl = "curl 'https://api.example.com/users?tag=a&tag=b&name=Ada'";
    expect(generate(curl, id)).toBe(generate(curl, id));
    expect(generate(curl, id)).toContain(
      "https://api.example.com/users?tag=a&tag=b&name=Ada",
    );
  });

  it.each(ids)(
    "%s preserves methods, JSON, headers, authentication, cookies, and Unicode",
    (id) => {
      const code = generate(
        `curl 'https://api.example.com/users' -X POST -H 'Content-Type: application/json' -H 'X-Quote: O'\\''Reilly' -u 'ada:sëcret' -b 'session=abc' --data-raw '{"name":"こんにちは"}'`,
        id,
      );
      expect(code.toLowerCase()).toContain("post");
      expect(code).toContain("application/json");
      expect(code).toContain("O'Reilly");
      expect(code).toContain("こんにちは");
      expect(code).toContain("session=abc");
      expect(code).toMatch(/ada|Basic /u);
    },
  );

  it.each(ids)("%s makes redirect behavior explicit", (id) => {
    expect(generate("curl -L https://example.com", id)).not.toBe(
      generate("curl https://example.com", id),
    );
  });

  it.each(ids)("%s emits exact form-urlencoded bytes", (id) => {
    const code = generate("curl https://example.com -d 'tag=a' -d 'tag=b'", id);
    expect(code).toContain("tag=a&tag=b");
    expect(code).toContain("application/x-www-form-urlencoded");
  });

  it.each(
    ids.filter((id) => id !== "ruby-faraday" && id !== "csharp-restsharp"),
  )("%s preserves duplicate header values", (id) => {
    const code = generate(
      "curl https://example.com -H 'X-Test: first' -H 'X-Test: second'",
      id,
    );
    expect(code).toContain("first");
    expect(code).toContain("second");
  });

  it("Faraday rejects duplicate headers instead of collapsing them", () => {
    expect(() =>
      generate(
        "curl https://example.com -H 'X-Test: first' -H 'X-Test: second'",
        "ruby-faraday",
      ),
    ).toThrowError(/cannot preserve duplicate header names/u);
  });

  it("RestSharp rejects duplicate headers instead of relying on parameter merging", () => {
    expect(() =>
      generate(
        "curl https://example.com -H 'X-Test: first' -H 'X-Test: second'",
        "csharp-restsharp",
      ),
    ).toThrowError(/does not guarantee duplicate request header names/u);
  });

  it.each(ids.filter((id) => id !== "rust-ureq"))(
    "%s represents multipart text and file parts",
    (id) => {
      const code = generate(
        "curl https://example.com -F 'note=hello' -F 'file=@/tmp/a.png;type=image/png'",
        id,
      );
      expect(code).toContain("note");
      expect(code).toContain("hello");
      expect(code).toContain("/tmp/a.png");
      expect(code).toContain("image/png");
    },
  );

  it("ureq reports its unstable multipart surface", () => {
    expect(() =>
      generate("curl https://example.com -F note=hello", "rust-ureq"),
    ).toThrowError(/multipart API is explicitly unversioned/u);
  });

  it("RestSharp reports extension methods outside its Method enum", () => {
    expect(() =>
      generate("curl -X PURGE https://example.com", "csharp-restsharp"),
    ).toThrowError(/does not expose a Method value for the PURGE method/u);
  });

  it("preserves custom methods in clients with generic method APIs", () => {
    for (const id of ids.filter((entry) => entry !== "csharp-restsharp")) {
      expect(generate("curl -X PURGE https://example.com", id)).toMatch(
        /purge/i,
      );
    }
  });

  it("reports current install guidance", () => {
    const request = parseCurl("curl https://example.com").request;
    expect(generateCode(request, "javascript-undici").dependency).toBe(
      "npm install undici",
    );
    expect(generateCode(request, "python-aiohttp").dependency).toBe(
      "pip install aiohttp",
    );
    expect(generateCode(request, "go-resty").dependency).toBe(
      "go get resty.dev/v3",
    );
    expect(generateCode(request, "php-guzzle").dependency).toBe(
      "composer require guzzlehttp/guzzle",
    );
    expect(generateCode(request, "rust-ureq").dependency).toBe('ureq = "3.3"');
  });
});
