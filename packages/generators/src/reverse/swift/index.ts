import { parseMultipartBody } from "../http/index.js";
import { RequestBuilder } from "../shared/assemble.js";
import { readChain, resolveValue } from "../shared/chain.js";
import type { SourceCall } from "../shared/chain.js";
import { asPairs, asString } from "../shared/values.js";
import type { StaticValue } from "../shared/values.js";
import { CodeParseError } from "../types.js";
import type { ReverseClient, ReverseParseResult } from "../types.js";

/**
 * Recover an HTTP request from Swift source using URLSession or Alamofire.
 *
 * URLSession configures a `URLRequest` value through property assignments and
 * `setValue(_:forHTTPHeaderField:)`, and has no multipart encoder, so a form
 * arrives as bytes appended to a `Data` buffer. Alamofire wraps the same
 * `URLRequest` and adds its own multipart builder.
 */

const SWIFT_TRAITS = {
  lineComments: ["//"],
  transparentCalls: [
    // `Data("body".utf8)` and `URL(string: "...")` both carry their payload as
    // the first argument, and `.utf8` is a view of the string it is taken from.
    "Data",
    "URL",
    "URLRequest",
    "utf8",
    "String",
  ],
  bindingKeywords: ["let", "var"],
} as const;

/**
 * A leading-dot enum member such as `.patch`.
 *
 * Swift infers the type, so the member appears with nothing in front of it and
 * reaches the value model as its own source text.
 */
function dotCase(value: StaticValue | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.kind === "identifier") return value.name.split(".").at(-1);
  return value.kind === "unresolved" &&
    /^\.[A-Za-z_][A-Za-z0-9_]*$/u.test(value.source)
    ? value.source.slice(1)
    : undefined;
}

function detectClient(source: string): ReverseClient {
  return /\bAlamofire\b|\bAF\./u.test(source) ? "alamofire" : "urlsession";
}

export function parseSwiftRequest(source: string): ReverseParseResult {
  const { calls, assignments, bindings } = readChain(source, SWIFT_TRAITS);
  const client = detectClient(source);
  const builder = new RequestBuilder(client);
  // URLSession needs a task delegate to decline a redirect, and Alamofire uses
  // a redirect handler. Both are stated outright in the source when present.
  builder.followRedirects = !(
    /willPerformHTTPRedirection/u.test(source) ||
    /\.doNotFollow\b/u.test(source)
  );

  const value = (call: SourceCall, index: number): StaticValue | undefined => {
    const argument = call.args[index];
    return argument === undefined
      ? undefined
      : resolveValue(argument, bindings);
  };

  /** Chunks appended to a `Data` buffer, which is how a form is written. */
  const appended: string[] = [];

  for (const call of calls) {
    switch (call.method) {
      case "URLRequest": {
        const url = asString(
          call.keywords.get("url") === undefined
            ? (value(call, 0) ?? { kind: "null" })
            : resolveValue(call.keywords.get("url") as StaticValue, bindings),
        );
        if (url !== undefined) {
          builder.url = url;
          builder.found = true;
        }
        // Alamofire's initializer also takes the method and the headers.
        const method = dotCase(
          call.keywords.get("method") === undefined
            ? undefined
            : resolveValue(
                call.keywords.get("method") as StaticValue,
                bindings,
              ),
        );
        if (method !== undefined) builder.method = method.toUpperCase();
        const headers = call.keywords.get("headers");
        const pairs =
          headers === undefined
            ? undefined
            : asPairs(resolveValue(headers, bindings));
        for (const pair of pairs ?? []) builder.header(pair.name, pair.value);
        break;
      }
      case "setValue":
      case "addValue": {
        // Swift names the field second: setValue(_ value:, forHTTPHeaderField:)
        if (call.args.length < 2) break;
        builder.headerFrom(
          value(call, 1),
          value(call, 0),
          call.path,
          call.method === "setValue",
        );
        break;
      }
      case "append": {
        // Alamofire's multipart form names the field; a Data buffer does not.
        const name = call.keywords.get("withName");
        if (name === undefined) {
          const chunk = value(call, 0);
          const text = chunk === undefined ? undefined : asString(chunk);
          if (text !== undefined) appended.push(text);
          break;
        }
        const partName = asString(resolveValue(name, bindings));
        const partValue = value(call, 0);
        const text = partValue === undefined ? undefined : asString(partValue);
        if (partName !== undefined && text !== undefined) {
          builder.parts.push({ name: partName, value: text });
        }
        break;
      }
      case "upload":
      case "request": {
        if (client !== "alamofire") break;
        builder.found = true;
        // `AF.request(url, method:, headers:)` names the URL first, while
        // `AF.upload(multipartFormData:, to:, method:)` names it `to`.
        const to = call.keywords.get("to");
        const target =
          to === undefined
            ? asString(value(call, 0) ?? { kind: "null" })
            : asString(resolveValue(to, bindings));
        if (target !== undefined) builder.url = target;
        const inline = call.keywords.get("headers");
        const inlinePairs =
          inline === undefined
            ? undefined
            : asPairs(resolveValue(inline, bindings));
        for (const pair of inlinePairs ?? []) {
          builder.header(pair.name, pair.value);
        }
        const method = dotCase(
          call.keywords.get("method") === undefined
            ? undefined
            : resolveValue(
                call.keywords.get("method") as StaticValue,
                bindings,
              ),
        );
        if (method !== undefined) builder.method = method.toUpperCase();
        break;
      }
      default:
        break;
    }
  }

  for (const entry of assignments) {
    const target = entry.target.split(".").at(-1) ?? "";
    const resolved = resolveValue(entry.value, bindings);
    if (target === "httpMethod") {
      const text = asString(resolved);
      if (text !== undefined) builder.method = text.toUpperCase();
      continue;
    }
    if (target === "httpBody") {
      const text = asString(resolved);
      // `request.httpBody = body` points at the Data buffer the form was
      // appended to, which is handled below.
      if (text !== undefined) builder.bodyText = text;
      continue;
    }
  }

  if (appended.length > 0 && builder.parts.length === 0) {
    const payload = appended.join("");
    const declared = builder.headers.find(
      (header) => header.name.toLowerCase() === "content-type",
    )?.value;
    const boundary = /boundary=("?)([^";]+)\1/u.exec(declared ?? "")?.[2];
    const parts =
      boundary === undefined
        ? undefined
        : parseMultipartBody(payload.replaceAll("\r\n", "\n"), boundary);
    if (parts === undefined) {
      builder.bodyText = payload;
    } else {
      for (const part of parts) builder.parts.push(part);
      // The boundary belongs to this message, not to the request.
      const index = builder.headers.findIndex(
        (header) => header.name.toLowerCase() === "content-type",
      );
      if (index >= 0) builder.headers.splice(index, 1);
    }
  }

  if (!builder.found) {
    throw new CodeParseError(
      "No supported Swift request was found. Reverse conversion reads URLRequest with URLSession, and Alamofire.",
    );
  }
  if (builder.method === undefined) builder.method = "GET";
  return builder.build();
}
