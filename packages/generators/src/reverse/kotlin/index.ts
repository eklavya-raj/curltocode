import { RequestBuilder } from "../shared/assemble.js";
import { readChain, resolveValue } from "../shared/chain.js";
import type { SourceCall } from "../shared/chain.js";
import { asBoolean, asPairs, asString } from "../shared/values.js";
import type { StaticValue } from "../shared/values.js";
import { CodeParseError } from "../types.js";
import type { ReverseClient, ReverseParseResult } from "../types.js";

/**
 * Recover an HTTP request from Kotlin source using OkHttp or Ktor.
 *
 * OkHttp is the same builder chain the Java reader handles, written in Kotlin
 * syntax with the media type attached to the body through an extension
 * function. Ktor puts the request inside a trailing lambda, so its options
 * arrive as ordinary calls rather than as chained steps.
 */

const KOTLIN_TRAITS = {
  lineComments: ["//"],
  transparentCalls: [
    // `"body".toRequestBody("type".toMediaType())` reads through to the body,
    // and the media type resolves to the string it was built from.
    "toRequestBody",
    "toMediaType",
    "toMediaTypeOrNull",
    "HttpMethod",
    "URI.create",
  ],
  bindingKeywords: ["val", "var"],
} as const;

function detectClient(source: string): ReverseClient {
  return /\bio\.ktor\b|HttpClient\s*\(/u.test(source) ? "ktor" : "okhttp";
}

export function parseKotlinRequest(source: string): ReverseParseResult {
  const { calls, bindings } = readChain(source, KOTLIN_TRAITS);
  const client = detectClient(source);
  const builder = new RequestBuilder(client);
  // Both clients follow redirects unless the source says otherwise, and each
  // spells the opt-out its own way.
  builder.followRedirects = !(
    /followRedirects\s*\(\s*false\s*\)/u.test(source) ||
    /followRedirects\s*=\s*false/u.test(source)
  );

  const value = (call: SourceCall, index: number): StaticValue | undefined => {
    const argument = call.args[index];
    return argument === undefined
      ? undefined
      : resolveValue(argument, bindings);
  };

  // `Credentials.basic(user, password)` is passed straight into a header, so
  // the credentials are lifted from the call rather than reported as a header
  // value that could not be resolved.
  for (const call of calls) {
    if (call.path !== "Credentials.basic" || call.args.length < 2) continue;
    const user = value(call, 0);
    const password = value(call, 1);
    const username = user === undefined ? undefined : asString(user);
    const secret = password === undefined ? undefined : asString(password);
    if (username !== undefined && secret !== undefined) {
      builder.auth = { kind: "basic", username, password: secret };
    }
  }

  for (const call of calls) {
    switch (call.method) {
      case "url": {
        const url = value(call, 0);
        const text = url === undefined ? undefined : asString(url);
        if (text !== undefined) {
          builder.url = text;
          builder.found = true;
        }
        break;
      }
      case "request": {
        // Ktor names the URL in the call and everything else in its lambda.
        if (client !== "ktor") break;
        const url = value(call, 0);
        const text = url === undefined ? undefined : asString(url);
        if (text !== undefined) {
          builder.url = text;
          builder.found = true;
        }
        break;
      }
      case "HttpMethod": {
        const method = value(call, 0);
        const text = method === undefined ? undefined : asString(method);
        if (text !== undefined) builder.method = text.toUpperCase();
        break;
      }
      case "method": {
        const method = value(call, 0);
        const text = method === undefined ? undefined : asString(method);
        if (text !== undefined) builder.method = text.toUpperCase();
        const body = value(call, 1);
        const payload = body === undefined ? undefined : asString(body);
        if (payload !== undefined) builder.bodyText = payload;
        break;
      }
      case "toRequestBody": {
        // The extension takes the media type as its argument, which is the
        // only place OkHttp records a request's content type.
        const declared = value(call, 0);
        const text = declared === undefined ? undefined : asString(declared);
        if (text !== undefined) builder.bodyContentType = text;
        break;
      }
      case "setBody": {
        const body = value(call, 0);
        const payload = body === undefined ? undefined : asString(body);
        if (payload !== undefined) builder.bodyText = payload;
        break;
      }
      case "addHeader":
      case "header": {
        if (call.args.length < 2) break;
        const raw = call.args[1];
        const resolved =
          raw === undefined ? undefined : resolveValue(raw, bindings);
        // A credentials call was already read into the auth field above.
        if (
          resolved?.kind === "unresolved" &&
          resolved.source.includes("Credentials.basic")
        ) {
          break;
        }
        builder.headerFrom(
          value(call, 0),
          resolved,
          call.path,
          call.method === "header",
        );
        break;
      }
      case "addFormDataPart":
      case "append": {
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
      case "headers": {
        const map = value(call, 0);
        const pairs = map === undefined ? undefined : asPairs(map);
        for (const pair of pairs ?? []) builder.header(pair.name, pair.value);
        break;
      }
      case "followRedirects": {
        const flag = value(call, 0);
        const resolved = flag === undefined ? undefined : asBoolean(flag);
        if (resolved !== undefined) builder.followRedirects = resolved;
        break;
      }
      default:
        break;
    }
  }

  if (!builder.found) {
    throw new CodeParseError(
      "No supported Kotlin request was found. Reverse conversion reads OkHttp's Request.Builder and Ktor's HttpClient.",
    );
  }
  if (builder.method === undefined) builder.method = "GET";
  return builder.build();
}
