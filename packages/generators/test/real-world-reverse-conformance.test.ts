import {
  normalizeRequest,
  parseCurl,
  requestsAreSemanticallyEqual,
} from "@curltocode/core";
import { describe, expect, it } from "vitest";

import {
  GeneratorError,
  generateCode,
  generatorTargets,
  reverseTargets,
  targetsThatAlwaysFollowRedirects,
  targetsWithoutRedirectPolicy,
} from "../src/index.js";
import type { HttpRequest } from "@curltocode/core";
import { parseCodeRequest } from "../src/reverse/index.js";
import { REAL_WORLD_REQUESTS } from "./real-world-fixtures.js";

const REVERSE_REQUESTS = {
  search: REAL_WORLD_REQUESTS.search.replace("curl ", "curl -L "),
  accountPatch: REAL_WORLD_REQUESTS.accountPatch,
  basicAuth: REAL_WORLD_REQUESTS.basicAuth,
  oauthForm: REAL_WORLD_REQUESTS.oauthForm,
  webhookText: REAL_WORLD_REQUESTS.webhookText,
  inlineBinary: REAL_WORLD_REQUESTS.inlineBinary,
  deleteWithTrace: REAL_WORLD_REQUESTS.deleteWithTrace,
  multipartFields: `curl 'https://api.example.com/v1/imports' \
  -F 'source=mobile' \
  -F 'tag=alpha' \
  -F 'tag=beta'`,
} as const;

/** Compare everything except the redirect policy. */
const withoutRedirectPolicy = (request: HttpRequest): HttpRequest => ({
  ...request,
  options: { ...request.options, followRedirects: false },
});

describe.each(reverseTargets)(
  "$language-$client real-world reverse conformance",
  (target) => {
    const alwaysFollows = targetsThatAlwaysFollowRedirects.includes(
      target.client,
    );
    const carriesRedirectPolicy =
      !alwaysFollows && !targetsWithoutRedirectPolicy.includes(target.client);
    const generator = generatorTargets.find(
      ({ language, client }) =>
        language === target.language && client === target.client,
    );
    if (generator === undefined) {
      throw new Error(
        `Missing forward generator for ${target.language}/${target.client}.`,
      );
    }

    it.each(Object.entries(REVERSE_REQUESTS))(
      "round-trips %s without semantic loss",
      (_name, command) => {
        const original = parseCurl(command).request;
        let source: string;
        try {
          source = generateCode(original, generator.id).code;
        } catch (error) {
          // A client with no stable API for this capability reports a typed
          // error rather than emitting something lossy. There is nothing to
          // round-trip, but the refusal itself must stay deliberate.
          expect(error).toBeInstanceOf(GeneratorError);
          expect((error as GeneratorError).code).toMatch(/^GENERATOR_/u);
          return;
        }
        const recovered = parseCodeRequest(source, target.parserLanguage);

        expect(recovered.client).toBe(target.client);
        if (alwaysFollows) {
          // The client follows a 3xx and cannot be told not to, so the code
          // really does say "follows" whatever the original command asked for.
          // Asserting the recovered value keeps that from turning into a
          // parser that simply dropped the field.
          expect(recovered.request.options.followRedirects).toBe(true);
        } else if (!carriesRedirectPolicy) {
          // The format has no field for it, so the recovered request keeps the
          // default instead of guessing. Asserting that here keeps the
          // exemption from quietly covering a parser that simply lost the
          // value; everything else still has to survive intact.
          expect(recovered.request.options.followRedirects).toBe(false);
        }
        const left = carriesRedirectPolicy
          ? original
          : withoutRedirectPolicy(original);
        const right = carriesRedirectPolicy
          ? recovered.request
          : withoutRedirectPolicy(recovered.request);
        expect(
          requestsAreSemanticallyEqual(left, right),
          JSON.stringify(
            {
              target,
              source,
              original: normalizeRequest(left),
              recovered: normalizeRequest(right),
            },
            null,
            2,
          ),
        ).toBe(true);
      },
    );
  },
);
