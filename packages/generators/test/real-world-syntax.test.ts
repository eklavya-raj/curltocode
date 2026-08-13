import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parse as parseJavaScript } from "@babel/parser";
import { parseCurl } from "@curltocode/core";
import { describe, expect, it } from "vitest";

import { generateCode } from "../src/index.js";
import type { GeneratorId } from "../src/index.js";
import { REAL_WORLD_REQUESTS } from "./real-world-fixtures.js";

const generated = (id: GeneratorId): string =>
  generateCode(parseCurl(REAL_WORLD_REQUESTS.accountPatch).request, id).code;

function hasTool(command: string, args: readonly string[]): boolean {
  return spawnSync(command, args, { encoding: "utf8" }).error === undefined;
}

const javascriptTargets = [
  "javascript-fetch",
  "javascript-axios",
  "javascript-undici",
  "typescript-fetch",
  "typescript-axios",
  "typescript-undici",
] as const satisfies readonly GeneratorId[];

describe("real-world generated source syntax", () => {
  it.each(javascriptTargets)("%s parses as JavaScript/TypeScript", (id) => {
    expect(() =>
      parseJavaScript(generated(id), {
        sourceType: "module",
        plugins: id.startsWith("typescript-") ? ["typescript"] : [],
      }),
    ).not.toThrow();
  });

  it.each(["python-requests", "python-httpx", "python-aiohttp"] as const)(
    "%s parses with Python ast",
    (id) => {
      const parsed = spawnSync(
        "python3",
        ["-c", "import ast, sys; ast.parse(sys.stdin.read())"],
        { input: generated(id), encoding: "utf8" },
      );
      expect(parsed.status, parsed.stderr).toBe(0);
    },
  );

  it.each(["ruby-nethttp", "ruby-faraday"] as const)(
    "%s parses with ruby -c",
    (id) => {
      const path = join(mkdtempSync(join(tmpdir(), "ctc-ruby-")), "main.rb");
      writeFileSync(path, generated(id));
      const parsed = spawnSync("ruby", ["-c", path], { encoding: "utf8" });
      expect(parsed.status, parsed.stderr).toBe(0);
    },
  );

  it.runIf(hasTool("php", ["-v"])).each(["php-curl", "php-guzzle"] as const)(
    "%s parses with php -l",
    (id) => {
      const path = join(mkdtempSync(join(tmpdir(), "ctc-php-")), "main.php");
      writeFileSync(path, generated(id));
      const parsed = spawnSync("php", ["-l", path], { encoding: "utf8" });
      expect(parsed.status, parsed.stdout).toBe(0);
    },
  );

  it.runIf(hasTool("gofmt", ["-h"])).each(["go-nethttp", "go-resty"] as const)(
    "%s parses with gofmt",
    (id) => {
      const path = join(mkdtempSync(join(tmpdir(), "ctc-go-")), "main.go");
      writeFileSync(path, generated(id));
      const parsed = spawnSync("gofmt", ["-e", path], { encoding: "utf8" });
      expect(parsed.status, parsed.stderr).toBe(0);
    },
  );

  it.each(["rust-reqwest", "rust-ureq"] as const)(
    "%s has no rustfmt syntax diagnostics",
    (id) => {
      const path = join(mkdtempSync(join(tmpdir(), "ctc-rust-")), "main.rs");
      writeFileSync(path, generated(id));
      const parsed = spawnSync(
        "rustfmt",
        ["--edition", "2021", "--check", path],
        { encoding: "utf8" },
      );
      expect(parsed.stderr).not.toMatch(/error:/u);
    },
  );

  it("java-httpclient compiles with the JDK", () => {
    const directory = mkdtempSync(join(tmpdir(), "ctc-java-"));
    const path = join(directory, "Main.java");
    writeFileSync(path, generated("java-httpclient"));
    const compiled = spawnSync("javac", ["-d", directory, path], {
      encoding: "utf8",
    });
    expect(compiled.status, compiled.stderr).toBe(0);
  });
});
