import { describe, expect, it } from "vitest";

import { generateCurl } from "../src/index.js";
import { parseCodeRequest } from "../src/reverse/index.js";

const toCurl = (source: string): string =>
  generateCurl(parseCodeRequest(source).request).code;

describe("HTTPie command lines", () => {
  it("reads a header item and the URL", () => {
    const curl = toCurl(
      "http GET https://api.example.com/v1/x Accept:application/json",
    );
    expect(curl).toContain("https://api.example.com/v1/x");
    expect(curl).toContain("Accept: application/json");
  });

  it("treats a bare name=value as a JSON field, which is HTTPie's default", () => {
    const curl = toCurl("http POST https://example.com name=Ada active=yes");
    expect(curl).toContain('{"name":"Ada","active":"yes"}');
    expect(curl).toContain("application/json");
  });

  it("reads := as a raw JSON value rather than a string", () => {
    expect(toCurl("http POST https://example.com active:=true")).toContain(
      '{"active":true}',
    );
  });

  it("sends --form fields as a urlencoded body, not a multipart one", () => {
    // --form alone is urlencoded in HTTPie; only --multipart or a file item
    // makes it multipart.
    expect(toCurl("http --form POST https://example.com a=1 b=2")).toContain(
      "a=1&b=2",
    );
    expect(
      parseCodeRequest("http --form POST https://example.com a=1 b=2").request
        .body,
    ).toMatchObject({ kind: "form-urlencoded" });
  });

  it("reads --raw as the exact body", () => {
    const curl = toCurl(
      "http POST https://example.com Content-Type:application/json --raw='{\"a\":1}'",
    );
    expect(curl).toContain('{"a":1}');
  });

  it("reads a file item with its declared media type", () => {
    const curl = toCurl(
      "http --multipart POST https://example.com doc@'/tmp/a.pdf;type=application/pdf'",
    );
    expect(curl).toContain("-F 'doc=@/tmp/a.pdf;type=application/pdf'");
  });

  it("splits an item at the first unescaped separator", () => {
    // `a\=b` is one field name, so the split belongs at the second `=`.
    expect(toCurl("http --form POST https://example.com 'a\\=b=1'")).toContain(
      "a%3Db=1",
    );
  });

  it("reads --auth and --follow", () => {
    const curl = toCurl("http --follow --auth=ada:pw GET https://example.com");
    expect(curl).toContain("-u 'ada:pw'");
    expect(curl).toContain("-L");
  });

  it("defaults the method to GET without a body and POST with one", () => {
    expect(toCurl("http https://example.com")).not.toContain("-X");
    expect(toCurl("http https://example.com a=1")).toContain("-X POST");
  });
});

describe("Wget command lines", () => {
  it("reads the URL, method, and headers", () => {
    const curl = toCurl(
      "wget --method=PATCH --header='Accept: application/json' -O - https://example.com/a",
    );
    expect(curl).toContain("https://example.com/a");
    expect(curl).toContain("-X PATCH");
    expect(curl).toContain("Accept: application/json");
  });

  it("keeps a repeated header name", () => {
    const curl = toCurl(
      "wget --header='X-A: one' --header='X-A: two' https://example.com",
    );
    expect(curl).toContain("X-A: one");
    expect(curl).toContain("X-A: two");
  });

  it("reads --body-data against the declared content type", () => {
    const curl = toCurl(
      `wget --method=POST --header='Content-Type: application/json' --body-data='{"a":1}' https://example.com`,
    );
    expect(curl).toContain('{"a":1}');
  });

  it("reads --body-file as a file-backed body", () => {
    expect(
      toCurl("wget --method=PUT --body-file=payload.bin https://example.com"),
    ).toContain("--data-binary '@payload.bin'");
  });

  it("reads credentials from --user and --password", () => {
    expect(
      toCurl("wget --user=ada --password='p@ss' https://example.com"),
    ).toContain("-u 'ada:p@ss'");
  });

  it("reads --max-redirect=0 as not following", () => {
    expect(toCurl("wget --max-redirect=0 https://example.com")).not.toContain(
      "-L",
    );
    // Wget follows by default, so a command that says nothing does follow.
    expect(toCurl("wget https://example.com")).toContain("-L");
  });

  it("ignores -O, which names an output file rather than the request", () => {
    expect(toCurl("wget -O out.json https://example.com")).toContain(
      "https://example.com",
    );
  });

  it("accepts a separated option value as well as an attached one", () => {
    expect(
      toCurl("wget --method POST --body-data 'a=1' https://example.com"),
    ).toContain("a=1");
  });
});

describe("PowerShell cmdlets", () => {
  const script = `$headers = @{
    'Accept' = 'application/json'
    'X-Quote' = 'O''Reilly'
}

$body = '{"name":"Ada"}'

$response = Invoke-RestMethod \`
    -Uri 'https://api.example.com/v1/x' \`
    -Method 'POST' \`
    -Headers $headers \`
    -ContentType 'application/json' \`
    -Body $body \`
    -MaximumRedirection 0

$response`;

  it("resolves the headers and body bound to variables", () => {
    const curl = toCurl(script);
    expect(curl).toContain("https://api.example.com/v1/x");
    expect(curl).toContain("-X POST");
    expect(curl).toContain("Accept: application/json");
    expect(curl).toContain('{"name":"Ada"}');
  });

  it("undoubles a quote inside a literal", () => {
    // Asserted on the parsed request: the cURL generator re-escapes the quote
    // for the shell, so the recovered value is not contiguous in its output.
    expect(parseCodeRequest(script).request.headers).toContainEqual({
      name: "X-Quote",
      value: "O'Reilly",
    });
  });

  it("reads -MaximumRedirection 0 as not following", () => {
    expect(toCurl(script)).not.toContain("-L");
  });

  it("reads -CustomMethod for a verb outside the enum", () => {
    expect(
      toCurl(
        "Invoke-RestMethod -Uri 'https://example.com' -CustomMethod 'PURGE'",
      ),
    ).toContain("-X PURGE");
  });

  it("reads -InFile as a file-backed body", () => {
    expect(
      toCurl(
        "Invoke-WebRequest -Uri 'https://example.com' -Method 'PUT' -InFile 'payload.bin'",
      ),
    ).toContain("--data-binary '@payload.bin'");
  });

  it("resolves a body wrapped in an encoding call", () => {
    expect(
      toCurl(
        `$body = [System.Text.Encoding]::UTF8.GetBytes('raw-bytes')\n$response = Invoke-RestMethod -Uri 'https://example.com' -Method 'POST' -Body $body`,
      ),
    ).toContain("raw-bytes");
  });

  it("names which cmdlet it read", () => {
    expect(
      parseCodeRequest("Invoke-WebRequest -Uri 'https://example.com'").client,
    ).toBe("webrequest");
    expect(
      parseCodeRequest("Invoke-RestMethod -Uri 'https://example.com'").client,
    ).toBe("restmethod");
  });

  it("reports a body it cannot resolve instead of dropping it", () => {
    expect(() =>
      parseCodeRequest(
        "Invoke-RestMethod -Uri 'https://example.com' -Method 'POST' -Body $payload",
      ),
    ).toThrowError(/not a string literal this parser can resolve/u);
  });
});
