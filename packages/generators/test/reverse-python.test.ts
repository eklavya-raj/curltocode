import { describe, expect, it } from "vitest";

import { generateCode } from "../src/index.js";
import { generateCurl } from "../src/curl.js";
import { parseCodeRequest, parsePythonRequest } from "../src/reverse/index.js";
import { DynamicExpressionError } from "../src/reverse/types.js";
import { parseCurl } from "@curltocode/core";

const request = (source: string) => parsePythonRequest(source).request;
const curlOf = (source: string) => generateCurl(request(source)).code;

describe("Python reverse parsing", () => {
  it("reads a requests GET with params and headers", () => {
    const parsed = parsePythonRequest(`import requests
requests.get(
    "https://api.example.com/users",
    params={"page": "2", "role": "admin"},
    headers={"Accept": "application/json"},
)`);
    expect(parsed.client).toBe("requests");
    expect(parsed.request.method).toBe("GET");
    expect(parsed.request.query).toEqual([
      { name: "page", value: "2" },
      { name: "role", value: "admin" },
    ]);
    expect(parsed.request.headers).toEqual([
      { name: "Accept", value: "application/json" },
    ]);
  });

  it("reads a JSON body as structured JSON rather than text", () => {
    const parsed = parsePythonRequest(`import requests
requests.post("https://api.example.com/u", json={"name": "Ada", "admin": True, "tags": [1, 2], "meta": None})`);
    expect(parsed.request.body).toEqual({
      kind: "json",
      value: { name: "Ada", admin: true, tags: [1, 2], meta: null },
      raw: '{"name":"Ada","admin":true,"tags":[1,2],"meta":null}',
    });
  });

  it("reads pre-serialized JSON under a JSON content type as JSON", () => {
    const parsed = parsePythonRequest(`import httpx
httpx.patch(
    "https://api.example.com/u",
    headers={"Content-Type": "application/json"},
    content='{"name":"Ada","roles":["admin"]}',
    follow_redirects=False,
)`);
    expect(parsed.request.body).toEqual({
      kind: "json",
      value: { name: "Ada", roles: ["admin"] },
      raw: '{"name":"Ada","roles":["admin"]}',
    });
    expect(parsed.request.options.followRedirects).toBe(false);
  });

  it("reads encoded inline bytes and continues to later keyword options", () => {
    const parsed = parsePythonRequest(`import requests
requests.post(
    "https://api.example.com/wire",
    headers={"Content-Type": "application/octet-stream"},
    data="wire-bytes-01".encode("utf-8"),
    allow_redirects=False,
)`);
    expect(parsed.request.body).toEqual({
      kind: "binary",
      source: { kind: "inline", value: "wire-bytes-01" },
    });
    expect(parsed.request.options.followRedirects).toBe(false);
  });

  it("takes the method from requests.request for custom verbs", () => {
    const parsed = parsePythonRequest(`import requests
requests.request("PURGE", "https://api.example.com/x")`);
    expect(parsed.request.method).toBe("PURGE");
  });

  it("maps a basic auth tuple onto the auth field", () => {
    const parsed = parsePythonRequest(`import requests
requests.get("https://api.example.com/b", auth=("me", "secret"))`);
    expect(parsed.request.auth).toEqual({
      kind: "basic",
      username: "me",
      password: "secret",
    });
  });

  it("accepts aiohttp BasicAuth as the same credentials", () => {
    const parsed = parsePythonRequest(`import aiohttp
async with aiohttp.ClientSession() as session:
    async with session.get("https://api.example.com/b", auth=aiohttp.BasicAuth("me", "secret")) as r:
        pass`);
    expect(parsed.client).toBe("aiohttp");
    expect(parsed.request.auth).toEqual({
      kind: "basic",
      username: "me",
      password: "secret",
    });
  });

  it("preserves duplicate headers given as a list of pairs", () => {
    const parsed = parsePythonRequest(`import requests
requests.get("https://api.example.com/d", headers=[("X-A", "1"), ("X-A", "2")])`);
    expect(parsed.request.headers).toEqual([
      { name: "X-A", value: "1" },
      { name: "X-A", value: "2" },
    ]);
  });

  it("applies each client's own redirect default and option name", () => {
    // requests and aiohttp follow by default; HTTPX does not.
    expect(
      request(`import requests\nrequests.get("https://x.com/a")`).options
        .followRedirects,
    ).toBe(true);
    expect(
      request(`import httpx\nhttpx.get("https://x.com/a")`).options
        .followRedirects,
    ).toBe(false);
    expect(
      request(
        `import requests\nrequests.get("https://x.com/a", allow_redirects=False)`,
      ).options.followRedirects,
    ).toBe(false);
    expect(
      request(
        `import httpx\nhttpx.get("https://x.com/a", follow_redirects=True)`,
      ).options.followRedirects,
    ).toBe(true);
  });

  it("resolves module-level bindings and static concatenation", () => {
    expect(
      curlOf(`import requests
BASE = "https://api.example.com"
TOKEN = "abc123"
requests.get(BASE + "/me", headers={"Authorization": "Bearer " + TOKEN})`),
    ).toContain("https://api.example.com/me");
    expect(
      request(`import requests
TOKEN = "abc123"
requests.get("https://x.com", headers={"Authorization": "Bearer " + TOKEN})`)
        .auth,
    ).toEqual({ kind: "bearer", token: "abc123" });
  });

  it("resolves function-local aiohttp URL, headers, and JSON bindings", () => {
    const parsed = parsePythonRequest(`import asyncio
import aiohttp

async def main():
    url = "https://api.example.com/users?page=1"
    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer your-token",
    }
    payload = {"name": "Eklavya"}

    async with aiohttp.ClientSession() as session:
        async with session.post(
            url,
            headers=headers,
            json=payload,
            allow_redirects=False,
        ) as response:
            await response.text()

asyncio.run(main())`);

    expect(parsed.client).toBe("aiohttp");
    expect(parsed.request.url).toBe("https://api.example.com/users");
    expect(parsed.request.query).toEqual([{ name: "page", value: "1" }]);
    expect(parsed.request.auth).toEqual({
      kind: "bearer",
      token: "your-token",
    });
    expect(parsed.request.body).toEqual({
      kind: "json",
      value: { name: "Eklavya" },
      raw: '{"name":"Eklavya"}',
    });
    expect(parsed.request.options.followRedirects).toBe(false);
    expect(generateCurl(parsed.request).code)
      .toBe(`curl 'https://api.example.com/users?page=1' \\
  -X POST \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer your-token' \\
  --data-raw '{"name":"Eklavya"}'`);
  });

  it("does not resolve a binding from an unrelated function scope", () => {
    expect(() =>
      parsePythonRequest(`import aiohttp

def unrelated():
    headers = {"Authorization": "Bearer wrong-scope"}

async def main():
    async with aiohttp.ClientSession() as session:
        async with session.get("https://api.example.com", headers=headers):
            pass`),
    ).toThrow(DynamicExpressionError);
  });

  it("ignores a name reassigned before the request rather than guessing", () => {
    expect(() =>
      parsePythonRequest(`import requests
URL = "https://a.example.com"
URL = "https://b.example.com"
requests.get(URL)`),
    ).toThrow(DynamicExpressionError);
  });

  it("reads multipart from a requests files list", () => {
    const parsed = parsePythonRequest(`import requests
requests.post(
    "https://api.example.com/up",
    files=[("note", (None, "hi")), ("file", ("a.png", open("a.png", "rb"), "image/png"))],
)`);
    expect(parsed.request.body).toEqual({
      kind: "multipart",
      parts: [
        { kind: "field", name: "note", value: "hi" },
        { kind: "file", name: "file", path: "a.png", contentType: "image/png" },
      ],
    });
  });

  it("rebuilds multipart from aiohttp FormData add_field calls", () => {
    const parsed = parsePythonRequest(`import aiohttp
from contextlib import ExitStack

with ExitStack() as files:
    form = aiohttp.FormData()
    form.add_field("note", "hi")
    file_1 = files.enter_context(open("a.png", "rb"))
    form.add_field("file", file_1, filename="a.png", content_type="image/png")

    async with aiohttp.ClientSession() as session:
        async with session.request("POST", "https://x.com/f", data=form) as r:
            pass`);
    expect(parsed.request.body).toEqual({
      kind: "multipart",
      parts: [
        { kind: "field", name: "note", value: "hi" },
        { kind: "file", name: "file", path: "a.png", contentType: "image/png" },
      ],
    });
  });

  it("treats a pre-encoded form string as a form body, not text", () => {
    const parsed = parsePythonRequest(`import requests
requests.post(
    "https://x.com/l",
    headers={"Content-Type": "application/x-www-form-urlencoded"},
    data="u=a&p=b",
)`);
    expect(parsed.request.body).toEqual({
      kind: "form-urlencoded",
      fields: [
        { name: "u", value: "a" },
        { name: "p", value: "b" },
      ],
      raw: "u=a&p=b",
    });
    // The header is implied by the body kind, so it must not also be explicit.
    expect(parsed.request.headers).toEqual([]);
  });

  describe("refuses what it cannot know", () => {
    it.each([
      ["dynamic url", `import requests\nrequests.get(build_url())`],
      [
        "f-string with a placeholder",
        `import requests\nrequests.get(f"https://x.com/{user}")`,
      ],
      [
        "dynamic headers",
        `import requests\nrequests.get("https://x.com", headers=build_headers())`,
      ],
      [
        "dynamic json body",
        `import requests\nrequests.post("https://x.com", json=payload_for(user))`,
      ],
      [
        "percent formatting",
        `import requests\nrequests.get("https://x.com/%s" % user)`,
      ],
      [
        "format call",
        `import requests\nrequests.post("https://x.com", data="{}".format(value), allow_redirects=False)`,
      ],
      [
        "non-UTF-8 byte encoding",
        `import requests\nrequests.post("https://x.com", data="café".encode("latin-1"))`,
      ],
      [
        "dict comprehension headers",
        `import requests\nrequests.get("https://x.com", headers={k: v for k, v in pairs})`,
      ],
    ])("%s", (_name, source) => {
      expect(() => parsePythonRequest(source)).toThrow(DynamicExpressionError);
    });

    it("keeps the statically known parts on the error for display", () => {
      try {
        parsePythonRequest(
          `import requests\nrequests.get(build_url(), headers={"X-A": "1"})`,
        );
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(DynamicExpressionError);
        const failure = error as DynamicExpressionError;
        expect(failure.partial.headers).toEqual([{ name: "X-A", value: "1" }]);
        expect(failure.issues[0]?.kind).toBe("url");
      }
    });

    it("reports an f-string placeholder without leaking a partial URL", () => {
      try {
        parsePythonRequest(
          `import requests\nrequests.get(f"https://x.com/{user}/profile")`,
        );
        expect.unreachable("should have thrown");
      } catch (error) {
        expect((error as DynamicExpressionError).partial.url).toBeUndefined();
      }
    });
  });

  it("does not treat a non-request Python file as a request", () => {
    expect(() => parsePythonRequest(`import requests\nprint("hello")`)).toThrow(
      /No supported Requests, HTTPX, aiohttp, urllib3, or http.client call was found/u,
    );
  });
});

describe("language detection", () => {
  it("routes Python and JavaScript to their own parsers", () => {
    expect(
      parseCodeRequest(`import requests\nrequests.get("https://x.com/a")`)
        .client,
    ).toBe("requests");
    expect(parseCodeRequest(`fetch("https://x.com/a")`).client).toBe("fetch");
  });

  it("honours an explicit language over detection", () => {
    expect(
      parseCodeRequest(`httpx.get("https://x.com/a")`, "python").client,
    ).toBe("httpx");
  });
});

describe("curl to Python and back", () => {
  const commands = [
    "curl 'https://api.example.com/u?page=2&role=admin' -H 'Accept: application/json'",
    `curl 'https://api.example.com/u' -X POST -H 'Content-Type: application/json' --data-raw '{"a":1,"b":[1,2],"c":{"d":null}}'`,
    "curl 'https://api.example.com/l' -d 'u=a' -d 'p=b'",
    "curl 'https://api.example.com/m' -H 'Authorization: Bearer tok'",
    "curl 'https://api.example.com/b' -u 'me:secret'",
    "curl -L 'https://api.example.com/r'",
    "curl 'https://api.example.com/c' -b 'session=abc'",
    "curl 'https://api.example.com/x' -X PATCH -H 'X-A: 1'",
    "curl 'https://api.example.com/f' -F 'note=hi' -F 'file=@a.png;type=image/png'",
    "curl 'https://api.example.com/uni' -H 'X-Emoji: 🎉' --data-raw 'héllo'",
  ] as const;

  const clients = ["requests", "httpx", "aiohttp"] as const;

  it.each(
    commands.flatMap((command) =>
      clients.map((client) => [client, command] as const),
    ),
  )("%s round-trips %s", (client, command) => {
    const original = parseCurl(command).request;
    const code = generateCode(original, `python-${client}`).code;
    const recovered = parsePythonRequest(code).request;
    expect(generateCurl(recovered).code).toBe(generateCurl(original).code);
  });
});

describe("client and session instances", () => {
  it("reads a requests.Session assigned to a variable", () => {
    const result = parsePythonRequest(
      [
        "import requests",
        "session = requests.Session()",
        'response = session.post("https://api.example.com/x", json={"a": 1})',
      ].join("\n"),
    );
    expect(result.client).toBe("requests");
    expect(result.request.method).toBe("POST");
    expect(result.request.url).toBe("https://api.example.com/x");
    expect(result.request.body).toMatchObject({ kind: "json" });
  });

  it("reads a requests.Session used as a context manager", () => {
    const result = parsePythonRequest(
      [
        "import requests",
        "with requests.Session() as s:",
        '    r = s.get("https://api.example.com/y", params={"q": "1"})',
      ].join("\n"),
    );
    expect(result.client).toBe("requests");
    expect(result.request.query).toEqual([{ name: "q", value: "1" }]);
  });

  it("reads httpx.Client and httpx.AsyncClient instances", () => {
    const sync = parsePythonRequest(
      [
        "import httpx",
        "with httpx.Client() as client:",
        '    r = client.get("https://api.example.com/x")',
      ].join("\n"),
    );
    expect(sync.client).toBe("httpx");
    expect(sync.request.url).toBe("https://api.example.com/x");

    const asynchronous = parsePythonRequest(
      [
        "import httpx",
        "async with httpx.AsyncClient() as client:",
        '    r = await client.delete("https://api.example.com/z")',
      ].join("\n"),
    );
    expect(asynchronous.client).toBe("httpx");
    expect(asynchronous.request.method).toBe("DELETE");
  });
});
