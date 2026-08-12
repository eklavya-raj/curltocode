import { spawnSync } from "node:child_process";

import { parse as parseJavaScript } from "@babel/parser";
import { parseCurl } from "@curltocode/core";
import { describe, expect, it } from "vitest";

import {
  generateCode,
  GeneratorError,
  generatorRegistry,
} from "../src/index.js";
import type { GeneratorId } from "../src/index.js";

const ids: readonly GeneratorId[] = [
  "javascript-fetch",
  "javascript-axios",
  "typescript-fetch",
  "typescript-axios",
  "python-requests",
  "python-httpx",
];

const generate = (curl: string, id: GeneratorId): string =>
  generateCode(parseCurl(curl).request, id).code;

describe("generator registry", () => {
  it("registers every supported target exactly once", () => {
    const keys = [...generatorRegistry.keys()];
    expect(keys).toEqual([
      "javascript-fetch",
      "javascript-axios",
      "typescript-fetch",
      "typescript-axios",
      "python-requests",
      "python-httpx",
      "go-nethttp",
      "php-curl",
      "java-httpclient",
      "java-okhttp",
      "csharp-httpclient",
      "ruby-nethttp",
      "rust-reqwest",
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(ids)(
    "%s generates a deterministic GET with query parameters",
    (id) => {
      const curl =
        "curl -L 'https://api.example.com/users?tag=a&tag=b&name=Eklavya'";
      expect(generate(curl, id)).toBe(generate(curl, id));
      expect(generate(curl, id)).toContain(
        "https://api.example.com/users?tag=a&tag=b&name=Eklavya",
      );
    },
  );

  it.each(ids)(
    "%s preserves method, headers, JSON, auth, cookies, escaping, and Unicode",
    (id) => {
      const code = generate(
        `curl -L 'https://api.example.com/users' -X POST -H 'Content-Type: application/json' -H 'X-Quote: O'\\''Reilly' -u 'ada:sëcret' -b 'session=abc' --data-raw '{"name":"こんにちは"}'`,
        id,
      );
      expect(code.toLowerCase()).toContain("post");
      expect(code).toContain("Content-Type");
      expect(code).toContain("application/json");
      expect(code).toContain("こんにちは");
      expect(code).toContain("session");
      expect(code).toMatch(/Authorization|auth[=:]/u);
      expect(code).toContain("O'Reilly");
    },
  );

  it.each(ids)("%s handles form-urlencoded bodies", (id) => {
    const code = generate(
      "curl -L https://example.com -d 'tag=a' -d 'tag=b'",
      id,
    );
    expect(code).toContain("tag");
    expect(code).toContain("a");
    expect(code).toContain("b");
  });

  it.each(ids)("%s preserves non-canonical JSON body bytes", (id) => {
    const code = generate(
      `curl https://example.com -H 'Content-Type: application/json' --data-raw '{ "message" : "😀", "count" : 1 }'`,
      id,
    );
    expect(code).toContain('{ \\"message\\" : \\"😀\\", \\"count\\" : 1 }');
  });

  it("JavaScript clients reject duplicate headers instead of relying on merging containers", () => {
    expect(() =>
      generate(
        "curl -L https://example.com -H 'X-Test: a' -H 'X-Test: b'",
        "javascript-fetch",
      ),
    ).toThrowError(/cannot reliably preserve duplicate request header names/u);
    expect(() =>
      generate(
        "curl -L https://example.com -H 'X-Test: a' -H 'X-Test: b'",
        "javascript-axios",
      ),
    ).toThrowError(/cannot reliably preserve duplicate request header names/u);
  });

  it("Axios uses its native basic-auth configuration", () => {
    const code = generate(
      "curl -u 'ada:secret' https://example.com",
      "typescript-axios",
    );
    expect(code).toContain('auth: { username: "ada", password: "secret" }');
    expect(code).not.toContain("Authorization");
  });

  it("Python rejects duplicate header names instead of silently changing semantics", () => {
    const request = parseCurl(
      "curl https://example.com -H 'X-Test: a' -H 'X-Test: b'",
    ).request;
    expect(() => generateCode(request, "python-requests")).toThrowError(
      GeneratorError,
    );
  });

  it("generates multipart fields for browser clients and fields/files for Python", () => {
    const fields = generate(
      "curl -L https://example.com -F name=Ada",
      "javascript-fetch",
    );
    expect(fields).toContain('formData.append("name", "Ada")');
    const python = generate(
      "curl -L https://example.com -F name=Ada -F avatar=@me.png",
      "python-httpx",
    );
    expect(python).toContain("files=[");
    expect(python).toContain('("name", (None, "Ada"))');
    expect(python).toContain('open("me.png", "rb")');
  });

  it.each(["python-requests", "python-httpx"] as const)(
    "%s keeps field-only -F requests multipart and ordered",
    (id) => {
      const code = generate(
        "curl https://example.com -F 'tag=a' -F 'tag=b'",
        id,
      );
      expect(code).toContain(
        'files=[("tag", (None, "a")), ("tag", (None, "b"))]',
      );
      expect(code).not.toContain("data=");
    },
  );

  it("rejects browser file references with an actionable limitation", () => {
    expect(() =>
      generate(
        "curl https://example.com -F avatar=@me.png",
        "javascript-fetch",
      ),
    ).toThrowError(/cannot safely resolve the local multipart file reference/u);
  });

  it("rejects Fetch GET bodies that the Fetch standard cannot represent", () => {
    expect(() =>
      generate(
        "curl -X GET https://example.com --data-raw name=Ada",
        "javascript-fetch",
      ),
    ).toThrowError(/Fetch does not permit a GET request body/u);
  });

  it.each(["python-requests", "python-httpx"] as const)(
    "%s makes both redirect states explicit",
    (id) => {
      expect(generate("curl https://example.com", id)).toMatch(
        /(?:allow|follow)_redirects=False/u,
      );
      expect(generate("curl -L https://example.com", id)).toMatch(
        /(?:allow|follow)_redirects=True/u,
      );
    },
  );

  it.each(ids)(
    "%s emits syntactically valid source for hostile string data",
    (id) => {
      const lineSeparator = String.fromCodePoint(0x2028);
      const code = generate(
        `curl 'https://example.com/😀?line=one%0Atwo' -X PATCH -H 'Content-Type: application/json' -H 'X-Value: quote" and slash\\' --data-raw '{"message":"line\\n😀${lineSeparator}separator","path":"C:\\\\tmp"}'`,
        id,
      );
      if (id.startsWith("python-")) {
        const parsed = spawnSync(
          "python3",
          ["-c", "import ast, sys; ast.parse(sys.stdin.read())"],
          { input: code, encoding: "utf8" },
        );
        expect(parsed.status, parsed.stderr).toBe(0);
      } else {
        expect(() =>
          parseJavaScript(code, {
            sourceType: "module",
            plugins: id.startsWith("typescript-") ? ["typescript"] : [],
          }),
        ).not.toThrow();
      }
    },
  );

  it.each(["python-requests", "python-httpx"] as const)(
    "%s rejects duplicate cookies rather than overwriting one",
    (id) => {
      expect(() =>
        generate(
          "curl https://example.com -b 'session=first; session=second'",
          id,
        ),
      ).toThrowError(/cannot represent duplicate cookie names/u);
    },
  );

  it.each(ids)("%s preserves cURL's implicit binary media type", (id) => {
    const code = generate("curl https://example.com --data-binary bytes", id);
    expect(code).toContain("application/x-www-form-urlencoded");
  });
});
