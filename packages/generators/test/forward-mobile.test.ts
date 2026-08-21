import { parseCurl } from "@curltocode/core";
import { describe, expect, it } from "vitest";

import { generateCode } from "../src/index.js";
import type { GeneratorId } from "../src/index.js";

const generate = (curl: string, id: GeneratorId): string =>
  generateCode(parseCurl(curl).request, id).code;

/** Targets added for the mobile and modern-language wave. */
const ids = [
  "kotlin-okhttp",
  "kotlin-ktor",
  "swift-urlsession",
  "swift-alamofire",
  "dart-http",
  "dart-dio",
  "objectivec-nsurlsession",
] as const satisfies readonly GeneratorId[];

/**
 * The escape each language needs for a value carrying both quote characters.
 * Only the delimiter the language actually uses has to be escaped, so the
 * expectation is per target rather than one shared pattern.
 */
const QUOTE_ESCAPE: Record<(typeof ids)[number], string> = {
  "kotlin-okhttp": '\\"hi\\"',
  "kotlin-ktor": '\\"hi\\"',
  "swift-urlsession": '\\"hi\\"',
  "swift-alamofire": '\\"hi\\"',
  "objectivec-nsurlsession": '\\"hi\\"',
  "dart-http": "it\\'s",
  "dart-dio": "it\\'s",
};

describe("mobile and modern language generators", () => {
  it.each(ids)("%s escapes its own string delimiter", (id) => {
    // An unescaped delimiter would close the literal early and leave the rest
    // of the header value sitting in the source as code.
    const code = generate(
      `curl https://example.com -H 'X-Quote: say "hi" it'\\''s'`,
      id,
    );
    expect(code).toContain(QUOTE_ESCAPE[id]);
  });

  it.each(ids)("%s emits non-ASCII text as characters, not escapes", (id) => {
    expect(
      generate(
        `curl https://example.com -X POST -H 'Content-Type: application/json' --data-raw '{"name":"こんにちは 👋"}'`,
        id,
      ),
    ).toContain("こんにちは 👋");
  });

  it.each(ids)("%s is deterministic", (id) => {
    const curl = "curl 'https://example.com/a?x=1&x=2' -H 'Accept: */*'";
    expect(generate(curl, id)).toBe(generate(curl, id));
  });
});

describe("Kotlin OkHttp", () => {
  it("escapes a dollar sign so it is not read as a string template", () => {
    const code = generate(
      "curl https://example.com -H 'X-Cost: $5 and ${total}'",
      "kotlin-okhttp",
    );
    expect(code).toContain("\\$5 and \\${total}");
  });

  it("sends an empty body for a verb OkHttp requires one for", () => {
    // cURL sends POST with no data as Content-Length: 0, and Request.Builder
    // rejects a null body for POST, so an empty body is the faithful mapping.
    expect(
      generate("curl -X POST https://example.com", "kotlin-okhttp"),
    ).toContain("ByteArray(0).toRequestBody()");
  });

  it("sets the media type on the body rather than as a second header", () => {
    const code = generate(
      `curl https://example.com -X POST -H 'Content-Type: application/json' --data-raw '{}'`,
      "kotlin-okhttp",
    );
    expect(code).toContain('"application/json".toMediaType()');
    expect(code).not.toContain('.addHeader("Content-Type"');
  });
});

describe("Ktor client", () => {
  it("keeps repeated header names, which HeadersBuilder appends", () => {
    const code = generate(
      "curl https://example.com -H 'X-A: one' -H 'X-A: two'",
      "kotlin-ktor",
    );
    expect(code).toContain('header("X-A", "one")');
    expect(code).toContain('header("X-A", "two")');
  });

  it("names any verb through the HttpMethod constructor", () => {
    expect(
      generate("curl -X PURGE https://example.com", "kotlin-ktor"),
    ).toContain('HttpMethod("PURGE")');
  });
});

describe("Swift URLSession", () => {
  it("declines redirects through a task delegate, not a flag", () => {
    const notFollowed = generate(
      "curl https://example.com",
      "swift-urlsession",
    );
    expect(notFollowed).toContain("URLSessionTaskDelegate");
    expect(notFollowed).toContain("completionHandler(nil)");
    // Following is the default, so the delegate must disappear entirely.
    expect(
      generate("curl -L https://example.com", "swift-urlsession"),
    ).not.toContain("URLSessionTaskDelegate");
  });

  it("writes a multipart body byte for byte with CRLF delimiters", () => {
    const code = generate(
      "curl https://example.com -F 'note=hi' -F 'doc=@/tmp/a.pdf;type=application/pdf'",
      "swift-urlsession",
    );
    expect(code).toContain('Content-Disposition: form-data; name=\\"note\\"');
    expect(code).toContain("Content-Type: application/pdf");
    expect(code).toContain("boundary=");
    expect(code).toContain('URL(fileURLWithPath: "/tmp/a.pdf")');
  });

  it("refuses repeated header names rather than comma-folding them", () => {
    expect(() =>
      generate(
        "curl https://example.com -H 'X-A: 1' -H 'X-A: 2'",
        "swift-urlsession",
      ),
    ).toThrowError(/comma-separated value/u);
  });
});

describe("Alamofire", () => {
  it("uploads a multipart body through the multipart form API", () => {
    const code = generate(
      "curl https://example.com -F 'doc=@/tmp/a.pdf;type=application/pdf'",
      "swift-alamofire",
    );
    expect(code).toContain("AF.upload(multipartFormData:");
    expect(code).toContain('mimeType: "application/pdf"');
  });

  it("attaches a raw body to a URLRequest rather than re-encoding it", () => {
    const code = generate(
      "curl https://example.com -d 'a=1' -d 'a=2'",
      "swift-alamofire",
    );
    // Alamofire's parameter encoders would rebuild the pairs and could change
    // the bytes; the original string has to survive exactly.
    expect(code).toContain('Data("a=1&a=2".utf8)');
  });

  it("names a non-standard verb through the HTTPMethod initializer", () => {
    expect(
      generate("curl -X PURGE https://example.com", "swift-alamofire"),
    ).toContain('HTTPMethod(rawValue: "PURGE")');
  });
});

describe("Dart clients", () => {
  it("escapes a dollar sign so it is not read as interpolation", () => {
    for (const id of ["dart-http", "dart-dio"] as const) {
      expect(
        generate("curl https://example.com -H 'X-Cost: $5'", id),
      ).toContain("\\$5");
    }
  });

  it("parses the whole media type instead of splitting on the slash", () => {
    // Splitting would discard parameters such as charset.
    expect(
      generate(
        "curl https://example.com -F 'doc=@/tmp/a.txt;type=text/plain'",
        "dart-http",
      ),
    ).toContain("MediaType.parse('text/plain')");
  });

  it("keeps Dio from throwing away a non-2xx response", () => {
    expect(generate("curl https://example.com", "dart-dio")).toContain(
      "validateStatus: (status) => true",
    );
  });
});

describe("Objective-C", () => {
  it("uses fixed-length octal escapes so they cannot absorb the next character", () => {
    const code = generate(
      "curl https://example.com -H 'X-Tab: a\tb'",
      "objectivec-nsurlsession",
    );
    // `\x09` followed by `b` would parse as one hex escape in C.
    expect(code).toContain("\\t");
    expect(code).not.toContain("\\x9b");
  });

  it("declines redirects through a session delegate", () => {
    expect(
      generate("curl https://example.com", "objectivec-nsurlsession"),
    ).toContain("willPerformHTTPRedirection");
    expect(
      generate("curl -L https://example.com", "objectivec-nsurlsession"),
    ).toContain("[NSURLSession sharedSession]");
  });
});
