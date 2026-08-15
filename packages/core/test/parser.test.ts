import { describe, expect, it } from "vitest";

import { parseCurl } from "../src/index.js";

const request = (input: string) => parseCurl(input).request;

describe("parseCurl", () => {
  it("parses a simple GET and duplicate query parameters", () => {
    const parsed = request(
      "curl 'https://api.example.com/users?tag=a&tag=b&page=1'",
    );
    expect(parsed).toMatchObject({
      method: "GET",
      url: "https://api.example.com/users",
    });
    expect(parsed.query).toEqual([
      { name: "tag", value: "a" },
      { name: "tag", value: "b" },
      { name: "page", value: "1" },
    ]);
  });

  it.each(["PUT", "PATCH", "DELETE", "PURGE"])(
    "supports the explicit %s method",
    (method) => {
      expect(request(`curl -X ${method} https://example.com`).method).toBe(
        method,
      );
    },
  );

  it.each(["PUT", "PATCH"])("parses an explicit %s JSON body", (method) => {
    expect(
      request(
        `curl -X ${method} https://example.com -H 'Content-Type: application/json' --data-raw '{"active":true}'`,
      ),
    ).toMatchObject({
      method,
      body: { kind: "json", value: { active: true } },
    });
  });

  it("infers POST from data but respects an explicit method", () => {
    expect(request("curl https://example.com -d name=Ada").method).toBe("POST");
    expect(
      request("curl -X PATCH https://example.com -d name=Ada").method,
    ).toBe("PATCH");
  });

  it("supports attached short values, inline long values, and option ordering", () => {
    const parsed = request(
      "curl -L -XPATCH -HAccept:application/json --header=X-Trace:one -btheme=dark --user=ada:secret --data-raw=name=Ada --url=https://example.com/items",
    );
    expect(parsed).toMatchObject({
      method: "PATCH",
      url: "https://example.com/items",
      headers: [
        { name: "Accept", value: "application/json" },
        { name: "X-Trace", value: "one" },
      ],
      cookies: [{ name: "theme", value: "dark" }],
      auth: { kind: "basic", username: "ada", password: "secret" },
      options: { followRedirects: true },
      body: { kind: "form-urlencoded", raw: "name=Ada" },
    });
  });

  it("parses valid JSON independently of formatting", () => {
    const parsed = request(
      'curl https://example.com -H \'Content-Type: application/json\' --data-raw \'{"name":"Eklavya","active":true}\'',
    );
    expect(parsed.body).toEqual({
      kind: "json",
      value: { name: "Eklavya", active: true },
      raw: '{"name":"Eklavya","active":true}',
    });
  });

  it("preserves plain text and empty bodies", () => {
    expect(
      request(
        "curl https://example.com -H 'Content-Type: text/plain' --data-raw hello",
      ).body,
    ).toEqual({
      kind: "text",
      value: "hello",
      contentType: "text/plain",
    });
    expect(request("curl https://example.com --data-raw ''").body).toEqual({
      kind: "form-urlencoded",
      fields: [],
      raw: "",
    });
  });

  it("parses form-urlencoded data and data-urlencode", () => {
    expect(
      request("curl https://example.com -d 'name=Ada' -d 'role=admin'").body,
    ).toEqual({
      kind: "form-urlencoded",
      raw: "name=Ada&role=admin",
      fields: [
        { name: "name", value: "Ada" },
        { name: "role", value: "admin" },
      ],
    });
    expect(
      request("curl https://example.com --data-urlencode 'q=a b'").body,
    ).toEqual({
      kind: "form-urlencoded",
      raw: "q=a%20b",
      fields: [{ name: "q", value: "a b" }],
    });
  });

  it("preserves every non-file --data-urlencode input form", () => {
    expect(
      request("curl https://example.com --data-urlencode 'a b'").body,
    ).toEqual({
      kind: "form-urlencoded",
      raw: "a%20b",
      fields: [],
    });
    expect(
      request("curl https://example.com --data-urlencode '=a b'").body,
    ).toEqual({
      kind: "form-urlencoded",
      raw: "a%20b",
      fields: [],
    });
  });

  it("keeps ordered duplicate headers", () => {
    expect(
      request("curl https://example.com -H 'X-Trace: one' -H 'x-trace: two'")
        .headers,
    ).toEqual([
      { name: "X-Trace", value: "one" },
      { name: "x-trace", value: "two" },
    ]);
  });

  it("normalizes bearer auth into the typed auth field", () => {
    const parsed = request(
      "curl https://example.com -H 'Authorization: Bearer secret-token'",
    );
    expect(parsed.auth).toEqual({ kind: "bearer", token: "secret-token" });
    expect(parsed.headers).not.toContainEqual({
      name: "Authorization",
      value: "Bearer secret-token",
    });
  });

  it("normalizes Cookie headers into ordered cookie fields", () => {
    const parsed = request(
      "curl https://example.com -H 'Cookie: one=1; two=2'",
    );
    expect(parsed.cookies).toEqual([
      { name: "one", value: "1" },
      { name: "two", value: "2" },
    ]);
    expect(parsed.headers).toEqual([]);
  });

  it("parses basic authentication including colons in the password", () => {
    expect(request("curl -u 'ada:p:a:ss' https://example.com").auth).toEqual({
      kind: "basic",
      username: "ada",
      password: "p:a:ss",
    });
    expect(request("curl -u ':secret' https://example.com").auth).toEqual({
      kind: "basic",
      username: "",
      password: "secret",
    });
  });

  it("normalizes URL credentials and rejects conflicting authentication", () => {
    const parsed = request("curl 'https://ada:s%40cret@example.com/private'");
    expect(parsed).toMatchObject({
      url: "https://example.com/private",
      auth: { kind: "basic", username: "ada", password: "s@cret" },
    });
    expect(parsed.url).not.toContain("ada");
    expect(() =>
      request(
        "curl -u 'other:secret' 'https://ada:secret@example.com/private'",
      ),
    ).toThrowError(/conflicting URL and --user credentials/u);
    expect(() =>
      request(
        "curl -u 'ada:secret' -H 'Authorization: Bearer token' https://example.com",
      ),
    ).toThrowError(/combines basic credentials/u);
  });

  it("keeps duplicate Authorization headers explicit", () => {
    const parsed = request(
      "curl https://example.com -H 'Authorization: Bearer one' -H 'Authorization: Bearer two'",
    );
    expect(parsed.auth).toBeUndefined();
    expect(parsed.headers).toHaveLength(2);
  });

  it("parses multiple cookies", () => {
    expect(
      request("curl https://example.com -b 'session=abc; theme=dark'").cookies,
    ).toEqual([
      { name: "session", value: "abc" },
      { name: "theme", value: "dark" },
    ]);
  });

  it("rejects cookie-file syntax instead of treating a filename as a cookie", () => {
    expect(() =>
      request("curl https://example.com -b cookies.txt"),
    ).toThrowError(
      expect.objectContaining({
        code: "CURL_UNSUPPORTED_OPTION",
        option: "--cookie with a cookie file",
      }),
    );
    expect(() =>
      request("curl https://example.com -H 'Cookie: malformed'"),
    ).toThrowError(expect.objectContaining({ code: "CURL_INVALID_COOKIE" }));
    expect(() =>
      request("curl https://example.com -b 'valid=one; malformed'"),
    ).toThrowError(expect.objectContaining({ code: "CURL_INVALID_COOKIE" }));
  });

  it("parses multipart fields and file references", () => {
    expect(
      request(
        "curl https://example.com -F 'name=Eklavya' -F 'avatar=@./me.png;type=image/png;filename=profile.png'",
      ).body,
    ).toEqual({
      kind: "multipart",
      parts: [
        { kind: "field", name: "name", value: "Eklavya" },
        {
          kind: "file",
          name: "avatar",
          path: "./me.png",
          contentType: "image/png",
          filename: "profile.png",
        },
      ],
    });
  });

  it("parses binary file references", () => {
    expect(
      request("curl https://example.com --data-binary @payload.bin").body,
    ).toEqual({
      kind: "binary",
      source: { kind: "file", path: "payload.bin" },
      contentType: "application/x-www-form-urlencoded",
    });
  });

  it("keeps inline --data-binary distinct from text", () => {
    expect(
      request("curl https://example.com --data-binary 'line one\nline two'")
        .body,
    ).toEqual({
      kind: "binary",
      source: { kind: "inline", value: "line one\nline two" },
      contentType: "application/x-www-form-urlencoded",
    });
  });

  it("preserves the implicit form media type for data-raw and data-binary", () => {
    expect(request("curl https://example.com --data-raw hello").body).toEqual({
      kind: "form-urlencoded",
      fields: [{ name: "hello", value: "" }],
      raw: "hello",
    });
    expect(
      request("curl https://example.com --data-binary bytes").body,
    ).toEqual({
      kind: "binary",
      source: { kind: "inline", value: "bytes" },
      contentType: "application/x-www-form-urlencoded",
    });
  });

  it("rejects file-reading data forms that cannot be resolved statically", () => {
    expect(() =>
      request("curl https://example.com -d @payload.txt"),
    ).toThrowError(
      expect.objectContaining({ code: "CURL_UNSUPPORTED_OPTION" }),
    );
    expect(() =>
      request("curl https://example.com --data-urlencode query@payload.txt"),
    ).toThrowError(
      expect.objectContaining({ code: "CURL_UNSUPPORTED_OPTION" }),
    );
    expect(() =>
      request("curl https://example.com --data-binary @-"),
    ).toThrowError(
      expect.objectContaining({ code: "CURL_UNSUPPORTED_OPTION" }),
    );
  });

  it("handles multiline commands, escaped JSON, and Unicode", () => {
    const parsed = request(
      "curl 'https://example.com/こんにちは' \\\n  -H 'Content-Type: application/json' \\\n  --data-raw '{\"message\":\"नमस्ते \\\"world\\\"\"}'",
    );
    expect(parsed.url).toContain("%E3%81%93");
    expect(parsed.body).toMatchObject({
      kind: "json",
      value: { message: 'नमस्ते "world"' },
    });
  });

  it("tracks redirect behavior", () => {
    expect(request("curl -L https://example.com").options.followRedirects).toBe(
      true,
    );
  });

  it("returns controlled errors for invalid input", () => {
    expect(() => parseCurl(" ")).toThrowError(
      expect.objectContaining({ code: "CURL_EMPTY_INPUT" }),
    );
    expect(() => parseCurl("wget https://example.com")).toThrowError(
      expect.objectContaining({ code: "CURL_INVALID_COMMAND" }),
    );
    expect(() => parseCurl("curl -H 'Accept: text/plain'")).toThrowError(
      expect.objectContaining({ code: "CURL_MISSING_URL" }),
    );
    expect(() => parseCurl("curl --netrc https://example.com")).toThrowError(
      expect.objectContaining({
        code: "CURL_UNSUPPORTED_OPTION",
        option: "--netrc",
      }),
    );
    expect(() => parseCurl("curl -H Accept https://example.com")).toThrowError(
      expect.objectContaining({ code: "CURL_INVALID_HEADER" }),
    );
    expect(() => parseCurl("curl 'https://example.com")).toThrowError(
      expect.objectContaining({ code: "CURL_UNCLOSED_QUOTE" }),
    );
    expect(() => parseCurl("curl https://example.com -H")).toThrowError(
      expect.objectContaining({ code: "CURL_MISSING_OPTION_VALUE" }),
    );
    expect(() =>
      parseCurl("curl https://example.com -H 'Bad Header: value'"),
    ).toThrowError(expect.objectContaining({ code: "CURL_INVALID_HEADER" }));
    expect(() =>
      parseCurl("curl https://example.com -F 'file=@payload;unknown=value'"),
    ).toThrowError(
      expect.objectContaining({ code: "CURL_UNSUPPORTED_OPTION" }),
    );
    expect(() =>
      parseCurl("curl https://one.example https://two.example"),
    ).toThrowError(expect.objectContaining({ code: "CURL_MULTIPLE_URLS" }));
  });

  it("warns when an invalid JSON body is preserved as text", () => {
    const parsed = parseCurl(
      "curl https://example.com -H 'Content-Type: application/json' -d '{bad}'",
    );
    expect(parsed.request.body).toMatchObject({ kind: "text", value: "{bad}" });
    expect(parsed.warnings).toContainEqual(
      expect.objectContaining({ code: "JSON_CONTENT_TYPE_INVALID" }),
    );
  });

  it("requires explicit non-interactive basic credentials", () => {
    expect(() => request("curl -u ada https://example.com")).toThrowError(
      expect.objectContaining({ code: "CURL_INVALID_AUTH" }),
    );
    expect(request("curl -u 'ada:' https://example.com").auth).toEqual({
      kind: "basic",
      username: "ada",
      password: "",
    });
  });

  it("accepts the transfer options browsers and shells emit", () => {
    // Every browser's "Copy as cURL" appends --compressed, so rejecting it made
    // the most common way of obtaining a cURL command unusable.
    const parsed = parseCurl(
      "curl 'https://api.example.com/users' -H 'accept: application/json' --compressed",
    );
    expect(parsed.request.method).toBe("GET");
    expect(parsed.request.headers).toEqual([
      { name: "accept", value: "application/json" },
    ]);
    expect(parsed.warnings).toEqual([]);
  });

  it("ignores options that only change the local cURL process", () => {
    for (const command of [
      "curl -s https://example.com",
      "curl -sS https://example.com",
      "curl -fsSL https://example.com",
      "curl -o out.json https://example.com",
      "curl -so out.json https://example.com",
      "curl --max-time 30 --retry 3 https://example.com",
      "curl --write-out '%{http_code}' https://example.com",
    ]) {
      const parsed = parseCurl(command);
      expect(parsed.request.url).toBe("https://example.com/");
      expect(parsed.warnings).toEqual([]);
    }
    // -fsSL includes -L, which is a real request-level option.
    expect(
      request("curl -fsSL https://example.com").options.followRedirects,
    ).toBe(true);
  });

  it("warns instead of silently dropping transport-level options", () => {
    const parsed = parseCurl(
      "curl -k --http2 -x http://proxy:8080 https://example.com",
    );
    expect(parsed.request.url).toBe("https://example.com/");
    expect(parsed.warnings.map((warning) => warning.code)).toEqual([
      "TRANSPORT_OPTION_IGNORED",
      "TRANSPORT_OPTION_IGNORED",
      "TRANSPORT_OPTION_IGNORED",
    ]);
    expect(parsed.warnings[0]?.message).toContain("-k");
  });

  it("maps -A and -e onto their request headers", () => {
    const parsed = request(
      "curl -A 'Mozilla/5.0' -e 'https://ref.example.com;auto' https://example.com",
    );
    expect(parsed.headers).toEqual([
      { name: "User-Agent", value: "Mozilla/5.0" },
      { name: "Referer", value: "https://ref.example.com" },
    ]);
  });

  it("treats -I as a HEAD request", () => {
    expect(request("curl -I https://example.com").method).toBe("HEAD");
  });

  it("expands --json into a body and both JSON headers", () => {
    const parsed = request(`curl --json '{"a":1}' https://example.com`);
    expect(parsed.method).toBe("POST");
    expect(parsed.headers).toEqual([
      { name: "Content-Type", value: "application/json" },
      { name: "Accept", value: "application/json" },
    ]);
    expect(parsed.body).toMatchObject({ kind: "json", raw: '{"a":1}' });
  });

  it("moves -G data into the query string instead of the body", () => {
    const parsed = request(
      "curl -G -d 'tag=a' -d 'tag=b' --data-urlencode 'q=x y' https://example.com/search",
    );
    expect(parsed.method).toBe("GET");
    expect(parsed.body).toBeUndefined();
    expect(parsed.query).toEqual([
      { name: "tag", value: "a" },
      { name: "tag", value: "b" },
      { name: "q", value: "x y" },
    ]);
  });

  it("appends --url-query without disturbing the body", () => {
    const parsed = request(
      "curl --url-query 'q=x y' -d 'a=1' https://example.com/search",
    );
    expect(parsed.query).toEqual([{ name: "q", value: "x y" }]);
    expect(parsed.body).toMatchObject({ kind: "form-urlencoded", raw: "a=1" });
  });

  it("treats -T as a PUT upload", () => {
    const parsed = request("curl -T report.csv https://example.com/files");
    expect(parsed.method).toBe("PUT");
    expect(parsed.body).toMatchObject({
      kind: "binary",
      source: { kind: "file", path: "report.csv" },
    });
  });

  it("keeps a horizontal tab inside a header value", () => {
    // RFC 9110 permits HTAB in a field value.
    expect(
      request("curl -H 'X-Trace: a\tb' https://example.com").headers,
    ).toEqual([{ name: "X-Trace", value: "a\tb" }]);
  });

  it("still rejects options that would change the request meaningfully", () => {
    for (const option of ["--netrc", "--digest", "--ftp-pasv"]) {
      expect(() =>
        parseCurl(`curl ${option} https://example.com`),
      ).toThrowError(
        expect.objectContaining({ code: "CURL_UNSUPPORTED_OPTION" }),
      );
    }
  });

  it("does not crash unexpectedly for arbitrary token combinations", () => {
    const samples = [
      "",
      "'",
      "\\",
      "curl",
      "curl --x",
      "curl 😀",
      "curl -d",
      "curl http://[bad",
    ];
    for (const sample of samples) {
      try {
        parseCurl(sample);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    }
  });
});
