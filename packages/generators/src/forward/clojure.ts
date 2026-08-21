import { requestUrl } from "@curltocode/core";
import type { Header, HttpRequest } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { clojureString } from "./literal.js";

/**
 * Group headers so a repeated name becomes a vector value, which is how
 * clj-http asks for a field to be sent more than once.
 */
function headerMap(headers: readonly Header[]): readonly string[] {
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
        ? clojureString(values[0]!)
        : `[${values.map((entry) => clojureString(entry)).join(" ")}]`;
    return `             ${clojureString(name)} ${value}`;
  });
}

/** Clojure with clj-http. */
export class CljHttpGenerator implements CodeGenerator {
  readonly id = "clojure-cljhttp" as const;
  readonly language = "clojure" as const;
  readonly client = "cljhttp" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: false,
      cookieHeader: true,
    });
    const body = request.body;
    const requires = ["[clj-http.client :as client]"];
    const entries = [
      `   {:method :${request.method.toLowerCase()}`,
      `    :url ${clojureString(requestUrl(request))}`,
    ];
    const applicable =
      body?.kind === "multipart"
        ? headers.filter(
            (header) => header.name.toLowerCase() !== "content-type",
          )
        : headers;
    if (applicable.length > 0) {
      entries.push(
        ["    :headers {", ...headerMap(applicable), "             }"].join(
          "\n",
        ),
      );
    }
    if (request.auth?.kind === "basic") {
      entries.push(
        `    :basic-auth [${clojureString(request.auth.username)} ${clojureString(request.auth.password)}]`,
      );
    }
    if (body?.kind === "multipart") {
      requires.push("[clojure.java.io :as io]");
      const parts = body.parts.map((part) => {
        if (part.kind === "field") {
          return `                 {:name ${clojureString(part.name)} :content ${clojureString(part.value)}}`;
        }
        const filename =
          part.filename ?? part.path.split("/").at(-1) ?? part.path;
        const type =
          part.contentType === undefined
            ? ""
            : ` :mime-type ${clojureString(part.contentType)}`;
        return `                 {:name ${clojureString(part.name)} :content (io/file ${clojureString(part.path)}) :filename ${clojureString(filename)}${type}}`;
      });
      entries.push(
        ["    :multipart [", ...parts, "                ]"].join("\n"),
      );
    } else if (body !== undefined) {
      if (body.kind === "binary" && body.source.kind === "file") {
        requires.push("[clojure.java.io :as io]");
        entries.push(`    :body (io/file ${clojureString(body.source.path)})`);
      } else {
        const payload =
          body.kind === "json" || body.kind === "form-urlencoded"
            ? body.raw
            : body.kind === "text"
              ? body.value
              : body.kind === "binary" && body.source.kind === "inline"
                ? body.source.value
                : "";
        entries.push(`    :body ${clojureString(payload)}`);
      }
    }
    entries.push(
      `    :follow-redirects ${request.options.followRedirects}`,
      // clj-http raises on any non-2xx by default; cURL prints the response.
      "    :throw-exceptions false}",
    );

    return {
      code: [
        `(require '${[...new Set(requires)].join("\n         '")})`,
        "",
        "(def response",
        "  (client/request",
        ...entries,
        "))",
        "",
        "(println (:body response))",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: 'clj-http/clj-http {:mvn/version "3.13.1"}',
    };
  }
}
