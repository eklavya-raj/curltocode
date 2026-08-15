import { describe, expect, it } from "vitest";

import { detectShellDialect, parseCurl } from "../src/index.js";

/**
 * Commands taken from the places people actually copy cURL from, rather than
 * commands invented to suit the parser.
 *
 * Browser "Copy as cURL" output and public API documentation are the two
 * dominant sources, and both have shapes a hand-written fixture tends to miss:
 * ANSI-C quoted headers, `--compressed` on every browser command, semicolons
 * inside cookie values, and long single-line commands with no continuations.
 */

interface Expectation {
  readonly method?: string;
  readonly url?: string;
  readonly header?: readonly [string, string];
  readonly bodyKind?: string;
  readonly auth?: string;
}

const CORPUS: readonly (readonly [string, string, Expectation])[] = [
  [
    "Chrome Copy as cURL (bash)",
    String.raw`curl 'https://api.example.com/v2/items?page=2&sort=created' \
  -H 'accept: application/json, text/plain, */*' \
  -H 'accept-language: en-GB,en;q=0.9' \
  -H 'cookie: session=abc123; theme=dark' \
  -H 'sec-ch-ua: "Chromium";v="120", "Not(A:Brand";v="24"' \
  -H 'sec-fetch-mode: cors' \
  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' \
  --compressed`,
    { method: "GET", header: ["accept-language", "en-GB,en;q=0.9"] },
  ],
  [
    "Chrome Copy as cURL with ANSI-C quoted header",
    String.raw`curl 'https://api.example.com/search' \
  -H $'x-title: Café Résumé' \
  -H $'cookie: sid=1; name=O\'Brien' \
  --compressed`,
    { method: "GET", header: ["x-title", "Café Résumé"] },
  ],
  [
    "Firefox Copy as cURL with POST body",
    String.raw`curl 'https://api.example.com/graphql' -X POST -H 'User-Agent: Mozilla/5.0' -H 'Accept: */*' -H 'Content-Type: application/json' -H 'Origin: https://app.example.com' --data-raw '{"query":"{ viewer { id } }","variables":null}'`,
    { method: "POST", bodyKind: "json" },
  ],
  [
    "Safari Copy as cURL",
    String.raw`curl 'https://api.example.com/me' -X GET -H 'Accept: application/json' -H 'Accept-Encoding: gzip, deflate, br' -H 'Connection: keep-alive' --compressed`,
    { method: "GET" },
  ],
  [
    "Stripe docs style",
    String.raw`curl https://api.stripe.com/v1/charges \
  -u sk_test_abc123: \
  -d amount=2000 \
  -d currency=usd \
  -d "description=Charge for jenny@example.com"`,
    { method: "POST", auth: "basic", bodyKind: "form-urlencoded" },
  ],
  [
    "GitHub API docs style",
    String.raw`curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer ghp_exampletoken" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/octocat/hello-world/issues`,
    { method: "GET", auth: "bearer" },
  ],
  [
    "OpenAI API docs style",
    String.raw`curl https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-exampletoken" \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"Hello!"}]}'`,
    { method: "POST", bodyKind: "json", auth: "bearer" },
  ],
  [
    "Twilio docs style with basic auth and repeated fields",
    String.raw`curl -X POST https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json \
--data-urlencode "Body=Hi there" \
--data-urlencode "To=+15558675310" \
--data-urlencode "From=+15017122661" \
-u AC123:auth_token`,
    { method: "POST", auth: "basic", bodyKind: "form-urlencoded" },
  ],
  [
    "Elasticsearch docs style with silent and explicit JSON",
    String.raw`curl -s -X PUT "localhost:9200/my-index/_doc/1?pretty" -H 'Content-Type: application/json' -d'{"user":"ada","message":"hello"}'`,
    { method: "PUT", bodyKind: "json" },
  ],
  [
    "multipart upload with mixed parts",
    String.raw`curl -X POST https://api.example.com/upload \
  -H "Authorization: Bearer tok" \
  -F 'metadata={"name":"report"};type=application/json' \
  -F 'file=@/tmp/report.pdf;type=application/pdf' \
  -F 'note=quarterly'`,
    { method: "POST", bodyKind: "multipart" },
  ],
  [
    "shell-wrapped command with many process flags",
    String.raw`curl -sSfL --retry 3 --max-time 30 -o /dev/null -w '%{http_code}' https://api.example.com/health`,
    { method: "GET", url: "https://api.example.com/health" },
  ],
  [
    "Swagger UI export",
    String.raw`curl -X 'POST' \
  'https://api.example.com/v1/pets' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{"name":"doggie","status":"available"}'`,
    { method: "POST", bodyKind: "json" },
  ],
  [
    "HEAD request with insecure flag",
    "curl -I -k https://self-signed.example.com/status",
    { method: "HEAD" },
  ],
  [
    "query built with -G and --data-urlencode",
    String.raw`curl -G https://api.example.com/search \
  --data-urlencode 'q=hello world' \
  --data-urlencode 'lang=en'`,
    { method: "GET" },
  ],
  [
    "inline short option values",
    "curl -XDELETE -H'X-Token: abc' https://api.example.com/items/42",
    { method: "DELETE", header: ["X-Token", "abc"] },
  ],
];

describe("real-world cURL corpus", () => {
  it.each(CORPUS)("parses %s", (_name, command, expected) => {
    const { request } = parseCurl(command);
    if (expected.method !== undefined)
      expect(request.method).toBe(expected.method);
    if (expected.url !== undefined) expect(request.url).toBe(expected.url);
    if (expected.header !== undefined) {
      expect(
        request.headers.some(
          (header) =>
            header.name.toLowerCase() === expected.header?.[0].toLowerCase() &&
            header.value === expected.header[1],
        ),
        `expected header ${expected.header[0]}: ${expected.header[1]} in ${JSON.stringify(request.headers)}`,
      ).toBe(true);
    }
    if (expected.bodyKind !== undefined)
      expect(request.body?.kind).toBe(expected.bodyKind);
    if (expected.auth !== undefined)
      expect(request.auth?.kind).toBe(expected.auth);
  });

  it("keeps a semicolon-separated cookie header as separate cookies", () => {
    const { request } = parseCurl(
      "curl 'https://x.test/' -H 'cookie: session=abc123; theme=dark' --compressed",
    );
    expect(request.cookies).toEqual([
      { name: "session", value: "abc123" },
      { name: "theme", value: "dark" },
    ]);
  });

  it("preserves a browser sec-ch-ua header containing quotes and commas", () => {
    const { request } = parseCurl(
      String.raw`curl 'https://x.test/' -H 'sec-ch-ua: "Chromium";v="120", "Not(A:Brand";v="24"' --compressed`,
    );
    expect(request.headers[0]?.value).toBe(
      '"Chromium";v="120", "Not(A:Brand";v="24"',
    );
  });

  it("reads a Stripe-style trailing-colon credential as an empty password", () => {
    const { request } = parseCurl(
      "curl https://api.stripe.com/v1/charges -u sk_test_abc123: -d amount=2000",
    );
    expect(request.auth).toEqual({
      kind: "basic",
      username: "sk_test_abc123",
      password: "",
    });
  });

  it("assumes http:// when the URL carries no scheme, as cURL does", () => {
    // Local-service documentation is written this way almost universally.
    expect(parseCurl("curl localhost:9200/_search").request.url).toBe(
      "http://localhost:9200/_search",
    );
    expect(parseCurl("curl example.com/path").request.url).toBe(
      "http://example.com/path",
    );
    expect(parseCurl("curl 127.0.0.1:3000/api").request.url).toBe(
      "http://127.0.0.1:3000/api",
    );
    // An explicit scheme is still respected.
    expect(parseCurl("curl https://example.com/x").request.url).toBe(
      "https://example.com/x",
    );
  });

  it("still rejects a scheme it cannot speak", () => {
    expect(() => parseCurl("curl ftp://example.com/file")).toThrowError(
      /Unsupported URL protocol/u,
    );
  });

  it("does not treat a process option's value as the request URL", () => {
    // -o and -w both take values that look nothing like flags; swallowing them
    // incorrectly used to surface as "Multiple request URLs are not supported".
    const { request } = parseCurl(
      "curl -o out.json -w '%{http_code}' --max-time 30 https://api.example.com/x",
    );
    expect(request.url).toBe("https://api.example.com/x");
  });
});

/**
 * Chrome, Edge, and Firefox all offer "Copy as cURL" in three flavours, and a
 * Windows user reaches the cmd or PowerShell one at least as often as bash.
 * Both were previously tokenized into nonsense and surfaced the misleading
 * error "Multiple request URLs are not supported".
 */
describe("Windows command dialects", () => {
  it("recognises which shell produced a command", () => {
    expect(detectShellDialect("curl 'https://x.test/' \\\n  -H 'a: b'")).toBe(
      "posix",
    );
    expect(detectShellDialect('curl "https://x.test/" ^\r\n  -H "a: b"')).toBe(
      "cmd",
    );
    expect(
      detectShellDialect('curl.exe "https://x.test/" `\n  -H "a: b"'),
    ).toBe("powershell");
    // A single-line PowerShell command has no continuation to go on.
    expect(detectShellDialect('curl.exe "https://x.test/"')).toBe("powershell");
  });

  it("parses Chrome's Copy as cURL (cmd) output", () => {
    const { request } = parseCurl(
      [
        'curl "https://api.example.com/v1/items?page=2" ^',
        '  -H "accept: application/json" ^',
        '  -H "x-token: abc123" ^',
        "  --compressed",
      ].join("\r\n"),
    );
    expect(request.method).toBe("GET");
    expect(request.url).toBe("https://api.example.com/v1/items");
    expect(request.query).toEqual([{ name: "page", value: "2" }]);
    expect(request.headers).toEqual([
      { name: "accept", value: "application/json" },
      { name: "x-token", value: "abc123" },
    ]);
  });

  it("unescapes cmd quoting inside a JSON header or body", () => {
    const { request } = parseCurl(
      ['curl "https://x.test/p" -X POST ^', '  -d "{\\"a\\":1}"'].join("\n"),
    );
    expect(request.method).toBe("POST");
    expect(request.body).toMatchObject({ raw: '{"a":1}' });
  });

  it("parses Chrome's Copy as PowerShell output", () => {
    const { request } = parseCurl(
      [
        'curl.exe "https://api.example.com/v1/items" `',
        "  -X POST `",
        '  -H "content-type: application/json" `',
        '  --data-raw "{`"name`":`"Ada`"}"',
      ].join("\n"),
    );
    expect(request.method).toBe("POST");
    expect(request.headers).toEqual([
      { name: "content-type", value: "application/json" },
    ]);
    expect(request.body).toMatchObject({
      kind: "json",
      raw: '{"name":"Ada"}',
    });
  });

  it("accepts curl.exe and Windows path separators", () => {
    expect(parseCurl('curl.exe "https://x.test/"').request.url).toBe(
      "https://x.test/",
    );
    expect(
      parseCurl('"C:\\Windows\\System32\\curl.exe" "https://x.test/"').request
        .url,
    ).toBe("https://x.test/");
  });

  it("reads PowerShell single quotes as literal text", () => {
    const { request } = parseCurl(
      "curl.exe 'https://x.test/' -H 'x-raw: a`nb'",
    );
    // A backtick inside single quotes is not an escape in PowerShell.
    expect(request.headers).toEqual([{ name: "x-raw", value: "a`nb" }]);
  });
});
