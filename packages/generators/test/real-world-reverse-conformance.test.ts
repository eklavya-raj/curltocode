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
} from "../src/index.js";
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

describe.each(reverseTargets)(
  "$language-$client real-world reverse conformance",
  (target) => {
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
        expect(
          requestsAreSemanticallyEqual(original, recovered.request),
          JSON.stringify(
            {
              target,
              source,
              original: normalizeRequest(original),
              recovered: normalizeRequest(recovered.request),
            },
            null,
            2,
          ),
        ).toBe(true);
      },
    );
  },
);
