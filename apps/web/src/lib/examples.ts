import type { CurlToCodeOptions, ReverseLanguage } from "curltocode";
import { convert, parseCode, requestToCurl } from "curltocode";

/**
 * Canonical example requests shown on every converter page.
 *
 * The rendered code is produced by the real generators at build time, so page
 * content cannot drift from what the converter actually emits.
 */
export interface ExampleScenario {
  readonly id: string;
  readonly heading: string;
  readonly summary: string;
  readonly curl: string;
}

export const SCENARIOS: readonly ExampleScenario[] = [
  {
    id: "get",
    heading: "GET with query parameters and headers",
    summary:
      "Query parameters stay in the order cURL parsed them, and repeated names are preserved rather than collapsed.",
    curl: "curl 'https://api.example.com/users?page=2&role=admin' \\\n  -H 'Accept: application/json'",
  },
  {
    id: "post-json",
    heading: "POST a JSON body",
    summary:
      "The original bytes of the JSON body are preserved, so formatting and key order survive the conversion.",
    curl: "curl 'https://api.example.com/users' \\\n  -X POST \\\n  -H 'Content-Type: application/json' \\\n  --data-raw '{\"name\":\"Ada\",\"active\":true}'",
  },
  {
    id: "auth",
    heading: "Bearer and basic authentication",
    summary:
      "Credentials are mapped to whichever authentication facility the client provides natively.",
    curl: "curl 'https://api.example.com/me' \\\n  -H 'Authorization: Bearer sk_test_123' \\\n  -b 'session=abc'",
  },
  {
    id: "form",
    heading: "URL-encoded form submission",
    summary:
      "Form pairs keep their encoded byte sequence so the server receives exactly what cURL would have sent.",
    curl: "curl 'https://api.example.com/login' \\\n  -d 'user=ada' \\\n  -d 'password=hunter2'",
  },
  {
    id: "multipart",
    heading: "Multipart upload with a file",
    summary:
      "Text fields and file parts are represented separately, keeping the posted filename and media type.",
    curl: "curl 'https://api.example.com/avatars' \\\n  -F 'note=profile photo' \\\n  -F 'file=@avatar.png;type=image/png'",
  },
];

export interface RenderedExample extends ExampleScenario {
  /** Generated source, or `undefined` when the client cannot represent it. */
  readonly code: string | undefined;
  /** Explanation emitted by the generator when the conversion is rejected. */
  readonly limitation: string | undefined;
}

/**
 * Render every scenario for one target. A generator that rejects a scenario
 * yields its limitation message instead, which is itself useful page content.
 */
export function renderExamples(
  options: CurlToCodeOptions,
): readonly RenderedExample[] {
  return SCENARIOS.map((scenario) => {
    try {
      return {
        ...scenario,
        code: convert(scenario.curl, options),
        limitation: undefined,
      };
    } catch (error) {
      return {
        ...scenario,
        code: undefined,
        limitation:
          error instanceof Error
            ? error.message
            : "This request cannot be represented by this client.",
      };
    }
  });
}

/**
 * Build reverse examples through both production paths: the real forward
 * generator provides idiomatic source, then the AST parser turns that source
 * back into the normalized request consumed by the cURL generator.
 */
export async function renderReverseExamples(
  options: CurlToCodeOptions,
): Promise<readonly RenderedExample[]> {
  const parserLanguage: ReverseLanguage =
    options.language === "python" ? "python" : "javascript";

  return Promise.all(
    SCENARIOS.map(async (scenario) => {
      try {
        const code = convert(scenario.curl, options);
        const parsed = await parseCode(code, parserLanguage);
        return {
          ...scenario,
          curl: requestToCurl(parsed.request),
          code,
          limitation: undefined,
        };
      } catch (error) {
        return {
          ...scenario,
          code: undefined,
          limitation:
            error instanceof Error
              ? error.message
              : "This request cannot be represented by this client.",
        };
      }
    }),
  );
}
