import { parseCurl } from "@curltocode/core";
import { describe, expect, it } from "vitest";

import { generateCode, GeneratorError } from "../src/index.js";
import type { GeneratorId } from "../src/index.js";

const generate = (curl: string, id: GeneratorId): string =>
  generateCode(parseCurl(curl).request, id).code;

const nodeIds = [
  "nodejs-fetch",
  "nodejs-axios",
  "nodejs-got",
  "nodejs-ky",
  "nodejs-superagent",
  "nodejs-https",
] as const satisfies readonly GeneratorId[];

describe("Node.js targets resolve local files the browser cannot", () => {
  it.each(nodeIds)("%s uploads a multipart file by path", (id) => {
    const code = generate(
      "curl https://example.com -F 'doc=@/tmp/a.pdf;type=application/pdf'",
      id,
    );
    expect(code).toContain("/tmp/a.pdf");
    expect(code).toContain("application/pdf");
  });

  it.each(nodeIds)("%s sends a file-backed binary body", (id) => {
    const code = generate(
      "curl https://example.com -X PUT --data-binary '@payload.bin'",
      id,
    );
    expect(code).toContain("payload.bin");
  });

  it("is the difference from the browser target of the same library", () => {
    // Browser JavaScript has to refuse what Node can simply read.
    expect(() =>
      generate(
        "curl https://example.com -F 'doc=@/tmp/a.pdf'",
        "javascript-fetch",
      ),
    ).toThrowError(GeneratorError);
    expect(
      generate("curl https://example.com -F 'doc=@/tmp/a.pdf'", "nodejs-fetch"),
    ).toContain("/tmp/a.pdf");
  });
});

describe("Node.js client behaviour", () => {
  it("turns off Got's retries and error throwing to match cURL", () => {
    const code = generate("curl https://example.com", "nodejs-got");
    expect(code).toContain("retry: { limit: 0 }");
    expect(code).toContain("throwHttpErrors: false");
  });

  it("turns off Ky's retries, which are on by default", () => {
    expect(generate("curl https://example.com", "nodejs-ky")).toContain(
      "retry: 0",
    );
  });

  it("keeps SuperAgent from rejecting on a non-2xx status", () => {
    expect(generate("curl https://example.com", "nodejs-superagent")).toContain(
      ".ok(() => true)",
    );
  });

  it("pipes a file body into SuperAgent rather than buffering it", () => {
    const code = generate(
      "curl https://example.com -X PUT --data-binary '@payload.bin'",
      "nodejs-superagent",
    );
    expect(code).toContain('createReadStream("payload.bin").pipe(request)');
  });

  it("streams a file body into node:https instead of calling end() early", () => {
    const code = generate(
      "curl https://example.com -X PUT --data-binary '@payload.bin'",
      "nodejs-https",
    );
    expect(code).toContain(".pipe(req)");
    // Piping ends the request itself; an explicit end() would close it first.
    expect(code).not.toContain("req.end();");
  });

  it("picks the core module that matches the URL scheme", () => {
    expect(generate("curl https://example.com", "nodejs-https")).toContain(
      'from "node:https"',
    );
    expect(generate("curl http://example.com", "nodejs-https")).toContain(
      'from "node:http"',
    );
  });

  it("keeps duplicate headers as an array, which node:http accepts", () => {
    expect(
      generate(
        "curl https://example.com -H 'X-A: one' -H 'X-A: two'",
        "nodejs-https",
      ),
    ).toContain('"X-A": ["one", "two"]');
  });

  it("reports that the core modules cannot follow redirects", () => {
    expect(() =>
      generate("curl -L https://example.com", "nodejs-https"),
    ).toThrowError(/do not follow redirects/u);
  });
});

describe("legacy browser targets", () => {
  it.each(["javascript-jquery", "javascript-xhr"] as const)(
    "%s states that redirects are always followed",
    (id) => {
      const code = generate("curl https://example.com", id);
      expect(code.toLowerCase()).toContain("always follows redirects");
      // The note is unconditional because neither state can be expressed.
      expect(generate("curl -L https://example.com", id)).toBe(code);
    },
  );

  it("stops jQuery re-serializing a raw body as a query string", () => {
    const code = generate(
      "curl https://example.com -d 'a=1&b=2'",
      "javascript-jquery",
    );
    expect(code).toContain("processData: false");
    expect(code).toContain('contentType: "application/x-www-form-urlencoded"');
  });

  it("lets FormData set its own multipart boundary", () => {
    const code = generate(
      "curl https://example.com -F 'note=hi'",
      "javascript-jquery",
    );
    expect(code).toContain("contentType: false");
  });

  it("refuses a repeated header rather than letting XHR comma-fold it", () => {
    expect(() =>
      generate(
        "curl https://example.com -H 'X-A: 1' -H 'X-A: 2'",
        "javascript-xhr",
      ),
    ).toThrowError(/comma-separated value/u);
  });

  it("explains that a browser cannot read a local file path", () => {
    expect(() =>
      generate(
        "curl https://example.com -F 'doc=@/tmp/a.pdf'",
        "javascript-jquery",
      ),
    ).toThrowError(/input type="file"/u);
  });
});
