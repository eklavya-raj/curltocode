import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { CURL_OPTIONS, CURL_OPTION_INDEX, parseCurl } from "../src/index.js";

/**
 * These tests are what turn "full cURL coverage" into a checkable claim.
 *
 * The table in `curl-options.ts` must account for every option the installed
 * cURL reports, and every entry must behave the way its classification says it
 * does. A new cURL release therefore shows up as a failing test rather than as
 * a command that is silently mishandled.
 */

/** Read the option surface straight from the installed binary. */
function installedCurlOptions(): readonly string[] | undefined {
  try {
    const help = execFileSync("curl", ["--help", "all"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const options = new Set<string>();
    for (const line of help.split("\n")) {
      // The short alias may be punctuation, as in `-:, --next` and `-#`.
      const match = /^\s+(?:-[a-zA-Z0-9#:],\s+)?(--[a-z0-9.-]+)/u.exec(line);
      if (match?.[1] !== undefined) options.add(match[1]);
    }
    return options.size === 0 ? undefined : [...options].sort();
  } catch {
    // cURL is not guaranteed to exist on a build agent.
    return undefined;
  }
}

const installed = installedCurlOptions();

describe("cURL option coverage", () => {
  it("classifies every option the installed cURL reports", () => {
    if (installed === undefined) {
      expect(CURL_OPTIONS.length).toBeGreaterThan(200);
      return;
    }
    const missing = installed.filter(
      (option) => !CURL_OPTION_INDEX.has(option),
    );
    expect(
      missing,
      `These cURL options are not classified in curl-options.ts. Add each one with the disposition that matches what it does:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("does not classify options the installed cURL does not have", () => {
    if (installed === undefined) return;
    const known = new Set(installed);
    // A stale entry is harmless at run time but means the table has drifted.
    const removed = CURL_OPTIONS.map(({ long }) => long).filter(
      (long) => !known.has(long),
    );
    expect(removed).toEqual([]);
  });

  it("gives every non-supported option a reason to show the user", () => {
    const silent = CURL_OPTIONS.filter(
      (option) =>
        (option.disposition === "warn" ||
          option.disposition === "unrepresentable") &&
        (option.reason === undefined || option.reason.length === 0),
    );
    expect(silent.map(({ long }) => long)).toEqual([]);
  });

  it("never leaves an option unclassified at parse time", () => {
    // Every option must produce a request, a warning, or a typed error that
    // names it. Nothing may be silently dropped or misread as the URL.
    const url = "https://api.example.com/resource";
    for (const option of CURL_OPTIONS) {
      // Supported options are exercised by their own tests. A placeholder
      // value is not a valid header, form field, or credential pair, so they
      // would fail here for reasons that say nothing about coverage.
      if (option.disposition === "supported") continue;
      const argument = option.takesValue === true ? " value" : "";
      const command = `curl ${option.long}${argument} '${url}'`;
      let outcome: "parsed" | "warned" | "rejected";
      try {
        const result = parseCurl(command);
        expect(result.request.url).toBe(url);
        outcome = result.warnings.length > 0 ? "warned" : "parsed";
      } catch (error) {
        expect(error, `${option.long} threw a non-Error value`).toBeInstanceOf(
          Error,
        );
        expect(
          (error as Error).message,
          `${option.long} was rejected without naming itself`,
        ).toContain(option.long);
        outcome = "rejected";
      }
      const expected =
        option.disposition === "protocol" ||
        option.disposition === "unrepresentable"
          ? "rejected"
          : option.disposition === "warn"
            ? "warned"
            : "parsed";
      expect(
        outcome,
        `${option.long} is classified "${option.disposition}" but ${outcome}`,
      ).toBe(expected);
    }
  });
});

describe("newly supported HTTP options", () => {
  const request = (input: string) => parseCurl(input).request;

  it("treats --data-ascii as a plain --data alias", () => {
    expect(
      request("curl --data-ascii 'a=1' https://example.com").body,
    ).toMatchObject({ kind: "form-urlencoded", raw: "a=1" });
  });

  it("reads --oauth2-bearer as bearer auth", () => {
    expect(
      request("curl --oauth2-bearer tok123 https://example.com").auth,
    ).toEqual({ kind: "bearer", token: "tok123" });
  });

  it("adds the byte unit -r omits", () => {
    expect(request("curl -r 0-1023 https://example.com").headers).toEqual([
      { name: "Range", value: "bytes=0-1023" },
    ]);
    expect(
      request("curl --range 'items=1-2' https://example.com").headers,
    ).toEqual([{ name: "Range", value: "items=1-2" }]);
  });

  it("maps -z onto the conditional header its sign selects", () => {
    expect(request("curl -z '1 Jan 2026' https://example.com").headers).toEqual(
      [{ name: "If-Modified-Since", value: "1 Jan 2026" }],
    );
    expect(
      request("curl -z '-1 Jan 2026' https://example.com").headers,
    ).toEqual([{ name: "If-Unmodified-Since", value: "1 Jan 2026" }]);
  });

  it("rejects -z when it would have to stat a file", () => {
    expect(() =>
      parseCurl("curl -z @somefile https://example.com"),
    ).toThrowError(/read from disk/u);
  });

  it("keeps --form-string values literal", () => {
    // A leading @ is data for -F but text for --form-string.
    expect(
      request("curl --form-string 'note=@notafile' https://example.com").body,
    ).toMatchObject({
      kind: "multipart",
      parts: [{ kind: "field", name: "note", value: "@notafile" }],
    });
  });
});

describe("errors that explain themselves", () => {
  it("names the protocol when an option belongs to another one", () => {
    expect(() => parseCurl("curl --ftp-pasv ftp://example.com")).toThrowError(
      /protocol other than HTTP/u,
    );
    expect(() =>
      parseCurl("curl --mail-from a@b.test https://example.com"),
    ).toThrowError(/protocol other than HTTP/u);
  });

  it("explains why an HTTP option still cannot be converted", () => {
    expect(() =>
      parseCurl("curl --aws-sigv4 aws:amz https://example.com"),
    ).toThrowError(/computes a signature/u);
    expect(() => parseCurl("curl --digest https://example.com")).toThrowError(
      /server challenge/u,
    );
    expect(() => parseCurl("curl --netrc https://example.com")).toThrowError(
      /\.netrc file/u,
    );
    expect(() => parseCurl("curl --next https://example.com")).toThrowError(
      /more than one request/u,
    );
  });
});
