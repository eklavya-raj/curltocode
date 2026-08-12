import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  CurlToCodeError,
  CurlTokenizeError,
  parseCurl,
  tokenizeCurl,
} from "../src/index.js";

const hostileString = fc.oneof(
  fc.string({ maxLength: 300 }),
  fc.constantFrom(
    "こんにちは नमस्ते 😀",
    "'\"\\\r\n\u0000",
    "Authorization: Bearer local-secret",
    "--data-urlencode \ud800",
  ),
);

function quotePosix(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

describe("tokenizer properties", () => {
  it("round-trips arbitrary quoted token values", () => {
    fc.assert(
      fc.property(hostileString, (value) => {
        const tokens = tokenizeCurl(`curl ${quotePosix(value)}`);
        expect(tokens.map((token) => token.value)).toEqual(["curl", value]);
      }),
      { numRuns: 500 },
    );
  });

  it("returns tokens or a controlled tokenizer error for arbitrary input", () => {
    fc.assert(
      fc.property(hostileString, (value) => {
        try {
          const tokens = tokenizeCurl(value);
          let previousEnd = 0;
          for (const token of tokens) {
            expect(token.start).toBeGreaterThanOrEqual(previousEnd);
            expect(token.end).toBeGreaterThanOrEqual(token.start);
            expect(token.end).toBeLessThanOrEqual(value.length);
            previousEnd = token.end;
          }
        } catch (error) {
          expect(error).toBeInstanceOf(CurlTokenizeError);
        }
      }),
      { numRuns: 1_000 },
    );
  });
});

describe("parser properties", () => {
  it("returns a request or a controlled domain error for arbitrary input", () => {
    fc.assert(
      fc.property(hostileString, (value) => {
        try {
          const result = parseCurl(value);
          expect(result.request.method.length).toBeGreaterThan(0);
          expect(result.request.url).toMatch(/^https?:\/\//u);
        } catch (error) {
          expect(error).toBeInstanceOf(CurlToCodeError);
        }
      }),
      { numRuns: 1_000 },
    );
  });

  it("preserves ordered duplicate query parameters", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.stringMatching(/^[a-z]{1,8}$/u),
            fc.stringMatching(/^[a-z0-9]{0,12}$/u),
          ),
          { maxLength: 20 },
        ),
        (parameters) => {
          const query = new URLSearchParams(parameters).toString();
          const parsed = parseCurl(
            `curl ${quotePosix(`https://example.com/${query.length === 0 ? "" : `?${query}`}`)}`,
          ).request;
          expect(parsed.query).toEqual(
            parameters.map(([name, value]) => ({ name, value })),
          );
        },
      ),
      { numRuns: 300 },
    );
  });
});
