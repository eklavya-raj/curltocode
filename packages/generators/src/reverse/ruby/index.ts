import { RequestBuilder } from "../shared/assemble.js";
import { readChain, resolveValue } from "../shared/chain.js";
import type { SourceCall } from "../shared/chain.js";
import { asPairs, asString } from "../shared/values.js";
import type { StaticValue } from "../shared/values.js";
import { CodeParseError } from "../types.js";
import type { ReverseClient, ReverseParseResult } from "../types.js";

/**
 * Recover an HTTP request from Ruby source using Net::HTTP or Faraday.
 *
 * Net::HTTP names the verb in the request class, sets headers through method
 * calls and subscript assignment, and takes the body as a property. Faraday
 * passes everything to one call. Both are read through the shared chain reader.
 */

const RUBY_TRAITS = {
  // Ruby comments start with #, and single quotes take almost no escapes.
  lineComments: ["#"],
  literalStringQuotes: ["'"],
  transparentCalls: ["URI", "URI.parse", "to_sym", "to_s", "JSON.generate"],
} as const;

/** `Net::HTTP::Post` and friends carry the verb in the final segment. */
const NET_HTTP_CLASSES: ReadonlyMap<string, string> = new Map([
  ["Get", "GET"],
  ["Post", "POST"],
  ["Put", "PUT"],
  ["Patch", "PATCH"],
  ["Delete", "DELETE"],
  ["Head", "HEAD"],
  ["Options", "OPTIONS"],
]);

function detectClient(source: string): ReverseClient {
  // `run_request` is Faraday's own API, and the require line is lower case,
  // so neither alone should be missed.
  return /faraday/iu.test(source) || /\brun_request\s*\(/u.test(source)
    ? "faraday"
    : "nethttp";
}

export function parseRubyRequest(source: string): ReverseParseResult {
  const { calls, assignments, bindings } = readChain(source, RUBY_TRAITS);
  const client = detectClient(source);
  const builder = new RequestBuilder(client);
  // Net::HTTP never follows redirects on its own, and Faraday only does so
  // when the follow_redirects middleware is installed. The flag is therefore
  // off unless the source opts in.
  builder.followRedirects = /follow_redirects/u.test(source);

  const value = (call: SourceCall, index: number): StaticValue | undefined => {
    const argument = call.args[index];
    return argument === undefined
      ? undefined
      : resolveValue(argument, bindings);
  };

  // A URI built once and passed to the request supplies the URL.
  let uri: string | undefined;
  for (const [name, bound] of bindings) {
    const text = asString(resolveValue(bound, bindings));
    if (text !== undefined && /^https?:\/\//u.test(text)) {
      uri ??= text;
      if (name === "uri") uri = text;
    }
  }

  for (const call of calls) {
    // `Net::HTTP::Post.new(uri)` names the verb in the class path.
    if (call.method === "new") {
      const segments = call.path.split(/[:.]+/u).filter(Boolean);
      const verb = segments.at(-2);
      const mapped =
        verb === undefined ? undefined : NET_HTTP_CLASSES.get(verb);
      if (mapped !== undefined) {
        builder.method = mapped;
        builder.found = true;
        const argument = value(call, 0);
        const text = argument === undefined ? undefined : asString(argument);
        if (text !== undefined) builder.url = text;
        else if (uri !== undefined) builder.url = uri;
      }
      continue;
    }

    switch (call.method) {
      case "add_field":
      case "[]=": {
        if (call.args.length < 2) break;
        builder.headerFrom(value(call, 0), value(call, 1), call.path);
        break;
      }
      case "basic_auth": {
        const user = value(call, 0);
        const password = value(call, 1);
        const username = user === undefined ? undefined : asString(user);
        const secret = password === undefined ? undefined : asString(password);
        if (username !== undefined && secret !== undefined)
          builder.auth = { kind: "basic", username, password: secret };
        break;
      }
      case "run_request": {
        // Faraday: run_request(method, url, body, headers)
        builder.found = true;
        const method = value(call, 0);
        const methodText = method === undefined ? undefined : asString(method);
        if (methodText !== undefined) builder.method = methodText.toUpperCase();
        const url = value(call, 1);
        const urlText = url === undefined ? undefined : asString(url);
        if (urlText !== undefined) builder.url = urlText;
        const body = value(call, 2);
        const bodyText = body === undefined ? undefined : asString(body);
        if (bodyText !== undefined) builder.bodyText = bodyText;
        const headers = value(call, 3);
        const pairs = headers === undefined ? undefined : asPairs(headers);
        for (const pair of pairs ?? []) builder.header(pair.name, pair.value);
        break;
      }
      case "set_form": {
        // set_form(fields, "multipart/form-data") sends ordered parts; the
        // pair list is the same shape either way.
        const form = value(call, 0);
        const pairs = form === undefined ? undefined : asPairs(form);
        const declared = value(call, 1);
        const declaredText =
          declared === undefined ? undefined : asString(declared);
        if (pairs === undefined) break;
        if (declaredText?.includes("multipart") === true) {
          for (const pair of pairs) builder.parts.push(pair);
          break;
        }
        builder.bodyText = pairs
          .map(
            ({ name, value: entry }) =>
              `${encodeURIComponent(name)}=${encodeURIComponent(entry)}`,
          )
          .join("&");
        builder.bodyContentType = "application/x-www-form-urlencoded";
        break;
      }
      case "set_form_data": {
        const form = value(call, 0);
        const pairs = form === undefined ? undefined : asPairs(form);
        if (pairs !== undefined) {
          builder.bodyText = pairs
            .map(
              ({ name, value: entry }) =>
                `${encodeURIComponent(name)}=${encodeURIComponent(entry)}`,
            )
            .join("&");
          builder.bodyContentType = "application/x-www-form-urlencoded";
        }
        break;
      }
      default:
        break;
    }
  }

  for (const entry of assignments) {
    const target = entry.target.split(".").at(-1) ?? "";
    const resolved = resolveValue(entry.value, bindings);
    if (target === "body") {
      const text = asString(resolved);
      if (text !== undefined) builder.bodyText = text;
      continue;
    }
    // `request["X-Token"] = "abc"` sets a header through a subscript.
    if (entry.index !== undefined) {
      const text = asString(resolved);
      if (text !== undefined) builder.header(entry.index, text, true);
    }
  }

  if (!builder.found) {
    throw new CodeParseError(
      "No supported Ruby request was found. Reverse conversion reads Net::HTTP request classes and Faraday.",
    );
  }
  if (builder.url === undefined && uri !== undefined) builder.url = uri;
  if (builder.method === undefined) builder.method = "GET";
  return builder.build();
}
