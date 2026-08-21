import { requestUrl } from "@curltocode/core";
import type { HttpRequest, RequestBody } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { shellArgument, shellOption } from "./shell.js";

/**
 * GNU Wget's default redirect budget. The policy is always written out rather
 * than left implicit so that the generated command states the behaviour it
 * relies on instead of inheriting whatever the local wget defaults to.
 */
const DEFAULT_MAX_REDIRECT = 20;

function bodyOptions(body: RequestBody | undefined): readonly string[] {
  if (body === undefined) return [];
  if (body.kind === "multipart") {
    throw new GeneratorError(
      "GNU Wget has no multipart/form-data support: --body-data sends a single flat payload and cannot build the part boundaries this request needs.",
      "GENERATOR_CLIENT_LIMITATION",
    );
  }
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return [shellOption("--body-data=", body.raw)];
  }
  if (body.kind === "text") return [shellOption("--body-data=", body.value)];
  return body.source.kind === "file"
    ? [shellOption("--body-file=", body.source.path)]
    : [shellOption("--body-data=", body.source.value)];
}

export class WgetGenerator implements CodeGenerator {
  readonly id = "wget-cli" as const;
  readonly language = "wget" as const;
  readonly client = "cli" as const;

  generate(request: HttpRequest): GeneratedCode {
    // Wget appends every --header verbatim in the order given, so unlike a
    // mapping-based client it does preserve repeated header names.
    const headers = materializeHeaders(request, {
      basicAuthHeader: false,
      cookieHeader: true,
    });

    const options: string[] = [];
    if (request.method !== "GET") options.push(`--method=${request.method}`);
    for (const header of headers) {
      options.push(shellOption("--header=", `${header.name}: ${header.value}`));
    }
    if (request.auth?.kind === "basic") {
      options.push(
        shellOption("--user=", request.auth.username),
        shellOption("--password=", request.auth.password),
        // Without this wget waits to be challenged before sending credentials,
        // where cURL's -u sends them on the first request.
        "--auth-no-challenge",
      );
    }
    options.push(...bodyOptions(request.body));
    options.push(
      `--max-redirect=${request.options.followRedirects ? DEFAULT_MAX_REDIRECT : 0}`,
    );
    const parts = [
      // Wget writes to a file named after the URL by default; `-O -` makes it
      // behave like cURL and print the response body instead.
      `wget -O - ${shellArgument(requestUrl(request))}`,
      ...options,
    ];
    return {
      code: parts.join(" \\\n  "),
      language: this.language,
      client: this.client,
    };
  }
}
