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
import type {
  DynamicIssue,
  ReverseClient,
  ReverseParseResult,
} from "../types.js";
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

/**
 * A PHP client whose request is `(method, url, options)`.
 *
 * Guzzle and Symfony's HttpClient share that shape exactly and disagree only
 * about what the options are called, so the differences are data here rather
 * than a second copy of the reader.
 */
interface PhpOptionsDialect {
  readonly client: ReverseClient;
  /** Name used when reporting something that could not be read. */
  readonly label: string;
  /** Option carrying basic credentials as a two-item list. */
  readonly authOption: string;
  /** Either Guzzle's boolean switch or Symfony's redirect budget. */
  readonly redirect:
    | { readonly kind: "boolean"; readonly option: string }
    | { readonly kind: "budget"; readonly option: string };
  /** Whether `new FormDataPart([...])` supplies the body, as Symfony does. */
  readonly formDataPart: boolean;
}

const GUZZLE_DIALECT: PhpOptionsDialect = {
  client: "guzzle",
  label: "Guzzle",
  authOption: "auth",
  redirect: { kind: "boolean", option: "allow_redirects" },
  formDataPart: false,
};

const SYMFONY_DIALECT: PhpOptionsDialect = {
  client: "symfony",
  label: "Symfony HttpClient",
  authOption: "auth_basic",
  redirect: { kind: "budget", option: "max_redirects" },
  formDataPart: true,
};

function fromOptionsClient(
  call: PhpCall,
  bindings: ReadonlyMap<string, StaticValue>,
  calls: readonly PhpCall[],
  dialect: PhpOptionsDialect,
): ReverseParseResult {
  const issues: DynamicIssue[] = [];
  const { client, label } = dialect;
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
        `Dynamic ${label} method cannot be resolved statically.`,
        "request()",
      ),
    );
  }

  let url = asString(urlValue);
  if (url === undefined) {
    issues.push(
      issue(
        "url",
        `Dynamic ${label} URL cannot be resolved statically.`,
        firstUnresolved(urlValue) ?? "url",
      ),
    );
  }

  // Symfony's multipart form writes the parts into `new FormDataPart([...])`
  // and passes the whole thing through two calls the reader cannot evaluate.
  // Both are recovered from the surrounding statements instead.
  const formDataPart = dialect.formDataPart
    ? calls.find((candidate) => candidate.callee === "FormDataPart")
    : undefined;

  let headers: Header[] = [];
  let headerValue = mapEntry(optionsValue, "headers");
  if (
    headerValue !== undefined &&
    asPairs(headerValue) === undefined &&
    firstUnresolved(headerValue)?.includes("getPreparedHeaders") === true
  ) {
    // `array_merge($formData->getPreparedHeaders()->toArray(), [...])`. The
    // prepared half is the multipart Content-Type and its boundary, which is
    // framing for this message rather than part of the request, so only the
    // literal half is read.
    const merge = calls.find((candidate) => candidate.callee === "array_merge");
    const literal = merge?.args.find(
      (argument) => asPairs(resolve(argument, bindings)) !== undefined,
    );
    headerValue =
      literal === undefined ? headerValue : resolve(literal, bindings);
  }
  if (headerValue !== undefined) {
    const pairs = asPairs(headerValue);
    if (pairs === undefined) {
      issues.push(
        issue(
          "headers",
          `Dynamic ${label} headers cannot be resolved statically.`,
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
          `Dynamic ${label} query cannot be resolved statically.`,
          firstUnresolved(queryValue) ?? "query",
        ),
      );
    } else url = withQuery;
  }

  let body: RequestBody | undefined;
  if (formDataPart !== undefined) {
    const fields = asPairs(
      resolve(formDataPart.args[0] ?? { kind: "null" }, bindings),
    );
    if (fields === undefined) {
      issues.push(
        issue(
          "body",
          `Dynamic ${label} multipart body cannot be resolved statically.`,
          "FormDataPart",
        ),
      );
    } else {
      body = multipartBody(fields);
    }
  }
  const multipartValue = mapEntry(optionsValue, "multipart");
  const jsonValue = mapEntry(optionsValue, "json");
  const formValue = mapEntry(optionsValue, "form_params");
  const bodyValue = mapEntry(optionsValue, "body");
  if (formDataPart !== undefined) {
    // Already read above.
  } else if (multipartValue !== undefined) {
    body = guzzleMultipart(multipartValue);
    if (body === undefined) {
      issues.push(
        issue(
          "body",
          `Dynamic ${label} multipart body cannot be resolved statically.`,
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
          `Dynamic ${label} json body cannot be resolved statically.`,
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
          `Dynamic ${label} body cannot be resolved statically.`,
          firstUnresolved(bodyValue) ?? "body",
        ),
      );
    }
  }

  const authValue = mapEntry(optionsValue, dialect.authOption);
  const auth = authValue === undefined ? undefined : authFrom(authValue);

  const redirectValue = mapEntry(optionsValue, dialect.redirect.option);
  const followRedirects =
    redirectValue === undefined
      ? true
      : dialect.redirect.kind === "boolean"
        ? (asBoolean(redirectValue) ?? true)
        : redirectValue.kind === "number"
          ? redirectValue.value > 0
          : true;

  const normalized = normalizeHeaders(headers);
  if (issues.length > 0) {
    throw new DynamicExpressionError(issues, {
      client,
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
    client,
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

/** Laravel steps that decide response handling rather than the request. */
const LARAVEL_IGNORED: ReadonlySet<string> = new Set([
  "timeout",
  "retry",
  "connectTimeout",
  "throw",
  "acceptJson",
  "accept",
]);

/**
 * Read Laravel's HTTP client, which is a fluent chain on the `Http` facade.
 *
 * The chain steps arrive as bare calls because their receiver is the previous
 * call's result rather than a name, so they are matched on the step name. That
 * is safe here: the reader only runs once the source has been identified as
 * Laravel by its facade.
 */
function fromLaravel(
  calls: readonly PhpCall[],
  bindings: ReadonlyMap<string, StaticValue>,
): ReverseParseResult {
  const issues: DynamicIssue[] = [];
  const headers: Header[] = [];
  const parts: { name: string; value: string }[] = [];
  let method: string | undefined;
  let url: string | undefined;
  let auth: RequestAuth | undefined;
  let bodyText: string | undefined;
  let bodyContentType: string | undefined;
  let formPayload: StaticValue | undefined;
  let jsonPayload: StaticValue | undefined;
  // Laravel wraps Guzzle, which follows redirects unless told not to.
  let followRedirects = true;
  let found = false;

  const argument = (call: PhpCall, index: number): StaticValue =>
    resolve(call.args[index] ?? { kind: "null" }, bindings);

  for (const call of calls) {
    const step = call.method ?? call.callee;
    if (LARAVEL_IGNORED.has(step)) continue;
    switch (step) {
      case "withHeaders": {
        const pairs = asPairs(argument(call, 0));
        if (pairs === undefined) {
          issues.push(
            issue(
              "headers",
              "Dynamic Laravel headers cannot be resolved statically.",
              "withHeaders()",
            ),
          );
          break;
        }
        for (const pair of pairs) headers.push(pair);
        break;
      }
      case "withHeader": {
        const name = asString(argument(call, 0));
        const value = asString(argument(call, 1));
        if (name === undefined || value === undefined) {
          issues.push(
            issue(
              "headers",
              "Dynamic Laravel header cannot be resolved statically.",
              "withHeader()",
            ),
          );
          break;
        }
        headers.push({ name, value });
        break;
      }
      case "withBasicAuth": {
        const username = asString(argument(call, 0));
        const password = asString(argument(call, 1));
        if (username === undefined || password === undefined) {
          issues.push(
            issue(
              "headers",
              "Dynamic Laravel credentials cannot be resolved statically.",
              "withBasicAuth()",
            ),
          );
          break;
        }
        auth = { kind: "basic", username, password };
        break;
      }
      case "withToken": {
        const token = asString(argument(call, 0));
        if (token === undefined) break;
        headers.push({ name: "Authorization", value: `Bearer ${token}` });
        break;
      }
      case "withBody": {
        const text = asString(argument(call, 0));
        if (text === undefined) {
          issues.push(
            issue(
              "body",
              "Dynamic Laravel body cannot be resolved statically.",
              "withBody()",
            ),
          );
          break;
        }
        bodyText = text;
        bodyContentType = asString(argument(call, 1));
        break;
      }
      case "attach": {
        const name = asString(argument(call, 0));
        const value = asString(argument(call, 1));
        if (name === undefined || value === undefined) {
          issues.push(
            issue(
              "body",
              "A Laravel attachment reads the file at run time, so its contents cannot be turned back into a path.",
              "attach()",
            ),
          );
          break;
        }
        parts.push({ name, value });
        break;
      }
      case "asForm":
        formPayload ??= { kind: "map", entries: [] };
        break;
      case "asJson":
        jsonPayload ??= { kind: "map", entries: [] };
        break;
      case "withQueryParameters": {
        const query = argument(call, 0);
        if (url !== undefined) {
          const withQuery = appendQuery(url, query);
          if (withQuery === undefined) {
            issues.push(
              issue(
                "url",
                "Dynamic Laravel query cannot be resolved statically.",
                "withQueryParameters()",
              ),
            );
          } else url = withQuery;
        }
        break;
      }
      case "withoutRedirecting":
        followRedirects = false;
        break;
      case "send": {
        found = true;
        method = asString(argument(call, 0))?.toUpperCase();
        url = asString(argument(call, 1));
        break;
      }
      default: {
        if (!GUZZLE_METHODS.has(step)) break;
        // `Http::post($url, $data)` and friends, where the verb names the
        // method and the second argument is the payload.
        found = true;
        method = step.toUpperCase();
        url = asString(argument(call, 0));
        if (call.args.length > 1) {
          const payload = argument(call, 1);
          if (step === "get") {
            const withQuery =
              url === undefined ? undefined : appendQuery(url, payload);
            if (withQuery !== undefined) url = withQuery;
          } else if (formPayload !== undefined) {
            formPayload = payload;
          } else {
            jsonPayload = payload;
          }
        }
        break;
      }
    }
  }

  if (!found) {
    throw new CodeParseError(
      "No Laravel HTTP request was found. The chain has to end in a verb method or in send().",
    );
  }
  if (method === undefined) {
    issues.push(
      issue(
        "method",
        "Dynamic Laravel method cannot be resolved statically.",
        "send()",
      ),
    );
  }
  if (url === undefined) {
    issues.push(
      issue("url", "Dynamic Laravel URL cannot be resolved statically.", "url"),
    );
  }

  let body: RequestBody | undefined;
  if (parts.length > 0) {
    body = multipartBody(parts);
  } else if (jsonPayload !== undefined && jsonPayload.kind === "map") {
    const encoded = toJson(jsonPayload);
    if (encoded !== undefined) {
      body = {
        kind: "json",
        value: encoded as never,
        raw: JSON.stringify(encoded),
      };
      if (!headers.some((h) => h.name.toLowerCase() === "content-type")) {
        headers.push({ name: "Content-Type", value: "application/json" });
      }
    }
  } else if (formPayload !== undefined && formPayload.kind === "map") {
    const pairs = asPairs(formPayload);
    if (pairs !== undefined) {
      body = {
        kind: "form-urlencoded",
        fields: pairs.map(({ name, value }) => ({ name, value })),
        raw: pairs
          .map(
            ({ name, value }) =>
              `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
          )
          .join("&"),
      };
      if (!headers.some((h) => h.name.toLowerCase() === "content-type")) {
        headers.push({
          name: "Content-Type",
          value: "application/x-www-form-urlencoded",
        });
      }
    }
  } else if (bodyText !== undefined) {
    const declared =
      headers.find((header) => header.name.toLowerCase() === "content-type")
        ?.value ?? bodyContentType;
    body = classifyStringBody(bodyText, declared);
  }

  const normalized = normalizeHeaders(headers);
  const effectiveAuth = auth ?? normalized.auth;
  if (issues.length > 0) {
    throw new DynamicExpressionError(issues, {
      client: "laravel",
      ...(method === undefined ? {} : { method }),
      ...(url === undefined ? {} : { url }),
      headers: normalized.headers,
      cookies: normalized.cookies,
      ...(effectiveAuth === undefined ? {} : { auth: effectiveAuth }),
      ...(body === undefined ? {} : { body }),
      followRedirects,
    });
  }
  return {
    client: "laravel",
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

export function parsePhpRequest(source: string): ReverseParseResult {
  const { calls, bindings } = readPhp(source);

  // Laravel is identified by its facade, which no other client here uses.
  if (/\bHttp::/u.test(source)) return fromLaravel(calls, bindings);

  // Guzzle and Symfony share a call shape, so the import decides between them.
  const dialect = /Symfony\\Component\\HttpClient|HttpClient::create/u.test(
    source,
  )
    ? SYMFONY_DIALECT
    : GUZZLE_DIALECT;
  const request = calls.find(
    (call) =>
      call.method !== undefined &&
      (call.method === "request" || GUZZLE_METHODS.has(call.method)) &&
      call.receiver !== undefined &&
      call.args.length > 0,
  );
  const options = curlOptions(calls, bindings);
  if (options.size > 0) return fromCurlExtension(options);
  if (request !== undefined) {
    return fromOptionsClient(request, bindings, calls, dialect);
  }

  throw new CodeParseError(
    "No supported PHP request was found. Reverse conversion reads the cURL extension (curl_setopt / curl_setopt_array), Guzzle, Symfony HttpClient, and Laravel's HTTP client.",
  );
}
