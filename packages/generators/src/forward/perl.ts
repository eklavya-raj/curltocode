import { requestUrl } from "@curltocode/core";
import type { HttpRequest } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { perlString } from "./literal.js";

/** LWP::UserAgent's own default redirect budget. */
const DEFAULT_MAX_REDIRECT = 7;

/**
 * Perl with LWP::UserAgent.
 *
 * `push_header` appends, so a repeated header name is sent twice rather than
 * replaced.
 */
export class LwpGenerator implements CodeGenerator {
  readonly id = "perl-lwp" as const;
  readonly language = "perl" as const;
  readonly client = "lwp" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: false,
      cookieHeader: true,
    });
    const body = request.body;
    const uses = new Set(["HTTP::Request ()", "LWP::UserAgent ()"]);
    const lines: string[] = [];

    if (body?.kind === "multipart") {
      // HTTP::Request::Common builds the boundary and the part headers; doing
      // it by hand here would duplicate what the module already does well.
      uses.add("HTTP::Request::Common qw(POST)");
      const parts = body.parts.map((part) => {
        if (part.kind === "field") {
          return `    ${perlString(part.name)} => ${perlString(part.value)},`;
        }
        const filename =
          part.filename ?? part.path.split("/").at(-1) ?? part.path;
        const type =
          part.contentType === undefined
            ? ""
            : `, "Content-Type" => ${perlString(part.contentType)}`;
        return `    ${perlString(part.name)} => [${perlString(part.path)}, ${perlString(filename)}${type}],`;
      });
      lines.push(
        `my $request = POST(`,
        `  ${perlString(requestUrl(request))},`,
        `  "Content-Type" => "form-data",`,
        "  Content => [",
        ...parts.map((part) => `  ${part}`),
        "  ],",
        ");",
      );
      for (const header of headers) {
        lines.push(
          `$request->push_header(${perlString(header.name)} => ${perlString(header.value)});`,
        );
      }
    } else {
      lines.push(
        `my $request = HTTP::Request->new(${perlString(request.method)} => ${perlString(requestUrl(request))});`,
      );
      for (const header of headers) {
        lines.push(
          `$request->push_header(${perlString(header.name)} => ${perlString(header.value)});`,
        );
      }
      if (body?.kind === "binary" && body.source.kind === "file") {
        lines.push(
          "",
          `open(my $fh, "<:raw", ${perlString(body.source.path)}) or die $!;`,
          "my $payload = do { local $/; <$fh> };",
          "close($fh);",
          "$request->content($payload);",
        );
      } else if (body !== undefined) {
        const payload =
          body.kind === "json" || body.kind === "form-urlencoded"
            ? body.raw
            : body.kind === "text"
              ? body.value
              : body.kind === "binary" && body.source.kind === "inline"
                ? body.source.value
                : "";
        lines.push(`$request->content(${perlString(payload)});`);
      }
    }
    if (request.auth?.kind === "basic") {
      lines.push(
        `$request->authorization_basic(${perlString(request.auth.username)}, ${perlString(request.auth.password)});`,
      );
    }

    return {
      code: [
        "use strict;",
        "use warnings;",
        ...[...uses].sort().map((entry) => `use ${entry};`),
        "",
        `my $ua = LWP::UserAgent->new(max_redirect => ${request.options.followRedirects ? DEFAULT_MAX_REDIRECT : 0});`,
        "",
        ...lines,
        "",
        "my $response = $ua->request($request);",
        "print $response->decoded_content;",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: "cpanm LWP::UserAgent",
    };
  }
}
