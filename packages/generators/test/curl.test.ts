import { parseCurl } from "@curltocode/core";
import { describe, expect, it } from "vitest";

import { generateCurl, quoteShell } from "../src/index.js";

describe("generateCurl", () => {
  it("generates readable deterministic POSIX shell output", () => {
    const request = parseCurl(
      "curl -L https://api.example.com/users -X POST -H 'Content-Type: application/json' -b session=abc --data-raw '{\"name\":\"Eklavya\"}'",
    ).request;
    const output = generateCurl(request).code;
    expect(output).toContain("curl 'https://api.example.com/users'");
    expect(output).toContain("-X POST");
    expect(output).toContain("-L");
    expect(output).toContain("-H 'Content-Type: application/json'");
    expect(output).toContain("-b 'session=abc'");
    expect(output).toContain(`--data-raw '{"name":"Eklavya"}'`);
  });

  it("escapes POSIX single quotes without interpolation", () => {
    expect(quoteShell("O'Reilly $HOME")).toBe("'O'\"'\"'Reilly $HOME'");
  });

  it("rejects null bytes that POSIX argv cannot represent", () => {
    expect(() => quoteShell("before\0after")).toThrowError(
      /cannot contain a null byte/u,
    );
  });

  it("preserves multipart file metadata", () => {
    const request = parseCurl(
      "curl https://example.com -F 'avatar=@me.png;type=image/png;filename=profile.png'",
    ).request;
    expect(generateCurl(request).code).toContain(
      "avatar=@me.png;type=image/png;filename=profile.png",
    );
  });

  it("materializes media types required by normalized JSON and text bodies", () => {
    const json = parseCurl(
      "curl https://example.com -H 'Content-Type: application/json' --data-raw '{\"ok\":true}'",
    ).request;
    const withoutHeader = { ...json, headers: [] };
    expect(generateCurl(withoutHeader).code).toContain(
      "-H 'Content-Type: application/json'",
    );
  });
});
