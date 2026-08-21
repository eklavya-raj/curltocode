import { parseCurl } from "@curltocode/core";
import { describe, expect, it } from "vitest";

import { generateCode } from "../src/index.js";
import type { GeneratorId } from "../src/index.js";

const generate = (curl: string, id: GeneratorId): string =>
  generateCode(parseCurl(curl).request, id).code;

describe("Python http.client", () => {
  it("splits the URL into a connection host and a request target", () => {
    const code = generate(
      "curl 'https://api.example.com:8443/v1/a?x=1'",
      "python-httpclient",
    );
    expect(code).toContain(
      'http.client.HTTPSConnection("api.example.com", 8443)',
    );
    expect(code).toContain('connection.request("GET", "/v1/a?x=1")');
  });

  it("uses the plain connection class for an http URL", () => {
    expect(generate("curl http://example.com", "python-httpclient")).toContain(
      "http.client.HTTPConnection",
    );
  });

  it("reports that it cannot follow redirects", () => {
    expect(() =>
      generate("curl -L https://example.com", "python-httpclient"),
    ).toThrowError(/does not follow redirects/u);
  });
});

describe("urllib3", () => {
  it("keeps repeated header names through HTTPHeaderDict", () => {
    const code = generate(
      "curl https://example.com -H 'X-A: one' -H 'X-A: two'",
      "python-urllib3",
    );
    expect(code).toContain("urllib3.HTTPHeaderDict()");
    expect(code).toContain('headers.add("X-A", "one")');
    expect(code).toContain('headers.add("X-A", "two")');
  });

  it("uses a plain dict when no name repeats", () => {
    const code = generate(
      "curl https://example.com -H 'Accept: */*'",
      "python-urllib3",
    );
    expect(code).toContain("headers = {");
    expect(code).not.toContain("HTTPHeaderDict");
  });
});

describe("Java HttpURLConnection", () => {
  it("appends rather than replaces a repeated header", () => {
    const code = generate(
      "curl https://example.com -H 'X-A: one' -H 'X-A: two'",
      "java-httpurlconnection",
    );
    expect(code).toContain('addRequestProperty("X-A", "one")');
    expect(code).toContain('addRequestProperty("X-A", "two")');
  });

  it("reports the verbs setRequestMethod refuses, including PATCH", () => {
    for (const method of ["PATCH", "PURGE"]) {
      expect(() =>
        generate(
          `curl -X ${method} https://example.com`,
          "java-httpurlconnection",
        ),
      ).toThrowError(/setRequestMethod rejects/u);
    }
  });

  it("reads the error stream when the status is 4xx or 5xx", () => {
    // getInputStream throws on an error status, which would lose the body cURL
    // would have printed.
    expect(
      generate("curl https://example.com", "java-httpurlconnection"),
    ).toContain("getErrorStream()");
  });
});

describe("Ruby wrappers", () => {
  it("recovers the response rest-client raises on a non-2xx", () => {
    const code = generate("curl https://example.com", "ruby-restclient");
    expect(code).toContain("rescue RestClient::ExceptionWithResponse");
    expect(code).toContain("response = error.response");
  });

  it("reports that neither wrapper can set a multipart part's media type", () => {
    for (const id of ["ruby-httparty", "ruby-restclient"] as const) {
      expect(() =>
        generate(
          "curl https://example.com -F 'doc=@/tmp/a.pdf;type=application/pdf'",
          id,
        ),
      ).toThrowError(/Content-Type from the file on disk/u);
    }
  });

  it("still sends a multipart upload when no media type is declared", () => {
    expect(
      generate(
        "curl https://example.com -F 'doc=@/tmp/a.pdf'",
        "ruby-httparty",
      ),
    ).toContain('File.open("/tmp/a.pdf")');
  });

  it("reports that HTTParty has no method for a custom verb", () => {
    expect(() =>
      generate("curl -X PURGE https://example.com", "ruby-httparty"),
    ).toThrowError(/has none for PURGE/u);
  });
});

describe("PHP clients", () => {
  it("sends a repeated header once per array element", () => {
    for (const id of ["php-symfony", "php-laravel"] as const) {
      expect(
        generate("curl https://example.com -H 'X-A: one' -H 'X-A: two'", id),
      ).toContain('"X-A" => ["one", "two"]');
    }
  });

  it("stops Symfony throwing on a 4xx so the body is still printed", () => {
    expect(generate("curl https://example.com", "php-symfony")).toContain(
      "$response->getContent(false)",
    );
  });

  it("builds a Symfony multipart body through symfony/mime", () => {
    const code = generate(
      "curl https://example.com -F 'doc=@/tmp/a.pdf;type=application/pdf'",
      "php-symfony",
    );
    expect(code).toContain("new FormDataPart([");
    expect(code).toContain(
      'DataPart::fromPath("/tmp/a.pdf", "a.pdf", "application/pdf")',
    );
    expect(code).toContain("$formData->getPreparedHeaders()");
  });

  it("streams a Symfony file body rather than reading it into memory", () => {
    expect(
      generate(
        "curl https://example.com -X PUT --data-binary '@payload.bin'",
        "php-symfony",
      ),
    ).toContain("fopen(\"payload.bin\", 'r')");
  });

  it("omits the arrow on Laravel's first, static call", () => {
    expect(generate("curl -L https://example.com", "php-laravel")).toContain(
      "$response = Http::send(",
    );
    expect(generate("curl https://example.com", "php-laravel")).toContain(
      "$response = Http::withoutRedirecting()",
    );
  });
});

describe("Flurl", () => {
  it("sets the media type on the content, not also as a request header", () => {
    const code = generate(
      `curl https://example.com -X POST -H 'Content-Type: application/json' --data-raw '{}'`,
      "csharp-flurl",
    );
    expect(code).toContain('Encoding.UTF8, "application/json"');
    expect(code).not.toContain('.WithHeader("Content-Type"');
  });

  it("keeps Flurl from throwing on a non-2xx status", () => {
    expect(generate("curl https://example.com", "csharp-flurl")).toContain(
      ".AllowAnyHttpStatus()",
    );
  });

  it("names a non-standard verb through the HttpMethod constructor", () => {
    expect(
      generate("curl -X PURGE https://example.com", "csharp-flurl"),
    ).toContain('new HttpMethod("PURGE")');
  });
});
