import { RequestBuilder } from "../shared/assemble.js";
import { readChain, resolveValue } from "../shared/chain.js";
import type { SourceCall } from "../shared/chain.js";
import { asString } from "../shared/values.js";
import type { StaticValue } from "../shared/values.js";
import { CodeParseError } from "../types.js";
import type { ReverseClient, ReverseParseResult } from "../types.js";

/**
 * Recover an HTTP request from Rust source using reqwest or ureq.
 *
 * Both are builder chains punctuated by `?` and `.await`, which the shared
 * reader treats as transparent, so the calls arrive here in source order.
 */

const RUST_TRAITS = {
  // Rust raw strings are written r"..." and r#"..."#; the leading r reads as a
  // separate name token, leaving the quoted body to the ordinary string rule.
  transparentCalls: [
    "Some",
    "String::from",
    "to_string",
    "to_owned",
    "from_bytes",
    "http::Method::from_bytes",
    "Method::from_bytes",
  ],
  bindingKeywords: ["let", "mut", "const", "static"],
} as const;

const VERB_METHODS: ReadonlyMap<string, string> = new Map([
  ["get", "GET"],
  ["post", "POST"],
  ["put", "PUT"],
  ["patch", "PATCH"],
  ["delete", "DELETE"],
  ["head", "HEAD"],
]);

function detectClient(source: string): ReverseClient {
  return /\bureq\b/u.test(source) ? "ureq" : "reqwest";
}

/** `b"POST"` reaches the reader as a name followed by a string. */
function methodFromValue(value: StaticValue | undefined): string | undefined {
  if (value === undefined) return undefined;
  const text = asString(value);
  if (text !== undefined) return text.toUpperCase();
  if (value.kind === "identifier") {
    // reqwest::Method::POST and http::Method::POST both end in the verb.
    const segment = value.name.split("::").at(-1) ?? "";
    return /^[A-Z]+$/u.test(segment) ? segment : undefined;
  }
  return undefined;
}

export function parseRustRequest(source: string): ReverseParseResult {
  const { calls, bindings } = readChain(source, RUST_TRAITS);
  const client = detectClient(source);
  const builder = new RequestBuilder(client);
  // reqwest follows redirects by default and ureq caps them; each generator
  // writes its own opt-out.
  builder.followRedirects = ![
    /Policy::none\(\)/u,
    /max_redirects\(\s*0\s*\)/u,
    /redirects\(\s*0\s*\)/u,
  ].some((pattern) => pattern.test(source));

  const value = (call: SourceCall, index: number): StaticValue | undefined => {
    const argument = call.args[index];
    return argument === undefined
      ? undefined
      : resolveValue(argument, bindings);
  };

  for (const call of calls) {
    switch (call.method) {
      case "request": {
        // client.request(Method::POST, url). The request is found even when
        // its URL is dynamic; reporting "no request" would be misleading when
        // the call is plainly there.
        if (call.args.length < 2) break;
        builder.found = true;
        const method = methodFromValue(value(call, 0));
        if (method !== undefined) builder.method = method;
        const url = value(call, 1);
        const urlText = url === undefined ? undefined : asString(url);
        if (urlText !== undefined) builder.url = urlText;
        break;
      }
      case "method": {
        const method = methodFromValue(value(call, 0));
        if (method !== undefined) builder.method = method;
        break;
      }
      case "uri":
      case "url": {
        const url = value(call, 0);
        const urlText = url === undefined ? undefined : asString(url);
        if (urlText !== undefined) {
          builder.url = urlText;
          builder.found = true;
        }
        break;
      }
      case "get":
      case "post":
      case "put":
      case "patch":
      case "delete":
      case "head": {
        // The verb shorthands take the URL directly.
        const url = value(call, 0);
        const urlText = url === undefined ? undefined : asString(url);
        if (urlText === undefined) break;
        builder.method = VERB_METHODS.get(call.method) ?? "GET";
        builder.url = urlText;
        builder.found = true;
        break;
      }
      case "header": {
        if (call.args.length < 2) break;
        builder.headerFrom(value(call, 0), value(call, 1), call.path);
        break;
      }
      case "basic_auth": {
        const user = value(call, 0);
        const password = value(call, 1);
        const username = user === undefined ? undefined : asString(user);
        const secret = password === undefined ? undefined : asString(password);
        if (username !== undefined)
          builder.auth = { kind: "basic", username, password: secret ?? "" };
        break;
      }
      case "bearer_auth": {
        const token = value(call, 0);
        const text = token === undefined ? undefined : asString(token);
        if (text !== undefined) builder.auth = { kind: "bearer", token: text };
        break;
      }
      case "body":
      case "send_string": {
        const body = value(call, 0);
        const text = body === undefined ? undefined : asString(body);
        if (text !== undefined) builder.bodyText = text;
        break;
      }
      case "json":
      case "send_json": {
        const body = value(call, 0);
        const text = body === undefined ? undefined : asString(body);
        if (text !== undefined) builder.bodyText = text;
        builder.bodyContentType = "application/json";
        break;
      }
      case "text": {
        // reqwest builds multipart parts with Form::new().text(name, value).
        const name = value(call, 0);
        const partValue = value(call, 1);
        const partName = name === undefined ? undefined : asString(name);
        const text = partValue === undefined ? undefined : asString(partValue);
        if (partName !== undefined && text !== undefined)
          builder.parts.push({ name: partName, value: text });
        break;
      }
      case "multipart":
        // The form itself was collected from its text() calls.
        break;
      case "form":
      case "send_form": {
        builder.bodyContentType = "application/x-www-form-urlencoded";
        const body = value(call, 0);
        const text = body === undefined ? undefined : asString(body);
        if (text !== undefined) builder.bodyText = text;
        break;
      }
      default:
        break;
    }
  }

  if (!builder.found) {
    throw new CodeParseError(
      "No supported Rust request was found. Reverse conversion reads reqwest and ureq request builders.",
    );
  }
  if (builder.method === undefined) builder.method = "GET";
  return builder.build();
}
