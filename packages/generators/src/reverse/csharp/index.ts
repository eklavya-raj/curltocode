import { RequestBuilder } from "../shared/assemble.js";
import { readChain, resolveValue } from "../shared/chain.js";
import type { SourceAssignment, SourceCall } from "../shared/chain.js";
import { asString, mapEntry } from "../shared/values.js";
import type { StaticValue } from "../shared/values.js";
import { CodeParseError } from "../types.js";
import type { ReverseClient, ReverseParseResult } from "../types.js";

/**
 * Recover an HTTP request from C# source using HttpClient, RestSharp, or Flurl.
 *
 * HttpClient mixes a constructor, property assignments, and method calls, while
 * RestSharp and Flurl are fluent chains. The shared chain reader supplies all
 * three, so this module only maps names onto request fields.
 */

const CSHARP_TRAITS = {
  transparentCalls: [
    "StringContent",
    "ByteArrayContent",
    "FormUrlEncodedContent",
    "HttpMethod",
    "Encoding.UTF8.GetBytes",
    "GetBytes",
  ],
  bindingKeywords: ["var", "using", "string", "new"],
} as const;

const REST_SHARP_METHODS: ReadonlyMap<string, string> = new Map([
  ["Get", "GET"],
  ["Post", "POST"],
  ["Put", "PUT"],
  ["Patch", "PATCH"],
  ["Delete", "DELETE"],
  ["Head", "HEAD"],
  ["Options", "OPTIONS"],
]);

function detectClient(source: string): ReverseClient {
  // Flurl is checked first: its chain also mentions HttpMethod, which the
  // HttpClient reader would otherwise claim.
  if (/\bFlurl\b|SendMultipartAsync|AllowAnyHttpStatus/u.test(source)) {
    return "flurl";
  }
  return /\bRestSharp\b|\bRestRequest\b|\bRestClient\b/u.test(source)
    ? "restsharp"
    : "httpclient";
}

/**
 * The URL a Flurl chain starts from.
 *
 * Flurl's extension methods hang off a string, so the URL is the receiver of
 * the chain rather than an argument to anything. The chain reader records
 * calls, not receivers, so it is taken from the first absolute URL literal in
 * the source — which is what that receiver is.
 */
function flurlUrl(source: string): string | undefined {
  return /"(https?:\/\/[^"\\]*)"/u.exec(source)?.[1];
}

export function parseCsharpRequest(source: string): ReverseParseResult {
  const { calls, assignments, bindings } = readChain(source, CSHARP_TRAITS);
  const client = detectClient(source);
  const builder = new RequestBuilder(client);
  // Both clients follow redirects unless the handler or options say otherwise.
  builder.followRedirects = ![
    /AllowAutoRedirect\s*=\s*false/u,
    /FollowRedirects\s*=\s*false/u,
  ].some((pattern) => pattern.test(source));

  const isMultipart = /\bMultipartFormDataContent\b/u.test(source);
  if (client === "flurl") {
    const url = flurlUrl(source);
    if (url !== undefined) {
      builder.url = url;
      builder.found = true;
    }
    // Flurl follows redirects unless its settings turn them off, which the
    // generated chain always states outright.
    builder.followRedirects = !/Redirects\.Enabled\s*=\s*false/u.test(source);
  }

  const value = (call: SourceCall, index: number): StaticValue | undefined => {
    const argument = call.args[index];
    return argument === undefined
      ? undefined
      : resolveValue(argument, bindings);
  };

  for (const call of calls) {
    switch (call.method) {
      case "HttpRequestMessage": {
        // new HttpRequestMessage(new HttpMethod("POST"), url)
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
      case "RestRequest": {
        const url = value(call, 0);
        const urlText = url === undefined ? undefined : asString(url);
        if (urlText !== undefined) {
          builder.url = urlText;
          builder.found = true;
        }
        // The method may be supplied as a second Method.X argument.
        const method = value(call, 1);
        if (method?.kind === "identifier") {
          const name = method.name.split(".").at(-1) ?? "";
          const mapped = REST_SHARP_METHODS.get(name);
          if (mapped !== undefined) builder.method = mapped;
        }
        break;
      }
      case "RestClient": {
        // A base URL on the client is joined with the request resource later.
        const url = value(call, 0);
        const urlText = url === undefined ? undefined : asString(url);
        if (urlText !== undefined && builder.url === undefined) {
          builder.url = urlText;
          builder.found = true;
        }
        break;
      }
      case "TryAddWithoutValidation":
      case "AddHeader": {
        if (call.args.length < 2) break;
        builder.headerFrom(value(call, 0), value(call, 1), call.path);
        break;
      }
      case "Add": {
        if (call.args.length < 2) break;
        // MultipartFormDataContent.Add takes the content first and the field
        // name second, which is the reverse of every header setter here.
        if (isMultipart && !call.path.includes("Headers")) {
          const content = value(call, 0);
          const name = value(call, 1);
          const partValue =
            content === undefined ? undefined : asString(content);
          const partName = name === undefined ? undefined : asString(name);
          if (partName !== undefined && partValue !== undefined)
            builder.parts.push({ name: partName, value: partValue });
          break;
        }
        builder.headerFrom(value(call, 0), value(call, 1), call.path);
        break;
      }
      case "AddBody": {
        // RestSharp's raw body form names its media type second.
        const body = value(call, 0);
        const text = body === undefined ? undefined : asString(body);
        if (text !== undefined) builder.bodyText = text;
        const declared = value(call, 1);
        const declaredText =
          declared === undefined ? undefined : asString(declared);
        if (declaredText !== undefined) builder.bodyContentType = declaredText;
        break;
      }
      case "Remove":
        // Headers are removed only to replace them on the following line.
        break;
      case "AddStringBody":
      case "AddJsonBody": {
        const body = value(call, 0);
        const text = body === undefined ? undefined : asString(body);
        if (text !== undefined) builder.bodyText = text;
        // AddStringBody names its media type in the second argument, which is
        // what decides how the payload is represented.
        const declared = value(call, 1);
        const declaredText =
          declared === undefined ? undefined : asString(declared);
        builder.bodyContentType =
          call.method === "AddJsonBody" ? "application/json" : declaredText;
        break;
      }
      case "WithHeader": {
        if (call.args.length < 2) break;
        builder.headerFrom(value(call, 0), value(call, 1), call.path);
        break;
      }
      case "WithBasicAuth": {
        const user = value(call, 0);
        const password = value(call, 1);
        const username = user === undefined ? undefined : asString(user);
        const secret = password === undefined ? undefined : asString(password);
        if (username !== undefined && secret !== undefined) {
          builder.auth = { kind: "basic", username, password: secret };
        }
        break;
      }
      case "WithOAuthBearerToken": {
        const token = value(call, 0);
        const text = token === undefined ? undefined : asString(token);
        if (text !== undefined) {
          builder.header("Authorization", `Bearer ${text}`);
        }
        break;
      }
      case "StringContent":
      case "ByteArrayContent": {
        // Flurl carries the payload and its media type in one content object,
        // so the type is read here rather than from a header.
        if (client !== "flurl") break;
        const body = value(call, 0);
        const text = body === undefined ? undefined : asString(body);
        if (text !== undefined) builder.bodyText = text;
        const declared = value(call, 2);
        const declaredText =
          declared === undefined ? undefined : asString(declared);
        if (declaredText !== undefined) builder.bodyContentType = declaredText;
        break;
      }
      case "AddString": {
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
      case "SendAsync":
      case "SendMultipartAsync": {
        const method = value(call, 0);
        const name =
          method?.kind === "identifier"
            ? (method.name.split(".").at(-1) ?? "")
            : ((method === undefined ? undefined : asString(method)) ?? "");
        if (name !== "") builder.method = name.toUpperCase();
        builder.found = true;
        break;
      }
      case "AddParameter": {
        // RestSharp's three-argument form carries a raw body.
        if (call.args.length >= 2) {
          const name = value(call, 0);
          const parameter = value(call, 1);
          const nameText = name === undefined ? undefined : asString(name);
          const text =
            parameter === undefined ? undefined : asString(parameter);
          if (nameText !== undefined && text !== undefined) {
            if (nameText.includes("/")) {
              builder.bodyText = text;
              builder.bodyContentType = nameText;
            } else builder.parts.push({ name: nameText, value: text });
          }
        }
        break;
      }
      default:
        break;
    }
  }

  const assignment = (entry: SourceAssignment): StaticValue =>
    resolveValue(entry.value, bindings);

  for (const entry of assignments) {
    const target = entry.target.split(".").at(-1) ?? "";
    if (target === "Content") {
      const text = asString(assignment(entry));
      if (text !== undefined) builder.bodyText = text;
      continue;
    }
    if (target === "Method") {
      const text = asString(assignment(entry));
      if (text !== undefined) builder.method = text.toUpperCase();
      continue;
    }
    if (target === "RequestUri") {
      const text = asString(assignment(entry));
      if (text !== undefined) {
        builder.url = text;
        builder.found = true;
      }
      continue;
    }
    // An object initializer may carry the redirect setting.
    const initializer = assignment(entry);
    const redirect =
      mapEntry(initializer, "AllowAutoRedirect") ??
      mapEntry(initializer, "FollowRedirects");
    if (redirect !== undefined && redirect.kind === "boolean") {
      builder.followRedirects = redirect.value;
    }
  }

  if (!builder.found) {
    throw new CodeParseError(
      "No supported C# request was found. Reverse conversion reads HttpClient (HttpRequestMessage) and RestSharp.",
    );
  }
  if (builder.method === undefined) builder.method = "GET";
  return builder.build();
}
