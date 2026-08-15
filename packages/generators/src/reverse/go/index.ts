import { createHttpRequest } from "@curltocode/core";
import type {
  Cookie,
  Header,
  RequestAuth,
  RequestBody,
} from "@curltocode/core";

import { normalizeHeaders } from "../normalize.js";
import { classifyStringBody, multipartBody } from "../shared/body.js";
import { asString, firstUnresolved, mapEntry } from "../shared/values.js";
import type { StaticValue } from "../shared/values.js";
import { CodeParseError, DynamicExpressionError } from "../types.js";
import type { DynamicIssue, ReverseParseResult } from "../types.js";
import { readGo, resolve } from "./syntax.js";
import type { GoCall } from "./syntax.js";

/**
 * Recover an HTTP request from Go source using either `net/http` or Resty.
 *
 * Both clients accumulate the request across statements, so the calls are read
 * in order and folded together rather than looked for in one expression.
 */

const METHOD_HELPERS: ReadonlyMap<string, string> = new Map([
  ["http.Get", "GET"],
  ["http.Head", "HEAD"],
  ["http.Post", "POST"],
  ["http.PostForm", "POST"],
]);

const RESTY_METHODS = new Set([
  "Get",
  "Head",
  "Post",
  "Put",
  "Patch",
  "Delete",
  "Options",
]);

function issue(
  kind: DynamicIssue["kind"],
  message: string,
  expression: string,
): DynamicIssue {
  return { kind, message, expression };
}

interface Collected {
  method?: string | undefined;
  url?: string | undefined;
  body?: StaticValue | undefined;
  bodyContentType?: string | undefined;
  readonly headers: Header[];
  readonly cookies: Cookie[];
  /** Ordered multipart fields, collected from writer calls. */
  readonly parts: { name: string; value: string }[];
  auth?: RequestAuth | undefined;
  readonly issues: DynamicIssue[];
  client: "nethttp" | "resty";
}

function addHeader(
  collected: Collected,
  call: GoCall,
  bindings: ReadonlyMap<string, StaticValue>,
  replace: boolean,
): void {
  const name = asString(resolve(call.args[0] ?? { kind: "null" }, bindings));
  const value = asString(resolve(call.args[1] ?? { kind: "null" }, bindings));
  if (name === undefined || value === undefined) {
    collected.issues.push(
      issue(
        "headers",
        "Dynamic header cannot be resolved statically.",
        firstUnresolved(call.args[0] ?? { kind: "null" }) ??
          firstUnresolved(call.args[1] ?? { kind: "null" }) ??
          call.callee,
      ),
    );
    return;
  }
  // `Set` replaces any existing value; `Add` appends, which is what preserves
  // a repeated header name.
  if (replace) {
    const index = collected.headers.findIndex(
      (header) => header.name.toLowerCase() === name.toLowerCase(),
    );
    if (index >= 0) {
      collected.headers.splice(index, 1, { name, value });
      return;
    }
  }
  collected.headers.push({ name, value });
}

function setAuth(
  collected: Collected,
  call: GoCall,
  bindings: ReadonlyMap<string, StaticValue>,
): void {
  const username = asString(
    resolve(call.args[0] ?? { kind: "null" }, bindings),
  );
  const password = asString(
    resolve(call.args[1] ?? { kind: "null" }, bindings),
  );
  if (username === undefined || password === undefined) {
    collected.issues.push(
      issue(
        "config",
        "Dynamic basic credentials cannot be resolved statically.",
        call.callee,
      ),
    );
    return;
  }
  collected.auth = { kind: "basic", username, password };
}

export function parseGoRequest(source: string): ReverseParseResult {
  const { calls, bindings } = readGo(source);
  const collected: Collected = {
    headers: [],
    cookies: [],
    parts: [],
    issues: [],
    client: "nethttp",
  };
  let found = false;

  for (const call of calls) {
    const args = call.args.map((argument) => resolve(argument, bindings));
    const tail = call.callee.split(".").at(-1) ?? "";

    if (
      call.callee === "http.NewRequest" ||
      call.callee === "http.NewRequestWithContext"
    ) {
      found = true;
      // The context form shifts every argument along by one.
      const offset = call.callee.endsWith("WithContext") ? 1 : 0;
      collected.method = asString(args[offset] ?? { kind: "null" });
      collected.url = asString(args[offset + 1] ?? { kind: "null" });
      const body = args[offset + 2];
      if (body !== undefined && body.kind !== "null") collected.body = body;
      continue;
    }

    const helper = METHOD_HELPERS.get(call.callee);
    if (helper !== undefined) {
      found = true;
      collected.method = helper;
      collected.url = asString(args[0] ?? { kind: "null" });
      if (call.callee === "http.Post") {
        collected.bodyContentType = asString(args[1] ?? { kind: "null" });
        const body = args[2];
        if (body !== undefined && body.kind !== "null") collected.body = body;
      }
      if (call.callee === "http.PostForm") {
        collected.bodyContentType = "application/x-www-form-urlencoded";
        collected.issues.push(
          issue(
            "body",
            "http.PostForm builds its body from a url.Values map, which this reader does not evaluate.",
            call.callee,
          ),
        );
      }
      continue;
    }

    // Resty: `request.Execute(method, url)` or `request.Get(url)`.
    if (tail === "Execute" && call.args.length >= 2) {
      found = true;
      collected.client = "resty";
      collected.method = asString(args[0] ?? { kind: "null" });
      collected.url = asString(args[1] ?? { kind: "null" });
      continue;
    }
    if (
      RESTY_METHODS.has(tail) &&
      call.args.length === 1 &&
      /^(?:request|req|r|client)\b/iu.test(call.callee)
    ) {
      found = true;
      collected.client = "resty";
      collected.method = tail.toUpperCase();
      collected.url = asString(args[0] ?? { kind: "null" });
      continue;
    }

    if (call.callee.endsWith("Header.Add")) {
      addHeader(collected, call, bindings, false);
      continue;
    }
    if (call.callee.endsWith("Header.Set") || tail === "SetHeader") {
      // multipart.Writer generates its own boundary, so a Content-Type set
      // from FormDataContentType() is not a value that can be read literally.
      const generated = firstUnresolved(args[1] ?? { kind: "null" });
      if (generated?.includes("FormDataContentType") === true) continue;
      addHeader(collected, call, bindings, true);
      continue;
    }
    if (tail === "SetBasicAuth") {
      setAuth(collected, call, bindings);
      continue;
    }
    if (tail === "SetAuthToken") {
      const token = asString(args[0] ?? { kind: "null" });
      if (token !== undefined) collected.auth = { kind: "bearer", token };
      continue;
    }
    // Multipart is assembled through a writer in net/http and through an
    // ordered form setter in Resty; both preserve field order.
    if (tail === "WriteField" && call.args.length >= 2) {
      const name = asString(args[0] ?? { kind: "null" });
      const value = asString(args[1] ?? { kind: "null" });
      if (name !== undefined && value !== undefined)
        collected.parts.push({ name, value });
      continue;
    }
    if (
      (tail === "SetMultipartOrderedFormData" ||
        tail === "SetMultipartFormData") &&
      call.args.length >= 2
    ) {
      collected.client = "resty";
      const name = asString(args[0] ?? { kind: "null" });
      const holder = args[1];
      const value =
        holder?.kind === "list" && holder.items[0] !== undefined
          ? asString(holder.items[0])
          : asString(holder ?? { kind: "null" });
      if (name !== undefined && value !== undefined)
        collected.parts.push({ name, value });
      continue;
    }
    if (tail === "AddCookie" && call.args.length >= 1) {
      const cookie = args[0];
      const name = cookie === undefined ? undefined : mapEntry(cookie, "Name");
      const value =
        cookie === undefined ? undefined : mapEntry(cookie, "Value");
      const cookieName = name === undefined ? undefined : asString(name);
      const cookieValue = value === undefined ? undefined : asString(value);
      if (cookieName !== undefined && cookieValue !== undefined) {
        collected.cookies.push({ name: cookieName, value: cookieValue });
        continue;
      }
      collected.issues.push(
        issue(
          "config",
          "Dynamic cookie cannot be resolved statically.",
          call.callee,
        ),
      );
      continue;
    }
    if (tail === "SetBody") {
      collected.client = "resty";
      const body = args[0];
      if (body !== undefined && body.kind !== "null") collected.body = body;
      continue;
    }
  }

  if (!found) {
    throw new CodeParseError(
      "No supported Go request was found. Reverse conversion reads net/http (http.NewRequest, http.Get, http.Post) and Resty.",
    );
  }

  // Both clients follow redirects by default. The generated opt-out is an
  // ErrUseLastResponse policy for net/http and NoRedirectPolicy for Resty.
  const followRedirects =
    !source.includes("http.ErrUseLastResponse") &&
    !source.includes("NoRedirectPolicy");

  const headers = [...collected.headers];
  if (
    collected.bodyContentType !== undefined &&
    !headers.some((header) => header.name.toLowerCase() === "content-type")
  ) {
    headers.push({ name: "Content-Type", value: collected.bodyContentType });
  }

  if (collected.url === undefined) {
    collected.issues.push(
      issue("url", "Dynamic URL cannot be resolved statically.", "request URL"),
    );
  }
  if (collected.method === undefined) {
    collected.issues.push(
      issue(
        "method",
        "Dynamic method cannot be resolved statically.",
        "request method",
      ),
    );
  }

  let body: RequestBody | undefined;
  if (collected.parts.length > 0) {
    body = multipartBody(collected.parts);
  } else if (collected.body !== undefined) {
    const text = asString(collected.body);
    if (text === undefined) {
      collected.issues.push(
        issue(
          "body",
          "Dynamic request body cannot be resolved statically.",
          firstUnresolved(collected.body) ?? "request body",
        ),
      );
    } else {
      body = classifyStringBody(
        text,
        headers.find((header) => header.name.toLowerCase() === "content-type")
          ?.value,
      );
    }
  }

  const normalized = normalizeHeaders(headers);
  const cookies = [...normalized.cookies, ...collected.cookies];
  const auth = collected.auth ?? normalized.auth;
  if (collected.issues.length > 0) {
    throw new DynamicExpressionError(collected.issues, {
      client: collected.client,
      ...(collected.method === undefined ? {} : { method: collected.method }),
      ...(collected.url === undefined ? {} : { url: collected.url }),
      headers: normalized.headers,
      cookies,
      ...(auth === undefined ? {} : { auth }),
      ...(body === undefined ? {} : { body }),
      followRedirects,
    });
  }
  return {
    client: collected.client,
    request: createHttpRequest(collected.url ?? "", {
      method: collected.method ?? "GET",
      headers: normalized.headers,
      cookies,
      ...(auth === undefined ? {} : { auth }),
      ...(body === undefined ? {} : { body }),
      followRedirects,
    }),
  };
}
