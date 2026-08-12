import { requestUrl } from "@curltocode/core";
import type { HttpRequest, RequestBody } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { phpString } from "./literal.js";

function postFields(body: RequestBody): string {
  if (body.kind === "json" || body.kind === "form-urlencoded")
    return phpString(body.raw);
  if (body.kind === "text") return phpString(body.value);
  if (body.kind === "multipart") {
    const entries = body.parts.map((part) => {
      if (part.kind === "field")
        return `        ${phpString(part.name)} => ${phpString(part.value)},`;
      const filename =
        part.filename ?? part.path.split("/").at(-1) ?? part.path;
      const args = [phpString(part.path)];
      // CURLFile takes the media type before the posted filename, so a filename
      // override requires an explicit (possibly empty) media type argument.
      args.push(phpString(part.contentType ?? ""), phpString(filename));
      return `        ${phpString(part.name)} => new CURLFile(${args.join(", ")}),`;
    });
    return ["[", ...entries, "    ]"].join("\n");
  }
  if (body.source.kind === "inline") return phpString(body.source.value);
  return `file_get_contents(${phpString(body.source.path)})`;
}

export class PhpGenerator implements CodeGenerator {
  readonly id = "php-curl" as const;
  readonly language = "php" as const;
  readonly client = "curl" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: false,
      cookieHeader: false,
    });
    const options: string[] = [
      `    CURLOPT_URL => ${phpString(requestUrl(request))},`,
      "    CURLOPT_RETURNTRANSFER => true,",
      `    CURLOPT_CUSTOMREQUEST => ${phpString(request.method)},`,
      `    CURLOPT_FOLLOWLOCATION => ${request.options.followRedirects ? "true" : "false"},`,
    ];

    if (headers.length > 0) {
      options.push(
        "    CURLOPT_HTTPHEADER => [",
        // A list of raw header lines preserves repeated header names exactly.
        ...headers.map(
          (header) =>
            `        ${phpString(`${header.name}: ${header.value}`)},`,
        ),
        "    ],",
      );
    }
    if (request.cookies.length > 0) {
      options.push(
        `    CURLOPT_COOKIE => ${phpString(
          request.cookies
            .map((cookie) => `${cookie.name}=${cookie.value}`)
            .join("; "),
        )},`,
      );
    }
    if (request.auth?.kind === "basic") {
      options.push(
        "    CURLOPT_HTTPAUTH => CURLAUTH_BASIC,",
        `    CURLOPT_USERPWD => ${phpString(
          `${request.auth.username}:${request.auth.password}`,
        )},`,
      );
    }
    if (request.body !== undefined)
      options.push(`    CURLOPT_POSTFIELDS => ${postFields(request.body)},`);

    return {
      code: [
        "<?php",
        "",
        "$curl = curl_init();",
        "",
        "curl_setopt_array($curl, [",
        ...options,
        "]);",
        "",
        "$response = curl_exec($curl);",
        "$error = curl_error($curl);",
        "",
        "curl_close($curl);",
        "",
        "if ($error !== '') {",
        '    throw new RuntimeException("cURL request failed: " . $error);',
        "}",
        "",
        "echo $response;",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: "Requires the PHP cURL extension (ext-curl).",
    };
  }
}
