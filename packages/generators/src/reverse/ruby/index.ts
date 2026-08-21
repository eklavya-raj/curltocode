import { RequestBuilder } from "../shared/assemble.js";
import { readChain, resolveValue } from "../shared/chain.js";
import type { SourceCall } from "../shared/chain.js";
import { asBoolean, asPairs, asString } from "../shared/values.js";
import type { StaticValue } from "../shared/values.js";
import { CodeParseError } from "../types.js";
import type { ReverseClient, ReverseParseResult } from "../types.js";

/**
 * Recover an HTTP request from Ruby source using Net::HTTP, Faraday, HTTParty,
 * or rest-client.
 *
 * Net::HTTP names the verb in the request class, sets headers through method
 * calls and subscript assignment, and takes the body as a property. Faraday
 * passes everything to one call. HTTParty and rest-client are keyword-argument
 * APIs, so their options are read from the labels rather than from position.
 * All four go through the shared chain reader.
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

/** HTTParty and rest-client both expose one module method per verb. */
const RUBY_VERBS: ReadonlySet<string> = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
]);

/**
 * Ruby symbols such as `:patch`.
 *
 * The chain reader has no symbol literal, so one arrives as its own source
 * text. Reading it here keeps the colon syntax out of every other language's
 * value model.
 */
function asSymbol(value: StaticValue | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.kind === "string") return value.value;
  if (value.kind === "identifier") return value.name;
  return value.kind === "unresolved" &&
    /^:[A-Za-z_][A-Za-z0-9_]*$/u.test(value.source)
    ? value.source.slice(1)
    : undefined;
}

function detectClient(source: string): ReverseClient {
  if (/\bRestClient\b/u.test(source)) return "restclient";
  if (/\bHTTParty\b/u.test(source)) return "httparty";
  // `run_request` is Faraday's own API, and the require line is lower case,
  // so neither alone should be missed.
  return /faraday/iu.test(source) || /\brun_request\s*\(/u.test(source)
    ? "faraday"
    : "nethttp";
}

/** Read a `{ "Name" => "value" }` argument into the builder. */
function applyHeaders(
  builder: RequestBuilder,
  value: StaticValue | undefined,
  origin: string,
): void {
  if (value === undefined) return;
  const entries = asPairs(value);
  if (entries === undefined) {
    builder.issue(
      "headers",
      "Dynamic headers cannot be resolved statically.",
      origin,
    );
    return;
  }
  for (const entry of entries) builder.header(entry.name, entry.value);
}

/** Read a payload argument, reporting one that is not a static string. */
function applyBody(
  builder: RequestBuilder,
  value: StaticValue | undefined,
  origin: string,
): void {
  if (value === undefined) return;
  const text = asString(value);
  if (text !== undefined) {
    builder.bodyText = text;
    return;
  }
  const entries = asPairs(value);
  if (entries !== undefined) {
    // A hash payload is form-encoded by both clients unless multipart is asked
    // for, which is what the forward generators emit as well.
    builder.bodyText = entries
      .map(
        ({ name, value: entry }) =>
          `${encodeURIComponent(name)}=${encodeURIComponent(entry)}`,
      )
      .join("&");
    builder.bodyContentType = "application/x-www-form-urlencoded";
    return;
  }
  builder.issue(
    "body",
    "Dynamic request body cannot be resolved statically.",
    origin,
  );
}

export function parseRubyRequest(source: string): ReverseParseResult {
  const { calls, assignments, bindings } = readChain(source, RUBY_TRAITS);
  const client = detectClient(source);
  const builder = new RequestBuilder(client);
  // Net::HTTP never follows redirects on its own, and Faraday only does so
  // when the follow_redirects middleware is installed, so for those two the
  // flag is off unless the source opts in. HTTParty and rest-client both
  // follow by default and are corrected below from their own option.
  builder.followRedirects =
    client === "httparty" ||
    client === "restclient" ||
    /follow_redirects/u.test(source);

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

    // HTTParty exposes one module method per verb and takes every option as a
    // keyword argument.
    if (
      client === "httparty" &&
      /(?:^|\.)HTTParty\.[a-z]+$/u.test(call.path) &&
      RUBY_VERBS.has(call.method)
    ) {
      builder.found = true;
      builder.method = call.method.toUpperCase();
      const url = value(call, 0);
      const urlText = url === undefined ? undefined : asString(url);
      if (urlText !== undefined) builder.url = urlText;
      const keyword = (name: string): StaticValue | undefined => {
        const raw = call.keywords.get(name);
        return raw === undefined ? undefined : resolveValue(raw, bindings);
      };
      applyHeaders(builder, keyword("headers"), call.path);
      const multipart = asBoolean(keyword("multipart") ?? { kind: "null" });
      const body = keyword("body");
      if (multipart === true && body !== undefined) {
        const entries = asPairs(body);
        if (entries === undefined) {
          builder.issue(
            "body",
            "Dynamic multipart body cannot be resolved statically.",
            call.path,
          );
        } else {
          for (const entry of entries) builder.parts.push(entry);
        }
      } else {
        applyBody(builder, body, call.path);
      }
      const credentials = keyword("basic_auth");
      const pairs =
        credentials === undefined ? undefined : asPairs(credentials);
      const username = pairs?.find((pair) => pair.name === "username")?.value;
      const password = pairs?.find((pair) => pair.name === "password")?.value;
      if (username !== undefined && password !== undefined) {
        builder.auth = { kind: "basic", username, password };
      }
      const query = keyword("query");
      const queryPairs = query === undefined ? undefined : asPairs(query);
      if (queryPairs !== undefined && builder.url !== undefined) {
        const separator = builder.url.includes("?") ? "&" : "?";
        builder.url += `${separator}${queryPairs
          .map(
            ({ name, value: entry }) =>
              `${encodeURIComponent(name)}=${encodeURIComponent(entry)}`,
          )
          .join("&")}`;
      }
      const follow = keyword("follow_redirects");
      const followValue = follow === undefined ? undefined : asBoolean(follow);
      if (followValue !== undefined) builder.followRedirects = followValue;
      continue;
    }

    // rest-client puts every option in one keyword hash, whether it is written
    // as `Request.execute(...)` or as one of the per-verb shortcuts.
    if (
      client === "restclient" &&
      call.path === "RestClient::Request.execute"
    ) {
      builder.found = true;
      const keyword = (name: string): StaticValue | undefined => {
        const raw = call.keywords.get(name);
        return raw === undefined ? undefined : resolveValue(raw, bindings);
      };
      const method = asSymbol(keyword("method"));
      if (method !== undefined) builder.method = method.toUpperCase();
      const url = keyword("url");
      const urlText = url === undefined ? undefined : asString(url);
      if (urlText !== undefined) builder.url = urlText;
      applyHeaders(builder, keyword("headers"), call.path);
      applyBody(builder, keyword("payload"), call.path);
      const user = keyword("user");
      const password = keyword("password");
      const username = user === undefined ? undefined : asString(user);
      const secret = password === undefined ? undefined : asString(password);
      if (username !== undefined && secret !== undefined) {
        builder.auth = { kind: "basic", username, password: secret };
      }
      const limit = keyword("max_redirects");
      if (limit !== undefined) {
        builder.followRedirects =
          limit.kind === "number" ? limit.value > 0 : builder.followRedirects;
      }
      continue;
    }

    if (
      client === "restclient" &&
      /(?:^|\.)RestClient\.[a-z]+$/u.test(call.path) &&
      RUBY_VERBS.has(call.method)
    ) {
      // `RestClient.post(url, payload, headers)`; GET and DELETE take the
      // header hash as their second argument instead.
      builder.found = true;
      builder.method = call.method.toUpperCase();
      const url = value(call, 0);
      const urlText = url === undefined ? undefined : asString(url);
      if (urlText !== undefined) builder.url = urlText;
      const takesPayload = ["post", "put", "patch"].includes(call.method);
      if (takesPayload) {
        applyBody(builder, value(call, 1), call.path);
        applyHeaders(builder, value(call, 2), call.path);
      } else {
        applyHeaders(builder, value(call, 1), call.path);
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
      "No supported Ruby request was found. Reverse conversion reads Net::HTTP request classes, Faraday, HTTParty, and rest-client.",
    );
  }
  if (builder.url === undefined && uri !== undefined) builder.url = uri;
  if (builder.method === undefined) builder.method = "GET";
  return builder.build();
}
