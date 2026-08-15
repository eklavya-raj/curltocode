import { createHttpRequest } from "@curltocode/core";
import type { Header, RequestAuth, RequestBody } from "@curltocode/core";

import { normalizeHeaders } from "../normalize.js";
import { classifyStringBody, multipartBody } from "../shared/body.js";
import {
  asBoolean,
  asPairs,
  asString,
  firstUnresolved,
  mapEntry,
} from "../shared/values.js";
import type { StaticValue } from "../shared/values.js";
import { CodeParseError, DynamicExpressionError } from "../types.js";
import type { DynamicIssue, ReverseParseResult } from "../types.js";
import { readPhp, resolve } from "./syntax.js";
import type { PhpCall } from "./syntax.js";

/**
 * Recover an HTTP request from PHP source using either the cURL extension or
 * Guzzle.
 *
 * The two are read together because a single file commonly contains only one
 * of them, and the option names are distinct enough that there is no ambiguity
 * about which client a call belongs to.
 */

const GUZZLE_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
]);

function issue(
  kind: DynamicIssue["kind"],
  message: string,
  expression: string,
): DynamicIssue {
  return { kind, message, expression };
}

/** Collect the CURLOPT_* settings from both cURL configuration forms. */
function curlOptions(
  calls: readonly PhpCall[],
  bindings: ReadonlyMap<string, StaticValue>,
): ReadonlyMap<string, StaticValue> {
  const options = new Map<string, StaticValue>();
  for (const call of calls) {
    if (call.callee === "curl_setopt_array") {
      const array = resolve(call.args[1] ?? { kind: "null" }, bindings);
      if (array.kind !== "map") continue;
      for (const entry of array.entries) {
        const name =
          entry.key.kind === "identifier"
            ? entry.key.name
            : (asString(entry.key) ?? "");
        if (name.startsWith("CURLOPT_"))
          options.set(name.toUpperCase(), resolve(entry.value, bindings));
      }
      continue;
    }
    if (call.callee === "curl_setopt" && call.args.length >= 3) {
      const key = call.args[1];
      const name = key?.kind === "identifier" ? key.name : undefined;
      if (name?.startsWith("CURLOPT_") === true) {
        options.set(
          name.toUpperCase(),
          resolve(call.args[2] ?? { kind: "null" }, bindings),
        );
      }
    }
  }
  return options;
}

/**
 * Read a body value the way each client's option would send it.
 *
 * PHP's cURL extension switches representation on the argument type: a string
 * is sent verbatim, while an array is sent as multipart/form-data. That
 * distinction is invisible in the option name, so it is made here.
 */
function bodyFrom(
  value: StaticValue,
  headers: readonly Header[],
  arrayIsMultipart: boolean,
): RequestBody | undefined {
  const contentType = headers.find(
    (header) => header.name.toLowerCase() === "content-type",
  )?.value;
  const text = asString(value);
  if (text !== undefined) return classifyStringBody(text, contentType);
  const pairs = asPairs(value);
  if (pairs === undefined) return undefined;
  if (arrayIsMultipart) return multipartBody(pairs);
  return {
    kind: "form-urlencoded",
    fields: pairs.map(({ name, value: entry }) => ({ name, value: entry })),
    raw: pairs
      .map(
        ({ name, value: entry }) =>
          `${encodeURIComponent(name)}=${encodeURIComponent(entry)}`,
      )
      .join("&"),
  };
}

/**
 * Guzzle's `multipart` option is a list of part descriptions rather than a
 * name/value mapping, so it is read separately.
 */
function guzzleMultipart(value: StaticValue): RequestBody | undefined {
  if (value.kind !== "list") return undefined;
  const pairs: { name: string; value: string }[] = [];
  for (const item of value.items) {
    const name = mapEntry(item, "name");
    const contents = mapEntry(item, "contents");
    if (name === undefined || contents === undefined) return undefined;
    const partName = asString(name);
    const partValue = asString(contents);
    if (partName === undefined || partValue === undefined) return undefined;
    pairs.push({ name: partName, value: partValue });
  }
  return multipartBody(pairs);
}

function authFrom(value: StaticValue): RequestAuth | undefined {
  if (value.kind !== "list" || value.items.length < 2) return undefined;
  const username =
    value.items[0] === undefined ? undefined : asString(value.items[0]);
  const password =
    value.items[1] === undefined ? undefined : asString(value.items[1]);
  if (username === undefined || password === undefined) return undefined;
  return { kind: "basic", username, password };
}

function appendQuery(url: string, query: StaticValue): string | undefined {
  const pairs = asPairs(query);
  if (pairs === undefined) return undefined;
  try {
    const parsed = new URL(url);
    for (const { name, value } of pairs)
      parsed.searchParams.append(name, value);
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function fromCurlExtension(
  options: ReadonlyMap<string, StaticValue>,
): ReverseParseResult {
  const issues: DynamicIssue[] = [];
  const urlValue = options.get("CURLOPT_URL");
  const url = urlValue === undefined ? undefined : asString(urlValue);
  if (url === undefined) {
    issues.push(
      issue(
        "url",
        "Dynamic CURLOPT_URL cannot be resolved statically.",
        urlValue === undefined
          ? "CURLOPT_URL"
          : (firstUnresolved(urlValue) ?? "CURLOPT_URL"),
      ),
    );
  }

  const headerValue = options.get("CURLOPT_HTTPHEADER");
  let headers: Header[] = [];
  if (headerValue !== undefined) {
    const pairs = asPairs(headerValue);
    if (pairs === undefined) {
      issues.push(
        issue(
          "headers",
          "Dynamic CURLOPT_HTTPHEADER cannot be resolved statically.",
          firstUnresolved(headerValue) ?? "CURLOPT_HTTPHEADER",
        ),
      );
    } else headers = pairs.map(({ name, value }) => ({ name, value }));
  }

  // Several options set a single header rather than appearing in
  // CURLOPT_HTTPHEADER. Folding them in lets the shared header normalizer
  // extract cookies and auth exactly as it does for every other client.
  for (const [option, header] of [
    ["CURLOPT_COOKIE", "Cookie"],
    ["CURLOPT_USERAGENT", "User-Agent"],
    ["CURLOPT_REFERER", "Referer"],
  ] as const) {
    const value = options.get(option);
    const text = value === undefined ? undefined : asString(value);
    if (
      text !== undefined &&
      !headers.some(
        (entry) => entry.name.toLowerCase() === header.toLowerCase(),
      )
    ) {
      headers.push({ name: header, value: text });
    }
  }

  const postFields = options.get("CURLOPT_POSTFIELDS");
  let body: RequestBody | undefined;
  if (postFields !== undefined) {
    body = bodyFrom(postFields, headers, true);
    if (body === undefined) {
      issues.push(
        issue(
          "body",
          "Dynamic CURLOPT_POSTFIELDS cannot be resolved statically.",
          firstUnresolved(postFields) ?? "CURLOPT_POSTFIELDS",
        ),
      );
    }
  }

  const custom = options.get("CURLOPT_CUSTOMREQUEST");
  const nobody = options.get("CURLOPT_NOBODY");
  const post = options.get("CURLOPT_POST");
  const method =
    custom !== undefined
      ? asString(custom)
      : nobody !== undefined && asBoolean(nobody) === true
        ? "HEAD"
        : (post !== undefined && asBoolean(post) === true) || body !== undefined
          ? "POST"
          : "GET";
  if (method === undefined) {
    issues.push(
      issue(
        "method",
        "Dynamic CURLOPT_CUSTOMREQUEST cannot be resolved statically.",
        custom === undefined
          ? "CURLOPT_CUSTOMREQUEST"
          : (firstUnresolved(custom) ?? ""),
      ),
    );
  }

  const follow = options.get("CURLOPT_FOLLOWLOCATION");
  const followRedirects =
    follow === undefined ? false : (asBoolean(follow) ?? false);

  const userPassword = options.get("CURLOPT_USERPWD");
  let auth: RequestAuth | undefined;
  const credentials =
    userPassword === undefined ? undefined : asString(userPassword);
  if (credentials !== undefined) {
    const separator = credentials.indexOf(":");
    auth =
      separator < 0
        ? { kind: "basic", username: credentials, password: "" }
        : {
            kind: "basic",
            username: credentials.slice(0, separator),
            password: credentials.slice(separator + 1),
          };
  }

  const normalized = normalizeHeaders(headers);
  if (issues.length > 0) {
    throw new DynamicExpressionError(issues, {
      client: "curl",
      ...(method === undefined ? {} : { method }),
      ...(url === undefined ? {} : { url }),
      headers: normalized.headers,
      cookies: normalized.cookies,
      ...(body === undefined ? {} : { body }),
      followRedirects,
    });
  }
  return {
    client: "curl",
    request: createHttpRequest(url ?? "", {
      method: method ?? "GET",
      headers: normalized.headers,
      cookies: normalized.cookies,
      ...((auth ?? normalized.auth) === undefined
        ? {}
        : { auth: (auth ?? normalized.auth) as RequestAuth }),
      ...(body === undefined ? {} : { body }),
      followRedirects,
    }),
  };
}

function fromGuzzle(
  call: PhpCall,
  bindings: ReadonlyMap<string, StaticValue>,
): ReverseParseResult {
  const issues: DynamicIssue[] = [];
  const named = call.method !== undefined && GUZZLE_METHODS.has(call.method);
  const methodValue = named
    ? undefined
    : resolve(call.args[0] ?? { kind: "null" }, bindings);
  const urlValue = resolve(
    call.args[named ? 0 : 1] ?? { kind: "null" },
    bindings,
  );
  const optionsValue = resolve(
    call.args[named ? 1 : 2] ?? { kind: "map", entries: [] },
    bindings,
  );

  const method = named
    ? (call.method ?? "get").toUpperCase()
    : methodValue === undefined
      ? undefined
      : asString(methodValue)?.toUpperCase();
  if (method === undefined) {
    issues.push(
      issue(
        "method",
        "Dynamic Guzzle method cannot be resolved statically.",
        "request()",
      ),
    );
  }

  let url = asString(urlValue);
  if (url === undefined) {
    issues.push(
      issue(
        "url",
        "Dynamic Guzzle URL cannot be resolved statically.",
        firstUnresolved(urlValue) ?? "url",
      ),
    );
  }

  let headers: Header[] = [];
  const headerValue = mapEntry(optionsValue, "headers");
  if (headerValue !== undefined) {
    const pairs = asPairs(headerValue);
    if (pairs === undefined) {
      issues.push(
        issue(
          "headers",
          "Dynamic Guzzle headers cannot be resolved statically.",
          firstUnresolved(headerValue) ?? "headers",
        ),
      );
    } else headers = pairs.map(({ name, value }) => ({ name, value }));
  }

  const queryValue = mapEntry(optionsValue, "query");
  if (queryValue !== undefined && url !== undefined) {
    const withQuery = appendQuery(url, queryValue);
    if (withQuery === undefined) {
      issues.push(
        issue(
          "url",
          "Dynamic Guzzle query cannot be resolved statically.",
          firstUnresolved(queryValue) ?? "query",
        ),
      );
    } else url = withQuery;
  }

  let body: RequestBody | undefined;
  const multipartValue = mapEntry(optionsValue, "multipart");
  const jsonValue = mapEntry(optionsValue, "json");
  const formValue = mapEntry(optionsValue, "form_params");
  const bodyValue = mapEntry(optionsValue, "body");
  if (multipartValue !== undefined) {
    body = guzzleMultipart(multipartValue);
    if (body === undefined) {
      issues.push(
        issue(
          "body",
          "Dynamic Guzzle multipart body cannot be resolved statically.",
          firstUnresolved(multipartValue) ?? "multipart",
        ),
      );
    }
  } else if (jsonValue !== undefined) {
    const encoded = toJson(jsonValue);
    if (encoded === undefined) {
      issues.push(
        issue(
          "body",
          "Dynamic Guzzle json body cannot be resolved statically.",
          firstUnresolved(jsonValue) ?? "json",
        ),
      );
    } else {
      body = {
        kind: "json",
        value: encoded as never,
        raw: JSON.stringify(encoded),
      };
      if (
        !headers.some((header) => header.name.toLowerCase() === "content-type")
      )
        headers.push({ name: "Content-Type", value: "application/json" });
    }
  } else if (formValue !== undefined) {
    body = bodyFrom(formValue, headers, false);
    if (
      body !== undefined &&
      !headers.some((h) => h.name.toLowerCase() === "content-type")
    ) {
      headers.push({
        name: "Content-Type",
        value: "application/x-www-form-urlencoded",
      });
    }
  } else if (bodyValue !== undefined) {
    body = bodyFrom(bodyValue, headers, false);
    if (body === undefined) {
      issues.push(
        issue(
          "body",
          "Dynamic Guzzle body cannot be resolved statically.",
          firstUnresolved(bodyValue) ?? "body",
        ),
      );
    }
  }

  const authValue = mapEntry(optionsValue, "auth");
  const auth = authValue === undefined ? undefined : authFrom(authValue);

  const redirectValue = mapEntry(optionsValue, "allow_redirects");
  const followRedirects =
    redirectValue === undefined ? true : (asBoolean(redirectValue) ?? true);

  const normalized = normalizeHeaders(headers);
  if (issues.length > 0) {
    throw new DynamicExpressionError(issues, {
      client: "guzzle",
      ...(method === undefined ? {} : { method }),
      ...(url === undefined ? {} : { url }),
      headers: normalized.headers,
      cookies: normalized.cookies,
      ...(body === undefined ? {} : { body }),
      followRedirects,
    });
  }
  const effectiveAuth = auth ?? normalized.auth;
  return {
    client: "guzzle",
    request: createHttpRequest(url ?? "", {
      method: method ?? "GET",
      headers: normalized.headers,
      cookies: normalized.cookies,
      ...(effectiveAuth === undefined ? {} : { auth: effectiveAuth }),
      ...(body === undefined ? {} : { body }),
      followRedirects,
    }),
  };
}

/** Convert a resolved value into JSON, or undefined if anything is dynamic. */
function toJson(value: StaticValue): unknown {
  switch (value.kind) {
    case "string":
      return value.value;
    case "number":
      return value.value;
    case "boolean":
      return value.value;
    case "null":
      return null;
    case "list": {
      const items = value.items.map(toJson);
      return items.some((item) => item === undefined) ? undefined : items;
    }
    case "map": {
      const object: Record<string, unknown> = {};
      for (const entry of value.entries) {
        const key = asString(entry.key);
        const entryValue = toJson(entry.value);
        if (key === undefined || entryValue === undefined) return undefined;
        object[key] = entryValue;
      }
      return object;
    }
    default:
      return undefined;
  }
}

export function parsePhpRequest(source: string): ReverseParseResult {
  const { calls, bindings } = readPhp(source);

  // Guzzle is checked first: a file using it will not also configure the cURL
  // extension, and its calls are unambiguous.
  const guzzle = calls.find(
    (call) =>
      call.method !== undefined &&
      (call.method === "request" || GUZZLE_METHODS.has(call.method)) &&
      call.receiver !== undefined &&
      call.args.length > 0,
  );
  const options = curlOptions(calls, bindings);
  if (options.size > 0) return fromCurlExtension(options);
  if (guzzle !== undefined) return fromGuzzle(guzzle, bindings);

  throw new CodeParseError(
    "No supported PHP request was found. Reverse conversion reads the cURL extension (curl_setopt / curl_setopt_array) and Guzzle.",
  );
}
