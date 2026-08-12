import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseCurl } from "@curltocode/core";
import { describe, expect, it } from "vitest";

import { generateCode } from "../src/index.js";
import type { GeneratorId } from "../src/index.js";

/** Targets added beyond the original JavaScript/TypeScript/Python set. */
const ids = [
  "go-nethttp",
  "php-curl",
  "java-httpclient",
  "java-okhttp",
  "csharp-httpclient",
  "ruby-nethttp",
  "rust-reqwest",
] as const satisfies readonly GeneratorId[];

const generate = (curl: string, id: GeneratorId): string =>
  generateCode(parseCurl(curl).request, id).code;

/** Skip an external syntax check when the toolchain is not installed. */
function toolchain(command: string, args: readonly string[]): boolean {
  return spawnSync(command, args, { encoding: "utf8" }).error === undefined;
}

describe("additional language generators", () => {
  it.each(ids)("%s is deterministic and preserves the full URL", (id) => {
    const curl = "curl 'https://api.example.com/users?tag=a&tag=b&name=Ada'";
    expect(generate(curl, id)).toBe(generate(curl, id));
    expect(generate(curl, id)).toContain(
      "https://api.example.com/users?tag=a&tag=b&name=Ada",
    );
  });

  it.each(ids)(
    "%s preserves method, headers, JSON, auth, cookies, and Unicode",
    (id) => {
      const code = generate(
        `curl 'https://api.example.com/users' -X POST -H 'Content-Type: application/json' -H 'X-Quote: O'\\''Reilly' -u 'ada:sëcret' -b 'session=abc' --data-raw '{"name":"こんにちは"}'`,
        id,
      );
      // Ruby names the method through Net::HTTP::Post, so match case-insensitively.
      expect(code.toLowerCase()).toContain("post");
      expect(code).toContain("application/json");
      // Non-BMP and non-ASCII text is emitted literally rather than as escapes.
      expect(code).toContain("こんにちは");
      expect(code).toContain("O'Reilly");
      // Go models cookies as http.Cookie values; the rest send a Cookie header.
      expect(code).toMatch(/session=abc|"session".*"abc"/u);
      // Clients without a native basic-auth call receive a precomputed
      // Authorization header, so the username appears only in base64 there.
      expect(code).toMatch(/ada|Authorization[^\n]*Basic/u);
    },
  );

  it.each(ids.filter((id) => id !== "ruby-nethttp"))(
    "%s makes both redirect states explicit",
    (id) => {
      const followed = generate("curl -L https://example.com", id);
      const notFollowed = generate("curl https://example.com", id);
      expect(followed).not.toBe(notFollowed);
    },
  );

  it("Net::HTTP rejects curl -L instead of silently omitting redirects", () => {
    expect(() =>
      generate("curl -L https://example.com", "ruby-nethttp"),
    ).toThrowError(/does not follow redirects automatically/u);
  });

  it("reports current install guidance for external clients", () => {
    expect(
      generateCode(parseCurl("curl https://example.com").request, "java-okhttp")
        .dependency,
    ).toContain("okhttp:5.3.2");
    expect(
      generateCode(
        parseCurl("curl https://example.com").request,
        "rust-reqwest",
      ).dependency,
    ).toContain('reqwest = "0.13"');
  });

  it.each(ids)("%s preserves duplicate header names", (id) => {
    // Unlike the browser and Python clients, each of these APIs appends
    // headers, so repeated names survive rather than being rejected.
    const code = generate(
      "curl https://example.com -H 'X-Test: a' -H 'X-Test: b'",
      id,
    );
    expect(code.match(/X-Test/gu)?.length).toBeGreaterThanOrEqual(2);
    // PHP emits "X-Test: a" while the others emit ("X-Test", "a"), so match the
    // value on the same line as its name rather than a fixed literal form.
    expect(code).toMatch(/X-Test[^\n]*\ba\b/u);
    expect(code).toMatch(/X-Test[^\n]*\bb\b/u);
  });

  it.each(ids)("%s emits a form-urlencoded body", (id) => {
    const code = generate("curl https://example.com -d 'tag=a' -d 'tag=b'", id);
    expect(code).toContain("tag=a&tag=b");
    expect(code).toContain("application/x-www-form-urlencoded");
  });

  it("java.net.http reports its missing multipart support instead of guessing", () => {
    expect(() =>
      generate("curl https://example.com -F note=hi", "java-httpclient"),
    ).toThrowError(/no multipart body publisher/u);
  });

  it("java.net.http reports restricted headers it cannot set", () => {
    expect(() =>
      generate(
        "curl https://example.com -H 'Host: other.example'",
        "java-httpclient",
      ),
    ).toThrowError(/does not allow the Host request header/u);
  });

  it("Net::HTTP reports methods it has no request class for", () => {
    expect(() =>
      generate("curl -X PURGE https://example.com", "ruby-nethttp"),
    ).toThrowError(/no built-in request class/u);
  });

  it("multipart file parts keep their media type and posted filename", () => {
    const curl =
      "curl https://example.com -F 'note=hi' -F 'file=@/tmp/a.png;type=image/png'";
    expect(generate(curl, "go-nethttp")).toContain('"image/png"');
    expect(generate(curl, "php-curl")).toContain(
      'new CURLFile("/tmp/a.png", "image/png", "a.png")',
    );
    expect(generate(curl, "ruby-nethttp")).toContain(
      'content_type: "image/png"',
    );
    expect(generate(curl, "rust-reqwest")).toContain('mime_str("image/png")');
    expect(generate(curl, "csharp-httpclient")).toContain(
      'MediaTypeHeaderValue.Parse("image/png")',
    );
  });

  it("Go gives each multipart file part distinct identifiers", () => {
    const code = generate(
      "curl https://example.com -F 'a=@/tmp/a.png' -F 'b=@/tmp/b.png'",
      "go-nethttp",
    );
    // Reusing one name would make the second `:=` declare no new variable.
    expect(code).toContain("file1, err := os.Open");
    expect(code).toContain("file2, err := os.Open");
  });

  it(".NET puts content headers on the content, not the request message", () => {
    const code = generate(
      `curl https://example.com -X POST -H 'Content-Type: application/json' -H 'X-Trace: 1' --data-raw '{}'`,
      "csharp-httpclient",
    );
    // HttpRequestMessage.Headers throws for Content-Type.
    expect(code).toContain(
      'request.Content.Headers.TryAddWithoutValidation("Content-Type"',
    );
    expect(code).toContain('request.Headers.TryAddWithoutValidation("X-Trace"');
    expect(code).not.toContain(
      'request.Headers.TryAddWithoutValidation("Content-Type"',
    );
  });

  it(".NET rejects content headers when no body exists", () => {
    expect(() =>
      generate(
        "curl https://example.com -H 'Content-Type: application/json'",
        "csharp-httpclient",
      ),
    ).toThrowError(
      /cannot attach the Content-Type header without an HTTP content object/u,
    );
  });
});

const HOSTILE = `curl 'https://example.com/😀?line=one%0Atwo' -X POST -H 'Content-Type: application/json' -H 'X-Value: quote" and slash\\' -u 'ada:s#{ecret}' --data-raw '{"message":"line\\n😀","path":"C:\\\\tmp","dollar":"$var"}'`;

describe("generated source is syntactically valid", () => {
  it.runIf(toolchain("ruby", ["-e", "1"]))(
    "ruby-nethttp parses under ruby -c",
    () => {
      const file = join(mkdtempSync(join(tmpdir(), "ctc-")), "main.rb");
      writeFileSync(file, generate(HOSTILE, "ruby-nethttp"));
      const result = spawnSync("ruby", ["-c", file], { encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
    },
  );

  it.runIf(toolchain("javac", ["-version"]))(
    "java-httpclient compiles under javac",
    () => {
      const directory = mkdtempSync(join(tmpdir(), "ctc-"));
      writeFileSync(
        join(directory, "Main.java"),
        generate(HOSTILE, "java-httpclient"),
      );
      const result = spawnSync(
        "javac",
        ["-d", directory, join(directory, "Main.java")],
        { encoding: "utf8" },
      );
      expect(result.status, result.stderr).toBe(0);
    },
  );

  it.runIf(toolchain("php", ["-v"]))("php-curl parses under php -l", () => {
    const file = join(mkdtempSync(join(tmpdir(), "ctc-")), "main.php");
    writeFileSync(file, generate(HOSTILE, "php-curl"));
    const result = spawnSync("php", ["-l", file], { encoding: "utf8" });
    expect(result.status, result.stdout).toBe(0);
  });

  it.runIf(toolchain("gofmt", ["-h"]))("go-nethttp parses under gofmt", () => {
    const file = join(mkdtempSync(join(tmpdir(), "ctc-")), "main.go");
    writeFileSync(file, generate(HOSTILE, "go-nethttp"));
    const result = spawnSync("gofmt", ["-e", file], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  it.runIf(toolchain("rustfmt", ["--version"]))(
    "rust-reqwest parses under rustfmt",
    () => {
      const file = join(mkdtempSync(join(tmpdir(), "ctc-")), "main.rs");
      writeFileSync(file, generate(HOSTILE, "rust-reqwest"));
      const result = spawnSync(
        "rustfmt",
        ["--edition", "2021", "--check", file],
        {
          encoding: "utf8",
        },
      );
      // rustfmt exits 1 for valid but non-formatted source, so syntax failures
      // are identified from diagnostics rather than formatting status.
      expect(result.stderr).not.toMatch(/error:/u);
    },
  );
});
