import { RequestBuilder } from "../shared/assemble.js";
import { readChain, resolveValue } from "../shared/chain.js";
import type { SourceCall } from "../shared/chain.js";
import { asBoolean, asPairs, asString } from "../shared/values.js";
import type { StaticValue } from "../shared/values.js";
import { CodeParseError } from "../types.js";
import type { ReverseClient, ReverseParseResult } from "../types.js";

/**
 * Recover an HTTP request from Dart source using package:http or Dio.
 *
 * `package:http` builds a `Request` and configures it through properties, so
 * its facts arrive as assignments. Dio takes everything as named arguments to
 * one call, with the request policy inside an `Options` object.
 */

const DART_TRAITS = {
  lineComments: ["//"],
  // Dart's single-quoted strings are the idiomatic form and take the same
  // escapes as the double-quoted ones.
  escapingStringQuotes: ["'"],
  transparentCalls: ["Uri.parse", "Uri.https", "utf8.encode", "await"],
  bindingKeywords: ["final", "var", "const", "late"],
} as const;

function detectClient(source: string): ReverseClient {
  return /\bpackage:dio\b|\bDio\s*\(/u.test(source) ? "dio" : "http";
}

export function parseDartRequest(source: string): ReverseParseResult {
  const { calls, assignments, bindings } = readChain(source, DART_TRAITS);
  const client = detectClient(source);
  const builder = new RequestBuilder(client);
  // `package:http` follows redirects unless the request says otherwise, and
  // Dio's Options carries the same flag.
  builder.followRedirects = !/followRedirects\s*[:=]\s*false/u.test(source);

  const value = (call: SourceCall, index: number): StaticValue | undefined => {
    const argument = call.args[index];
    return argument === undefined
      ? undefined
      : resolveValue(argument, bindings);
  };
  const keyword = (call: SourceCall, name: string): StaticValue | undefined => {
    const raw = call.keywords.get(name);
    return raw === undefined ? undefined : resolveValue(raw, bindings);
  };

  for (const call of calls) {
    switch (call.method) {
      case "Request":
      case "MultipartRequest": {
        // http.Request(method, url)
        const method = value(call, 0);
        const url = value(call, 1);
        const methodText = method === undefined ? undefined : asString(method);
        const urlText = url === undefined ? undefined : asString(url);
        if (methodText !== undefined) builder.method = methodText.toUpperCase();
        if (urlText !== undefined) {
          builder.url = urlText;
          builder.found = true;
        }
        break;
      }
      case "addAll": {
        // request.headers.addAll({...})
        const map = value(call, 0);
        const pairs = map === undefined ? undefined : asPairs(map);
        for (const pair of pairs ?? []) builder.header(pair.name, pair.value);
        break;
      }
      case "Options": {
        const method = keyword(call, "method");
        const methodText = method === undefined ? undefined : asString(method);
        if (methodText !== undefined) builder.method = methodText.toUpperCase();
        const headers = keyword(call, "headers");
        const pairs = headers === undefined ? undefined : asPairs(headers);
        for (const pair of pairs ?? []) builder.header(pair.name, pair.value);
        const follow = keyword(call, "followRedirects");
        const resolved = follow === undefined ? undefined : asBoolean(follow);
        if (resolved !== undefined) builder.followRedirects = resolved;
        break;
      }
      case "request":
      case "get":
      case "post":
      case "put":
      case "patch":
      case "delete":
      case "head": {
        if (client !== "dio" || !call.path.includes(".")) break;
        builder.found = true;
        if (call.method !== "request") {
          builder.method = call.method.toUpperCase();
        }
        const url = value(call, 0);
        const urlText = url === undefined ? undefined : asString(url);
        if (urlText !== undefined) builder.url = urlText;
        const data = keyword(call, "data");
        const text = data === undefined ? undefined : asString(data);
        if (text !== undefined) builder.bodyText = text;
        break;
      }
      case "MapEntry": {
        // `data.fields.add(MapEntry(name, value))` is Dio's list-shaped form,
        // which is what keeps a repeated field name.
        if (call.args.length < 2) break;
        const name = value(call, 0);
        const partValue = value(call, 1);
        const partName = name === undefined ? undefined : asString(name);
        const text = partValue === undefined ? undefined : asString(partValue);
        if (partName !== undefined && text !== undefined) {
          builder.parts.push({ name: partName, value: text });
        }
        break;
      }
      case "fromMap": {
        // `FormData.fromMap({...})` keys the parts by field name.
        const map = value(call, 0);
        const pairs = map === undefined ? undefined : asPairs(map);
        for (const pair of pairs ?? []) builder.parts.push(pair);
        break;
      }
      default:
        break;
    }
  }

  for (const entry of assignments) {
    const target = entry.target.split(".").at(-1) ?? "";
    const resolved = resolveValue(entry.value, bindings);
    if (target === "body" || target === "bodyBytes") {
      const text = asString(resolved);
      if (text !== undefined) builder.bodyText = text;
      continue;
    }
    if (target === "followRedirects") {
      const flag = asBoolean(resolved);
      if (flag !== undefined) builder.followRedirects = flag;
      continue;
    }
    // `request.fields['name'] = 'value'` adds one multipart field.
    if (entry.index !== undefined && entry.target.endsWith("fields")) {
      const text = asString(resolved);
      if (text !== undefined) {
        builder.parts.push({ name: entry.index, value: text });
      }
      continue;
    }
    if (entry.index !== undefined && entry.target.endsWith("headers")) {
      const text = asString(resolved);
      if (text !== undefined) builder.header(entry.index, text, true);
    }
  }

  if (!builder.found) {
    throw new CodeParseError(
      "No supported Dart request was found. Reverse conversion reads package:http requests and Dio.",
    );
  }
  if (builder.method === undefined) builder.method = "GET";
  return builder.build();
}
