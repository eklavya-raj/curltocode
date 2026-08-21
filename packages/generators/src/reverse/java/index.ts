import { RequestBuilder } from "../shared/assemble.js";
import { parseMultipartBody } from "../http/index.js";
import { readChain, resolveValue } from "../shared/chain.js";
import type { SourceCall } from "../shared/chain.js";
import { asBoolean, asString } from "../shared/values.js";
import type { StaticValue } from "../shared/values.js";
import { CodeParseError } from "../types.js";
import type { ReverseClient, ReverseParseResult } from "../types.js";

/**
 * Recover an HTTP request from Java source using the JDK's HttpClient, OkHttp,
 * Apache HttpClient 5, or HttpURLConnection.
 *
 * The first three are builder chains, so the shared chain reader supplies the
 * calls and this module only has to say what each method name means.
 * HttpURLConnection is not a builder: it is a connection object configured by
 * setters and fed through an output stream, so its payload is whatever was
 * written, in order.
 */

const JAVA_TRAITS = {
  // Reading through these wrappers yields the value they carry.
  transparentCalls: [
    "URI.create",
    "create",
    "ofString",
    "HttpRequest.BodyPublishers.ofString",
    "RequestBody.create",
    "MediaType.parse",
    "StringEntity",
    "ByteArrayEntity",
    "getBytes",
    "toString",
  ],
  bindingKeywords: [
    "var",
    "final",
    "String",
    "URI",
    "RequestBody",
    "HttpRequest",
  ],
} as const;

const METHOD_NAMES = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

function detectClient(source: string): ReverseClient {
  // The connection class names itself, and no builder client mentions it.
  if (/\bHttpURLConnection\b/u.test(source)) return "httpurlconnection";
  if (/\bokhttp3\b|\bOkHttpClient\b|Request\.Builder/u.test(source))
    return "okhttp";
  if (/\borg\.apache\.hc\b|ClassicRequestBuilder|HttpClients\./u.test(source))
    return "apache";
  return "httpclient";
}

export function parseJavaRequest(source: string): ReverseParseResult {
  const { calls, bindings } = readChain(source, JAVA_TRAITS);
  const client = detectClient(source);
  const builder = new RequestBuilder(client);
  // All three clients follow redirects by default, and each spells its opt-out
  // differently: a Redirect.NEVER policy, followRedirects(false), or a request
  // config with redirects disabled.
  builder.followRedirects = ![
    /Redirect\.NEVER/u,
    /followRedirects\(\s*false\s*\)/u,
    /setRedirectsEnabled\(\s*false\s*\)/u,
  ].some((pattern) => pattern.test(source));

  /** Payload chunks written to a HttpURLConnection output stream, in order. */
  const writes: string[] = [];

  const value = (call: SourceCall, index: number): StaticValue | undefined => {
    const argument = call.args[index];
    return argument === undefined
      ? undefined
      : resolveValue(argument, bindings);
  };

  for (const call of calls) {
    switch (call.method) {
      case "uri":
      case "url":
      case "setUri": {
        const url = value(call, 0);
        const text = url === undefined ? undefined : asString(url);
        if (text !== undefined) {
          builder.url = text;
          builder.found = true;
        } else if (call.args.length > 0) {
          builder.issue(
            "url",
            "Dynamic URL cannot be resolved statically.",
            call.path,
          );
          builder.found = true;
        }
        break;
      }
      case "method": {
        const method = value(call, 0);
        const text = method === undefined ? undefined : asString(method);
        if (text !== undefined) builder.method = text.toUpperCase();
        const body = value(call, 1);
        const bodyText = body === undefined ? undefined : asString(body);
        if (bodyText !== undefined) builder.bodyText = bodyText;
        break;
      }
      case "GET":
      case "POST":
      case "PUT":
      case "PATCH":
      case "DELETE":
      case "HEAD": {
        // OkHttp and the JDK builder both offer verb-named shorthands.
        builder.method = call.method.toUpperCase();
        const body = value(call, 0);
        const bodyText = body === undefined ? undefined : asString(body);
        if (bodyText !== undefined) builder.bodyText = bodyText;
        break;
      }
      case "header":
      case "addHeader":
      case "setHeader":
      case "addRequestHeader": {
        if (call.args.length < 2) break;
        builder.headerFrom(
          value(call, 0),
          value(call, 1),
          call.path,
          call.method === "setHeader",
        );
        break;
      }
      case "post":
      case "put":
      case "patch":
      case "delete":
      case "get": {
        // Apache's ClassicRequestBuilder names the verb and takes the URI.
        if (!/ClassicRequestBuilder|HttpRequest|Request/u.test(call.path))
          break;
        builder.method = call.method.toUpperCase();
        const url = value(call, 0);
        const text = url === undefined ? undefined : asString(url);
        if (text !== undefined) {
          builder.url = text;
          builder.found = true;
        }
        break;
      }
      case "HttpUriRequestBase": {
        // Apache's classic base takes the method and URI as constructor
        // arguments rather than through a builder.
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
      case "HttpGet":
      case "HttpPost":
      case "HttpPut":
      case "HttpPatch":
      case "HttpDelete":
      case "HttpHead":
      case "HttpOptions": {
        // The verb-named classic requests carry the method in the class name.
        builder.method = call.method.slice(4).toUpperCase();
        const url = value(call, 0);
        const urlText = url === undefined ? undefined : asString(url);
        if (urlText !== undefined) {
          builder.url = urlText;
          builder.found = true;
        }
        break;
      }
      case "addFormDataPart":
      case "addTextBody": {
        // OkHttp and Apache each name their text part setter differently, and
        // both preserve the order the parts were added in.
        const name = value(call, 0);
        const partValue = value(call, 1);
        const partName = name === undefined ? undefined : asString(name);
        const text = partValue === undefined ? undefined : asString(partValue);
        if (partName !== undefined && text !== undefined) {
          builder.parts.push({ name: partName, value: text });
        }
        break;
      }
      case "setEntity":
      case "body": {
        const body = value(call, 0);
        const text = body === undefined ? undefined : asString(body);
        if (text !== undefined) builder.bodyText = text;
        break;
      }
      case "setRequestMethod": {
        const method = value(call, 0);
        const text = method === undefined ? undefined : asString(method);
        if (text !== undefined) {
          builder.method = text.toUpperCase();
          builder.found = true;
        }
        break;
      }
      case "setInstanceFollowRedirects":
      case "setFollowRedirects": {
        const flag = value(call, 0);
        const resolved = flag === undefined ? undefined : asBoolean(flag);
        if (resolved !== undefined) builder.followRedirects = resolved;
        break;
      }
      case "addRequestProperty":
      case "setRequestProperty": {
        if (call.args.length < 2) break;
        builder.headerFrom(
          value(call, 0),
          value(call, 1),
          call.path,
          call.method === "setRequestProperty",
        );
        break;
      }
      case "write": {
        // Every chunk written to the connection's stream is one piece of the
        // payload, so they are joined in source order rather than overwriting.
        if (client !== "httpurlconnection") break;
        const chunk = value(call, 0);
        const text = chunk === undefined ? undefined : asString(chunk);
        if (text === undefined) {
          builder.issue(
            "body",
            "Dynamic request payload cannot be resolved statically.",
            call.path,
          );
          break;
        }
        writes.push(text);
        break;
      }
      default:
        break;
    }
  }

  if (client === "httpurlconnection" && builder.url === undefined) {
    // The connection is opened from a URI or URL object rather than from a
    // call that names the request, so the address is taken from the binding
    // that holds it.
    for (const [, bound] of bindings) {
      const text = asString(resolveValue(bound, bindings));
      if (text !== undefined && /^https?:\/\//u.test(text)) {
        builder.url = text;
        break;
      }
    }
  }

  if (client === "httpurlconnection" && writes.length > 0) {
    const payload = writes.join("");
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
      // The boundary is framing for this message rather than part of the
      // request, so the declaration goes with it.
      const index = builder.headers.findIndex(
        (header) => header.name.toLowerCase() === "content-type",
      );
      if (index >= 0) builder.headers.splice(index, 1);
    }
  }

  // A verb-named call may have supplied the method without the constant form.
  if (builder.method !== undefined && !METHOD_NAMES.has(builder.method)) {
    builder.method = builder.method.toUpperCase();
  }
  if (!builder.found) {
    throw new CodeParseError(
      "No supported Java request was found. Reverse conversion reads java.net.http.HttpClient, OkHttp, Apache HttpClient 5, and HttpURLConnection.",
    );
  }
  if (builder.method === undefined) builder.method = "GET";
  return builder.build();
}
