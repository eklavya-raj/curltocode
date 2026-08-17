import { supportedReverseTargets } from "curltocode";
import { describe, expect, it } from "vitest";

import { renderReverseExamples } from "../src/lib/examples.js";

/**
 * Converter pages render their examples at build time by generating source and
 * then parsing it back. When the wrong parser is chosen for a target, the page
 * still builds: every example simply falls back to its error text, and the
 * failure ships as page content rather than breaking the build. This asserts
 * the round trip actually completes for every target the site publishes.
 */
describe("reverse example rendering", () => {
  it.each(supportedReverseTargets)(
    "renders real $language $client source rather than a parser error",
    async ({ language, client }) => {
      const examples = await renderReverseExamples({ language, client });
      const get = examples.find((example) => example.id === "get");
      expect(get?.limitation).toBeUndefined();
      expect(get?.code).toBeTruthy();
      expect(get?.curl).toContain("curl");
    },
  );
});
