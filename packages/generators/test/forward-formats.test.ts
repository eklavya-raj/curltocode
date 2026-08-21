import { createHttpRequest, parseCurl } from "@curltocode/core";
import { describe, expect, it } from "vitest";

import { generateCode, GeneratorError } from "../src/index.js";
import type { GeneratorId } from "../src/index.js";

const generate = (curl: string, id: GeneratorId): string =>
  generateCode(parseCurl(curl).request, id).code;

describe("HTTPie command line", () => {
  it("quotes only the value half of a request item", () => {
    const code = generate(
      "curl https://example.com -H 'Accept: application/json' -H 'X-Trace: a b'",
      "httpie-cli",
    );
    expect(code).toContain("Accept:application/json");
    expect(code).toContain("X-Trace:'a b'");
  });

  it("uses the semicolon form for a header sent with an empty value", () => {
    const request = createHttpRequest("https://example.com", {
      headers: [{ name: "X-Empty", value: "" }],
    });
    // `Name:` asks HTTPie to *drop* the header, which would silently change the
    // request; `Name;` is the form that sends it empty.
    expect(generateCode(request, "httpie-cli").code).toContain("X-Empty;");
  });

  it("escapes a separator character appearing inside an item name", () => {
    const request = createHttpRequest("https://example.com", {
      method: "POST",
      body: {
        kind: "multipart",
        parts: [{ kind: "field", name: "a=b", value: "1" }],
      },
    });
    // Without the backslash HTTPie would read the field as `a` = `b=1`.
    expect(generateCode(request, "httpie-cli").code).toContain("a\\=b=1");
  });

  it("reads a file-backed body from standard input", () => {
    const code = generate(
      "curl https://example.com -X PUT --data-binary '@payload.bin'",
      "httpie-cli",
    );
    expect(code).toContain("< payload.bin");
    expect(code).not.toContain("--raw=");
  });

  it("refuses repeated header names rather than silently dropping one", () => {
    expect(() =>
      generate(
        "curl https://example.com -H 'X-A: 1' -H 'X-A: 2'",
        "httpie-cli",
      ),
    ).toThrowError(/replaces the earlier value/u);
  });
});

describe("Wget command line", () => {
  it("preserves repeated header names in order", () => {
    const code = generate(
      "curl https://example.com -H 'X-A: first' -H 'X-A: second'",
      "wget-cli",
    );
    expect(code.indexOf("first")).toBeLessThan(code.indexOf("second"));
  });

  it("sends basic credentials without waiting for a challenge", () => {
    const code = generate("curl https://example.com -u 'ada:pw'", "wget-cli");
    expect(code).toContain("--user=ada");
    expect(code).toContain("--password=pw");
    expect(code).toContain("--auth-no-challenge");
  });

  it("states the redirect policy in both directions", () => {
    expect(generate("curl https://example.com", "wget-cli")).toContain(
      "--max-redirect=0",
    );
    expect(generate("curl -L https://example.com", "wget-cli")).toContain(
      "--max-redirect=20",
    );
  });

  it("reports its lack of multipart support instead of flattening the body", () => {
    expect(() =>
      generate("curl https://example.com -F note=hi", "wget-cli"),
    ).toThrowError(/no multipart\/form-data support/u);
  });
});

describe("PowerShell cmdlets", () => {
  it("doubles a quote inside a literal string", () => {
    const code = generate(
      `curl https://example.com -H "X-Quote: O'Reilly"`,
      "powershell-restmethod",
    );
    expect(code).toContain("'O''Reilly'");
  });

  it("routes a non-enum verb through -CustomMethod", () => {
    expect(
      generate("curl -X PURGE https://example.com", "powershell-restmethod"),
    ).toContain("-CustomMethod 'PURGE'");
    expect(
      generate(
        "curl -X POST https://example.com -d a=1",
        "powershell-restmethod",
      ),
    ).toContain("-Method 'POST'");
  });

  it("sets the media type through -ContentType rather than twice", () => {
    const code = generate(
      `curl https://example.com -X POST -H 'Content-Type: application/json' --data-raw '{}'`,
      "powershell-restmethod",
    );
    expect(code).toContain("-ContentType 'application/json'");
    // The same field must not also appear in the -Headers hashtable, which
    // Windows PowerShell rejects as a duplicate.
    expect(code).not.toContain("'Content-Type' =");
  });

  it("returns the response body from each cmdlet's own shape", () => {
    expect(
      generate("curl https://example.com", "powershell-restmethod"),
    ).toMatch(/\$response$/u);
    expect(
      generate("curl https://example.com", "powershell-webrequest"),
    ).toMatch(/\$response\.Content$/u);
  });

  it("reports that -Form cannot set a part media type", () => {
    expect(() =>
      generate(
        "curl https://example.com -F 'doc=@/tmp/a.pdf;type=application/pdf'",
        "powershell-restmethod",
      ),
    ).toThrowError(/Content-Type from the file itself/u);
  });
});

describe("HAR archive", () => {
  it("is valid JSON describing one request-only entry", () => {
    const har = JSON.parse(
      generate("curl 'https://example.com/a?x=1' -H 'Accept: */*'", "har-json"),
    ) as {
      log: {
        version: string;
        entries: {
          request: {
            method: string;
            url: string;
            headers: { name: string; value: string }[];
            queryString: { name: string; value: string }[];
          };
          response: { status: number };
        }[];
      };
    };
    expect(har.log.version).toBe("1.2");
    expect(har.log.entries).toHaveLength(1);
    const entry = har.log.entries[0]!;
    expect(entry.request.method).toBe("GET");
    expect(entry.request.url).toBe("https://example.com/a?x=1");
    expect(entry.request.queryString).toEqual([{ name: "x", value: "1" }]);
    expect(entry.request.headers).toContainEqual({
      name: "Accept",
      value: "*/*",
    });
    // Status 0 is how the format records a transaction with no response, which
    // is the honest value for a request that has not been sent.
    expect(entry.response.status).toBe(0);
  });

  it("records a form body as both parameters and the exact bytes", () => {
    const har = JSON.parse(
      generate("curl https://example.com -d 'a=1' -d 'a=2'", "har-json"),
    ) as {
      log: {
        entries: {
          request: {
            postData: {
              text: string;
              params: { name: string; value: string }[];
            };
          };
        }[];
      };
    };
    const postData = har.log.entries[0]!.request.postData;
    expect(postData.text).toBe("a=1&a=2");
    expect(postData.params).toEqual([
      { name: "a", value: "1" },
      { name: "a", value: "2" },
    ]);
  });
});

describe("JSON request document", () => {
  it("round-trips every field the normalized model carries", () => {
    const document = JSON.parse(
      generate(
        "curl 'https://example.com/a?x=1' -L -X PUT -u 'ada:pw' -b 'k=v' -H 'X-A: 1' -H 'X-A: 2' -H 'Content-Type: text/plain' --data-raw 'body'",
        "json-request",
      ),
    ) as Record<string, unknown>;
    expect(document).toMatchObject({
      method: "PUT",
      url: "https://example.com/a?x=1",
      headers: [
        { name: "X-A", value: "1" },
        { name: "X-A", value: "2" },
        { name: "Content-Type", value: "text/plain" },
      ],
      cookies: [{ name: "k", value: "v" }],
      auth: { kind: "basic", username: "ada", password: "pw" },
      body: { kind: "text", value: "body" },
      options: { followRedirects: true },
    });
  });
});

describe("Ansible uri task", () => {
  it("sends the body verbatim rather than re-serializing it", () => {
    const code = generate(
      `curl https://example.com -X POST -H 'Content-Type: application/json' --data-raw '{"a": 1}'`,
      "ansible-uri",
    );
    // body_format defaults to raw; naming json here would make Ansible encode
    // the string a second time.
    expect(code).not.toContain("body_format: json");
    expect(code).toContain('body: "{\\"a\\": 1}"');
  });

  it("uploads a file-backed body through src", () => {
    expect(
      generate(
        "curl https://example.com -X PUT --data-binary '@payload.bin'",
        "ansible-uri",
      ),
    ).toContain('src: "payload.bin"');
  });

  it("forces basic auth instead of waiting for a challenge", () => {
    const code = generate(
      "curl https://example.com -u 'ada:pw'",
      "ansible-uri",
    );
    expect(code).toContain('url_username: "ada"');
    expect(code).toContain("force_basic_auth: true");
  });
});

describe("Postman collection", () => {
  it("declares the v2.1 schema and splits the URL into its parts", () => {
    const collection = JSON.parse(
      generate(
        "curl 'https://api.example.com:8443/v1/a?x=1'",
        "postman-collection",
      ),
    ) as {
      info: { schema: string };
      item: {
        request: {
          url: {
            protocol: string;
            host: string[];
            port: string;
            path: string[];
            query: { key: string; value: string }[];
          };
        };
      }[];
    };
    expect(collection.info.schema).toContain("v2.1.0");
    expect(collection.item[0]!.request.url).toMatchObject({
      protocol: "https",
      host: ["api", "example", "com"],
      port: "8443",
      path: ["v1", "a"],
      query: [{ key: "x", value: "1" }],
    });
  });

  it("maps basic credentials to the collection auth block", () => {
    const collection = JSON.parse(
      generate("curl https://example.com -u 'ada:p@ss'", "postman-collection"),
    ) as { item: { request: { auth: { type: string } } }[] };
    expect(collection.item[0]!.request.auth.type).toBe("basic");
  });
});

describe("k6 script", () => {
  it("opens a file in the init context, not inside the exported function", () => {
    const code = generate(
      "curl https://example.com -X PUT --data-binary '@payload.bin'",
      "k6-script",
    );
    // k6 only allows open() at module scope, so the call has to appear before
    // the default export rather than beside the request.
    expect(code.indexOf("open(")).toBeLessThan(
      code.indexOf("export default function"),
    );
  });

  it("states the redirect budget in both directions", () => {
    expect(generate("curl https://example.com", "k6-script")).toContain(
      "redirects: 0",
    );
    expect(generate("curl -L https://example.com", "k6-script")).toContain(
      "redirects: 10",
    );
  });
});

describe("format targets refuse what they cannot express", () => {
  it("reports a typed error rather than inventing file contents in a HAR", () => {
    try {
      generate(
        "curl https://example.com -X PUT --data-binary '@payload.bin'",
        "har-json",
      );
      expect.unreachable("har-json should reject a file-backed body");
    } catch (error) {
      expect(error).toBeInstanceOf(GeneratorError);
      expect((error as GeneratorError).code).toBe("GENERATOR_FILE_REFERENCE");
    }
  });
});
