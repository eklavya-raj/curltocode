import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseCurl } from "../src/index.js";

interface ValidFixture {
  readonly file: string;
  readonly method: string;
  readonly bodyKind: string | null;
}

interface InvalidFixture {
  readonly file: string;
  readonly code: string;
}

interface FixtureManifest {
  readonly valid: readonly ValidFixture[];
  readonly invalid: readonly InvalidFixture[];
}

const fixtureDirectory = new URL(
  "../../../tests/fixtures/curl/",
  import.meta.url,
);
const manifest = JSON.parse(
  readFileSync(new URL("manifest.json", fixtureDirectory), "utf8"),
) as FixtureManifest;

function fixture(file: string): string {
  return readFileSync(new URL(file, fixtureDirectory), "utf8").trimEnd();
}

describe("shared cURL fixture corpus", () => {
  for (const entry of manifest.valid) {
    it(`parses ${entry.file}`, () => {
      const parsed = parseCurl(fixture(entry.file)).request;
      expect(parsed.method).toBe(entry.method);
      expect(parsed.body?.kind ?? null).toBe(entry.bodyKind);
    });
  }

  for (const entry of manifest.invalid) {
    it(`returns a controlled error for ${entry.file}`, () => {
      expect(() => parseCurl(fixture(entry.file))).toThrowError(
        expect.objectContaining({ code: entry.code }),
      );
    });
  }
});
