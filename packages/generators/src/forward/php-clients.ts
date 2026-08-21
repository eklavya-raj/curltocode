import { requestUrl } from "@curltocode/core";
import type { Header, HttpRequest } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { phpString } from "./literal.js";

/** Symfony's own default redirect budget. */
const DEFAULT_MAX_REDIRECTS = 20;

/**
 * Group headers so a repeated name becomes an array value.
 *
 * Both Symfony's HttpClient and Guzzle (which backs Laravel's client) read an
 * array value as "send this field once per element", so both targets keep
 * duplicates that a flat map would lose.
 */
function headerEntries(
  headers: readonly Header[],
  indent: string,
): readonly string[] {
  const grouped = new Map<string, { name: string; values: string[] }>();
  for (const header of headers) {
    const key = header.name.toLowerCase();
    const existing = grouped.get(key);
    if (existing === undefined) {
      grouped.set(key, { name: header.name, values: [header.value] });
    } else {
      existing.values.push(header.value);
    }
  }
  return [...grouped.values()].map(({ name, values }) => {
    const value =
      values.length === 1
        ? phpString(values[0]!)
        : `[${values.map((entry) => phpString(entry)).join(", ")}]`;
    return `${indent}${phpString(name)} => ${value},`;
  });
}

/** PHP with Symfony's HttpClient component. */
export class SymfonyHttpClientGenerator implements CodeGenerator {
  readonly id = "php-symfony" as const;
  readonly language = "php" as const;
  readonly client = "symfony" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: false,
      cookieHeader: true,
    });
    const body = request.body;
    const multipart = body?.kind === "multipart";
    const uses = ["Symfony\\Component\\HttpClient\\HttpClient"];
    const prelude: string[] = [];
    const options: string[] = [];

    if (multipart) {
      // HttpClient has no multipart encoder of its own; symfony/mime builds the
      // part headers and the boundary.
      uses.push(
        "Symfony\\Component\\Mime\\Part\\DataPart",
        "Symfony\\Component\\Mime\\Part\\Multipart\\FormDataPart",
      );
      // A PHP array literal keeps the last value for a repeated key, so two
      // parts with the same name would silently become one. Symfony's own
      // array-valued form turns `tag` into `tag[0]` and `tag[1]`, which is a
      // different request, so this is refused rather than approximated.
      const seen = new Set<string>();
      for (const part of body.parts) {
        if (seen.has(part.name)) {
          throw new GeneratorError(
            `FormDataPart takes an array keyed by field name, so the repeated multipart field ${part.name} cannot be sent twice. Pick the cURL extension or Guzzle, which build the parts as a list.`,
            "GENERATOR_UNSUPPORTED_BODY",
          );
        }
        seen.add(part.name);
      }
      prelude.push("$formData = new FormDataPart([");
      for (const part of body.parts) {
        if (part.kind === "field") {
          prelude.push(
            `    ${phpString(part.name)} => ${phpString(part.value)},`,
          );
          continue;
        }
        const filename =
          part.filename ?? part.path.split("/").at(-1) ?? part.path;
        const type =
          part.contentType === undefined
            ? ""
            : `, ${phpString(part.contentType)}`;
        prelude.push(
          `    ${phpString(part.name)} => DataPart::fromPath(${phpString(part.path)}, ${phpString(filename)}${type}),`,
        );
      }
      prelude.push("]);", "");
      options.push(
        "    'headers' => array_merge(",
        "        $formData->getPreparedHeaders()->toArray(),",
        "        [",
        ...headerEntries(
          headers.filter(
            (header) => header.name.toLowerCase() !== "content-type",
          ),
          "            ",
        ),
        "        ],",
        "    ),",
        "    'body' => $formData->bodyToIterable(),",
      );
    } else {
      if (headers.length > 0) {
        options.push(
          "    'headers' => [",
          ...headerEntries(headers, "        "),
          "    ],",
        );
      }
      if (body !== undefined) {
        const payload =
          body.kind === "json" || body.kind === "form-urlencoded"
            ? phpString(body.raw)
            : body.kind === "text"
              ? phpString(body.value)
              : body.source.kind === "file"
                ? // A resource is streamed rather than read into memory.
                  `fopen(${phpString(body.source.path)}, 'r')`
                : phpString(body.source.value);
        options.push(`    'body' => ${payload},`);
      }
    }
    if (request.auth?.kind === "basic") {
      options.push(
        `    'auth_basic' => [${phpString(request.auth.username)}, ${phpString(request.auth.password)}],`,
      );
    }
    options.push(
      `    'max_redirects' => ${request.options.followRedirects ? DEFAULT_MAX_REDIRECTS : 0},`,
    );

    return {
      code: [
        "<?php",
        "",
        ...uses.sort().map((entry) => `use ${entry};`),
        "",
        "$client = HttpClient::create();",
        "",
        ...prelude,
        `$response = $client->request(${phpString(request.method)}, ${phpString(requestUrl(request))}, [`,
        ...options,
        "]);",
        "",
        // The false argument stops Symfony throwing on a 4xx or 5xx, which cURL
        // would simply have printed.
        "echo $response->getContent(false);",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: "composer require symfony/http-client symfony/mime",
    };
  }
}

/** PHP with Laravel's HTTP client, the `Http` facade over Guzzle. */
export class LaravelHttpGenerator implements CodeGenerator {
  readonly id = "php-laravel" as const;
  readonly language = "php" as const;
  readonly client = "laravel" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: false,
      cookieHeader: true,
    });
    const body = request.body;
    const chain: string[] = [];

    if (body?.kind === "multipart") {
      for (const part of body.parts) {
        if (part.kind === "field") {
          chain.push(
            `    ->attach(${phpString(part.name)}, ${phpString(part.value)})`,
          );
          continue;
        }
        const filename =
          part.filename ?? part.path.split("/").at(-1) ?? part.path;
        const partHeaders =
          part.contentType === undefined
            ? ""
            : `, ['Content-Type' => ${phpString(part.contentType)}]`;
        chain.push(
          `    ->attach(${phpString(part.name)}, file_get_contents(${phpString(part.path)}), ${phpString(filename)}${partHeaders})`,
        );
      }
    }
    if (headers.length > 0) {
      const applicable =
        body?.kind === "multipart"
          ? // Laravel writes the multipart Content-Type with its own boundary.
            headers.filter(
              (header) => header.name.toLowerCase() !== "content-type",
            )
          : headers;
      if (applicable.length > 0) {
        chain.push(
          "    ->withHeaders([",
          ...headerEntries(applicable, "        "),
          "    ])",
        );
      }
    }
    if (request.auth?.kind === "basic") {
      chain.push(
        `    ->withBasicAuth(${phpString(request.auth.username)}, ${phpString(request.auth.password)})`,
      );
    }
    if (body !== undefined && body.kind !== "multipart") {
      const contentType =
        headers.find((header) => header.name.toLowerCase() === "content-type")
          ?.value ?? "application/octet-stream";
      const payload =
        body.kind === "json" || body.kind === "form-urlencoded"
          ? phpString(body.raw)
          : body.kind === "text"
            ? phpString(body.value)
            : body.source.kind === "file"
              ? `file_get_contents(${phpString(body.source.path)})`
              : phpString(body.source.value);
      chain.push(`    ->withBody(${payload}, ${phpString(contentType)})`);
    }
    // Guzzle follows redirects by default, so only the non-following case needs
    // to say anything.
    if (!request.options.followRedirects) {
      chain.push("    ->withoutRedirecting()");
    }
    const send = `    ->send(${phpString(request.method)}, ${phpString(requestUrl(request))});`;

    return {
      code: [
        "<?php",
        "",
        "use Illuminate\\Support\\Facades\\Http;",
        "",
        ...(chain.length === 0
          ? [
              `$response = Http::send(${phpString(request.method)}, ${phpString(requestUrl(request))});`,
            ]
          : [
              // The first call in the chain is the static entry point on the
              // facade, so it loses the arrow the rest of the chain keeps.
              `$response = Http::${chain[0]!.trimStart().replace(/^->/u, "")}`,
              ...chain.slice(1),
              send,
            ]),
        "",
        "echo $response->body();",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: "composer require guzzlehttp/guzzle",
    };
  }
}
