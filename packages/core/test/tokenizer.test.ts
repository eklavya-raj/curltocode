import { describe, expect, it } from "vitest";

import { CurlTokenizeError, tokenizeCurl } from "../src/index.js";

const values = (input: string): readonly string[] =>
  tokenizeCurl(input).map((token) => token.value);

describe("tokenizeCurl", () => {
  it("tokenizes unquoted and single-quoted values", () => {
    expect(
      values("curl 'https://example.com/a b' -H 'X-Test: one two'"),
    ).toEqual(["curl", "https://example.com/a b", "-H", "X-Test: one two"]);
  });

  it("handles double-quoted escapes without corrupting JSON", () => {
    expect(
      values('curl "https://example.com" -d "{\\"name\\":\\"Ada\\"}"'),
    ).toEqual(["curl", "https://example.com", "-d", '{"name":"Ada"}']);
  });

  it("preserves backslashes before non-special characters in double quotes", () => {
    expect(values('curl "https://example.com/a\\q" -d "C:\\temp"')).toEqual([
      "curl",
      "https://example.com/a\\q",
      "-d",
      "C:\\temp",
    ]);
  });

  it("preserves empty quoted arguments", () => {
    expect(values("curl https://example.com -d '' -H \"X-Empty:\"")).toEqual([
      "curl",
      "https://example.com",
      "-d",
      "",
      "-H",
      "X-Empty:",
    ]);
  });

  it("handles spaces escaped outside quotes", () => {
    expect(values("curl https://example.com/a\\ b")).toEqual([
      "curl",
      "https://example.com/a b",
    ]);
  });

  it("removes backslash line continuations", () => {
    expect(
      values("curl 'https://example.com' \\\n  -H 'Accept: application/json'"),
    ).toEqual([
      "curl",
      "https://example.com",
      "-H",
      "Accept: application/json",
    ]);
  });

  it("removes CRLF backslash continuations and tracks the next token", () => {
    const tokens = tokenizeCurl("curl https://example.com \\\r\n  -L");
    expect(tokens.map((token) => token.value)).toEqual([
      "curl",
      "https://example.com",
      "-L",
    ]);
    expect(tokens[2]).toMatchObject({ line: 2, column: 3 });
  });

  it("keeps option values that begin with a dash as independent tokens", () => {
    expect(values("curl https://example.com --data-raw -1")).toEqual([
      "curl",
      "https://example.com",
      "--data-raw",
      "-1",
    ]);
  });

  it("supports multiline whitespace and Unicode", () => {
    expect(
      values("curl\n'https://example.com/नमस्ते'\n-d 'こんにちは' "),
    ).toEqual(["curl", "https://example.com/नमस्ते", "-d", "こんにちは"]);
  });

  it("reports an unclosed quote with a typed location", () => {
    expect(() => values("curl 'https://example.com")).toThrowError(
      CurlTokenizeError,
    );
    try {
      values('curl "broken');
    } catch (error) {
      expect(error).toMatchObject({
        code: "CURL_UNCLOSED_QUOTE",
        line: 1,
        column: 6,
      });
    }
  });

  it("reports a dangling escape", () => {
    expect(() => values("curl https://example.com\\")).toThrowError(
      expect.objectContaining({ code: "CURL_DANGLING_ESCAPE" }),
    );
  });
});
