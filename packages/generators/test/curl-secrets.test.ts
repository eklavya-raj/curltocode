import { parseCurl } from "@curltocode/core";
import { describe, expect, it } from "vitest";

import { generateCurl } from "../src/curl.js";

const curl = (command: string, environment = true) =>
  generateCurl(parseCurl(command).request, {
    secrets: environment ? "environment" : "inline",
  });

describe("cURL secrets as environment variables", () => {
  it("keeps every value inline by default", () => {
    const generated = generateCurl(
      parseCurl(
        "curl https://api.example.com/v1/me -H 'Authorization: Bearer tok_live_123'",
      ).request,
    );
    expect(generated.code).toContain("tok_live_123");
    expect(generated.variables).toEqual([]);
  });

  it("lifts a bearer token out but keeps the scheme visible", () => {
    const generated = curl(
      "curl https://api.example.com/v1/me -H 'Authorization: Bearer tok_live_123'",
    );
    // A bearer Authorization header is normalized into the request's auth
    // field, so the variable is named for what it is rather than for the header.
    expect(generated.code).toContain('"Authorization: Bearer $BEARER_TOKEN"');
    expect(generated.code).not.toContain("tok_live_123");
    expect(generated.variables).toEqual([
      { name: "BEARER_TOKEN", value: "tok_live_123" },
    ]);
  });

  it("uses double quotes so the shell actually expands the variable", () => {
    const generated = curl(
      "curl https://api.example.com/v1/me -H 'X-Api-Key: secret-key'",
    );
    // A single-quoted argument would send the dollar sign literally.
    expect(generated.code).toContain('-H "X-Api-Key: $X_API_KEY"');
  });

  it("lifts the password out of basic auth and leaves the user readable", () => {
    const generated = curl(
      "curl https://api.example.com/v1/me -u 'service-user:p@ss:word'",
    );
    expect(generated.code).toContain('-u "service-user:$BASIC_AUTH_PASSWORD"');
    expect(generated.variables).toEqual([
      { name: "BASIC_AUTH_PASSWORD", value: "p@ss:word" },
    ]);
  });

  it("lifts a cookie header, which is where a session usually lives", () => {
    const generated = curl(
      "curl https://api.example.com/v1/me -b 'session=sess_abc; locale=en-IN'",
    );
    expect(generated.code).toContain('-b "$COOKIE"');
    expect(generated.variables).toEqual([
      { name: "COOKIE", value: "session=sess_abc; locale=en-IN" },
    ]);
  });

  it("leaves a header that is not a credential alone", () => {
    const generated = curl(
      "curl https://api.example.com/v1/me -H 'X-Request-ID: req-42'",
    );
    expect(generated.code).toContain("'X-Request-ID: req-42'");
    expect(generated.variables).toEqual([]);
  });

  it("gives two credentials of the same name distinct variables", () => {
    const generated = curl(
      "curl https://api.example.com/v1/me -H 'X-Api-Key: first' -H 'X-Api-Key: second'",
    );
    expect(generated.variables.map(({ name }) => name)).toEqual([
      "X_API_KEY",
      "X_API_KEY_2",
    ]);
    expect(generated.code).toContain("$X_API_KEY_2");
  });

  it("escapes a value that would otherwise be read by the shell", () => {
    const generated = curl(
      `curl https://api.example.com/v1/me -H 'X-Api-Key: a"b'`,
    );
    // The literal half of the argument is now inside double quotes, where a
    // quote character has to be escaped rather than left as it was.
    expect(generated.code).toContain("$X_API_KEY");
    expect(generated.variables).toEqual([{ name: "X_API_KEY", value: 'a"b' }]);
  });

  it("does not change the body or the URL", () => {
    const generated = curl(
      `curl https://api.example.com/v1/me -H 'Authorization: Bearer tok' --data-raw '{"secret":"stays"}'`,
    );
    expect(generated.code).toContain('{"secret":"stays"}');
    expect(generated.code).toContain("https://api.example.com/v1/me");
  });
});
