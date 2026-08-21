import { parseCurl } from "@curltocode/core";
import { describe, expect, it } from "vitest";

import { generateCode } from "../src/index.js";
import type { GeneratorId } from "../src/index.js";

const generate = (curl: string, id: GeneratorId): string =>
  generateCode(parseCurl(curl).request, id).code;

const ids = [
  "c-libcurl",
  "cpp-cpr",
  "clojure-cljhttp",
  "elixir-req",
  "elixir-httpoison",
  "perl-lwp",
  "r-httr2",
  "r-httr",
  "julia-http",
  "lua-http",
  "matlab-http",
  "ocaml-cohttp",
  "scala-sttp",
  "cfml-cfhttp",
  "nim-httpclient",
  "crystal-httpclient",
] as const satisfies readonly GeneratorId[];

describe("long-tail language generators", () => {
  it.each(ids)("%s emits non-ASCII text as characters", (id) => {
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

describe("interpolation sigils are escaped where the language expands them", () => {
  it("escapes a dollar sign in Julia", () => {
    expect(
      generate("curl https://example.com -H 'X-Cost: $5'", "julia-http"),
    ).toContain("\\$5");
  });

  it("escapes an interpolation in Crystal, which shares Ruby's syntax", () => {
    expect(
      generate(
        "curl https://example.com -H 'X-A: #{oops}'",
        "crystal-httpclient",
      ),
    ).toContain("\\#{oops}");
  });

  it("leaves Perl's sigils alone by using a single-quoted string", () => {
    // A single-quoted Perl string interpolates nothing, so a password full of
    // sigils stays readable instead of becoming a wall of backslashes.
    const code = generate(
      "curl https://example.com -u 'ada:p@ss$word'",
      "perl-lwp",
    );
    expect(code).toContain("'p@ss$word'");
  });
});

describe("C and C++", () => {
  it("uses fixed-length octal escapes, which cannot absorb the next character", () => {
    const code = generate(
      "curl https://example.com -H 'X-Tab: a\tb'",
      "c-libcurl",
    );
    expect(code).toContain("\\t");
    expect(code).not.toContain("\\x9b");
  });

  it("frees the header list and the mime handle it allocated", () => {
    const code = generate(
      "curl https://example.com -H 'Accept: */*' -F 'doc=@/tmp/a.pdf'",
      "c-libcurl",
    );
    expect(code).toContain("curl_slist_free_all(headers);");
    expect(code).toContain("curl_mime_free(mime);");
  });

  it("copies the post fields so the literal need not outlive the transfer", () => {
    expect(
      generate("curl https://example.com -d 'a=1'", "c-libcurl"),
    ).toContain("CURLOPT_COPYPOSTFIELDS");
  });

  it("reports that cpr has no function for a custom verb", () => {
    expect(() =>
      generate("curl -X PURGE https://example.com", "cpp-cpr"),
    ).toThrowError(/has none for PURGE/u);
  });
});

describe("clients that refuse rather than silently follow a redirect", () => {
  it.each(["ocaml-cohttp", "crystal-httpclient"] as const)(
    "%s reports that it cannot follow redirects",
    (id) => {
      expect(() => generate("curl -L https://example.com", id)).toThrowError(
        /does not follow redirects/u,
      );
      // The default, non-following case still converts.
      expect(generate("curl https://example.com", id)).toContain(
        "https://example.com",
      );
    },
  );
});

describe("CFML", () => {
  it("leaves an ampersand alone; a cfhttp attribute is not XML", () => {
    // Entity-encoding here would corrupt every query string with two
    // parameters.
    expect(
      generate("curl 'https://example.com/a?x=1&y=2'", "cfml-cfhttp"),
    ).toContain("?x=1&y=2");
  });

  it("doubles a hash so CFML does not read it as an expression", () => {
    expect(
      generate("curl https://example.com -H 'X-Tag: #build'", "cfml-cfhttp"),
    ).toContain("##build");
  });

  it("reports a verb the method attribute does not accept", () => {
    expect(() =>
      generate("curl -X PURGE https://example.com", "cfml-cfhttp"),
    ).toThrowError(/method attribute accepts only/u);
  });
});

describe("Lua", () => {
  it("requires LuaSec only when the URL is https", () => {
    expect(generate("curl https://example.com", "lua-http")).toContain(
      'require("ssl.https")',
    );
    expect(generate("curl http://example.com", "lua-http")).toContain(
      'require("socket.http")',
    );
  });

  it("sets Content-Length, which LuaSocket will not add for a source body", () => {
    expect(generate("curl https://example.com -d 'a=1'", "lua-http")).toContain(
      '["Content-Length"] = tostring(#payload)',
    );
  });
});

describe("MATLAB", () => {
  it("falls back to sprintf for a value it cannot write as a char array", () => {
    // MATLAB char literals have no escapes and cannot span lines.
    const code = generate(
      "curl https://example.com -X POST -H 'Content-Type: text/plain' --data-raw 'first\nsecond'",
      "matlab-http",
    );
    expect(code).toContain("sprintf('first\\nsecond')");
  });

  it("doubles a quote in an ordinary char array", () => {
    expect(
      generate(`curl https://example.com -H "X-Q: it's"`, "matlab-http"),
    ).toContain("'it''s'");
  });

  it("reports that FileProvider cannot set a part media type", () => {
    expect(() =>
      generate(
        "curl https://example.com -F 'doc=@/tmp/a.pdf;type=application/pdf'",
        "matlab-http",
      ),
    ).toThrowError(/from the file's extension/u);
  });
});

describe("clients told not to throw on a non-2xx", () => {
  it.each([
    ["clojure-cljhttp", ":throw-exceptions false"],
    ["julia-http", "status_exception = false"],
    ["r-httr2", "req_error(is_error"],
  ] as const)("%s asks for the response rather than an error", (id, marker) => {
    expect(generate("curl https://example.com", id)).toContain(marker);
  });
});

describe("targets that keep repeated header names", () => {
  it.each([
    "c-libcurl",
    "clojure-cljhttp",
    "elixir-req",
    "perl-lwp",
    "julia-http",
    "scala-sttp",
    "cfml-cfhttp",
    "nim-httpclient",
    "crystal-httpclient",
    "matlab-http",
  ] as const)("%s sends both values", (id) => {
    const code = generate(
      "curl https://example.com -H 'X-A: one' -H 'X-A: two'",
      id,
    );
    expect(code).toContain("one");
    expect(code).toContain("two");
    // Some of these repeat the field name, others group the values under one
    // name; what matters is that neither value was dropped.
    expect(code).not.toBe(
      generate("curl https://example.com -H 'X-A: one'", id),
    );
  });
});
