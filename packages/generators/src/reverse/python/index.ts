import { createHttpRequest } from "@curltocode/core";
import type {
  FormField,
  Header,
  MultipartPart,
  RequestBody,
} from "@curltocode/core";

import { normalizeHeaders } from "../normalize.js";
import { CodeParseError, DynamicExpressionError } from "../types.js";
import type {
  DynamicIssue,
  ReverseClient,
  ReverseParseResult,
  StaticRequestDetails,
} from "../types.js";
import {
  collectBindings,
  collectCalls,
  deepResolve,
  resolve,
} from "./syntax.js";
import { detectPythonStdlib, parsePythonStdlibRequest } from "./stdlib.js";
import {
  appendQuery,
  asJson,
  asString,
  contentTypeOf,
  filePathFrom,
  pairs,
  parseJsonText,
} from "./values.js";
import type { PythonArguments, PythonCall, PythonNode } from "./syntax.js";

/**
 * Recover an HTTP request from Python source using requests, HTTPX, or aiohttp.
 *
 * The reader in `syntax.ts` resolves only values that are statically knowable.
 * Everything else arrives here as an `unresolved` node and is reported as an
 * issue, so this parser never guesses at what a request would have sent.
 */

const METHOD_FUNCTIONS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
]);

interface Detected {
  readonly client: ReverseClient;
  readonly call: PythonCall;
  /** Method taken from the function name, absent for `request(...)` forms. */
  readonly method?: string;
}

/**
 * Identify the request call. `requests.get(...)` and `httpx.post(...)` carry the
 * method in the name; `requests.request("PATCH", ...)` takes it as an argument.
 * aiohttp is reached through a session object, so its receiver is matched by
 * shape rather than by a fixed module name.
 */
function detect(
  source: string,
  calls: readonly PythonCall[],
): Detected | undefined {
  const usesAiohttp = /\baiohttp\b/u.test(source);
  const sessionNames = new Set<string>();
  // `requests.Session()` and `httpx.Client()` are the idiomatic way to reuse a
  // connection, so the request call is usually made on the instance rather
  // than on the module. Both the assignment and the `with ... as` form appear
  // in real code and in the official documentation.
  const moduleClients = new Map<string, ReverseClient>();
  for (const [pattern, client] of [
    [/([A-Za-z_][A-Za-z0-9_]*)\s*=\s*requests\.Session\(/gu, "requests"],
    [
      /(?:with\s+)?requests\.Session\(\s*\)\s*as\s+([A-Za-z_][A-Za-z0-9_]*)/gu,
      "requests",
    ],
    [/([A-Za-z_][A-Za-z0-9_]*)\s*=\s*httpx\.(?:Async)?Client\(/gu, "httpx"],
    [
      /(?:async\s+)?(?:with\s+)?httpx\.(?:Async)?Client\([^)]*\)\s*as\s+([A-Za-z_][A-Za-z0-9_]*)/gu,
      "httpx",
    ],
  ] as const) {
    for (const match of source.matchAll(pattern)) {
      const name = match[1];
      if (name !== undefined) moduleClients.set(name, client);
    }
  }
  if (usesAiohttp) {
    for (const match of source.matchAll(
      /(?:async\s+with\s+)?aiohttp\.ClientSession\([^)]*\)\s*as\s+([A-Za-z_][A-Za-z0-9_]*)/gu,
    )) {
      const name = match[1];
      if (name !== undefined) sessionNames.add(name);
    }
    for (const match of source.matchAll(
      /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*aiohttp\.ClientSession\(/gu,
    )) {
      const name = match[1];
      if (name !== undefined) sessionNames.add(name);
    }
  }

  for (const call of calls) {
    const segments = call.callee.split(".");
    const receiver = segments.slice(0, -1).join(".");
    const name = segments[segments.length - 1] ?? "";

    if (usesAiohttp && sessionNames.has(receiver)) {
      if (METHOD_FUNCTIONS.has(name))
        return { client: "aiohttp", call, method: name.toUpperCase() };
      if (name === "request") return { client: "aiohttp", call };
    }

    const module = segments[0] ?? "";
    // `httpx.get(...)`, `requests.get(...)`, and client instances such as
    // `client.get(...)` where the client was built from one of those modules.
    const client: ReverseClient | undefined =
      module === "requests"
        ? "requests"
        : module === "httpx"
          ? "httpx"
          : moduleClients.get(receiver);
    if (client === undefined) continue;
    if (METHOD_FUNCTIONS.has(name))
      return { client, call, method: name.toUpperCase() };
    if (name === "request") return { client, call };
  }
  return undefined;
}

function issueFor(
  kind: DynamicIssue["kind"],
  message: string,
  node: PythonNode,
): DynamicIssue {
  return {
    kind,
    message,
    expression: node.kind === "unresolved" ? node.source : "unknown expression",
  };
}

interface BodyOutcome {
  readonly body?: RequestBody;
  readonly header?: Header;
  /** Set when an explicit Content-Type is now implied by the body kind. */
  readonly dropContentType?: boolean;
}

function multipartFrom(node: PythonNode): readonly MultipartPart[] | undefined {
  const entries =
    node.kind === "dict"
      ? node.entries.map((entry) => ({ key: entry.key, value: entry.value }))
      : node.kind === "list" || node.kind === "tuple"
        ? node.items.map((item) =>
            (item.kind === "tuple" || item.kind === "list") &&
            item.items.length === 2
              ? {
                  key: item.items[0] as PythonNode,
                  value: item.items[1] as PythonNode,
                }
              : undefined,
          )
        : undefined;
  if (entries === undefined || entries.some((entry) => entry === undefined))
    return undefined;

  const parts: MultipartPart[] = [];
  for (const entry of entries as { key: PythonNode; value: PythonNode }[]) {
    const name = asString(entry.key);
    if (name === undefined) return undefined;
    const value = entry.value;

    // A plain string is a text field.
    const text = asString(value);
    if (text !== undefined) {
      parts.push({ kind: "field", name, value: text });
      continue;
    }

    // open("avatar.png", "rb") — with or without the surrounding tuple that
    // supplies a filename and content type.
    const asFile = (candidate: PythonNode): string | undefined =>
      candidate.kind === "call" &&
      candidate.callee === "open" &&
      candidate.args.positional[0]?.kind === "string"
        ? (candidate.args.positional[0] as { value: string }).value
        : undefined;

    const direct = asFile(value);
    if (direct !== undefined) {
      parts.push({ kind: "file", name, path: direct, filename: direct });
      continue;
    }

    if (value.kind === "tuple" || value.kind === "list") {
      const [filenameNode, contentNode, typeNode] = value.items;
      // A `None` filename is how Python spells "this part is a plain field".
      const filename =
        filenameNode === undefined || filenameNode.kind === "none"
          ? undefined
          : asString(filenameNode);
      const path = contentNode === undefined ? undefined : asFile(contentNode);
      const contentType =
        typeNode === undefined ? undefined : asString(typeNode);
      if (path !== undefined) {
        parts.push({
          kind: "file",
          name,
          path,
          ...(filename === undefined || filename === path ? {} : { filename }),
          ...(contentType === undefined ? {} : { contentType }),
        });
        continue;
      }
      const inline =
        contentNode === undefined ? undefined : asString(contentNode);
      if (inline !== undefined) {
        parts.push({ kind: "field", name, value: inline });
        continue;
      }
    }
    return undefined;
  }
  return parts;
}

/**
 * Rebuild a multipart body from `aiohttp.FormData`, which is populated by
 * `add_field` calls rather than written as a literal. Only calls appearing
 * before the request are considered, so a form mutated afterwards cannot be
 * mistaken for part of it.
 */
function formDataParts(
  variable: string,
  calls: readonly PythonCall[],
  bindings: ReadonlyMap<string, PythonNode>,
  before: number,
): readonly MultipartPart[] | undefined {
  const parts: MultipartPart[] = [];
  for (const candidate of calls) {
    if (candidate.start >= before) continue;
    if (candidate.callee !== `${variable}.add_field`) continue;
    const nameNode = candidate.args.positional[0];
    const valueNode = candidate.args.positional[1];
    if (nameNode === undefined || valueNode === undefined) return undefined;
    const name = asString(deepResolve(nameNode, bindings));
    if (name === undefined) return undefined;

    const path = filePathFrom(valueNode, bindings);
    if (path !== undefined) {
      const filenameNode = candidate.args.keyword.get("filename");
      const typeNode = candidate.args.keyword.get("content_type");
      const filename =
        filenameNode === undefined
          ? undefined
          : asString(deepResolve(filenameNode, bindings));
      const contentType =
        typeNode === undefined
          ? undefined
          : asString(deepResolve(typeNode, bindings));
      parts.push({
        kind: "file",
        name,
        path,
        ...(filename === undefined || filename === path ? {} : { filename }),
        ...(contentType === undefined ? {} : { contentType }),
      });
      continue;
    }

    const text = asString(deepResolve(valueNode, bindings));
    if (text === undefined) return undefined;
    parts.push({ kind: "field", name, value: text });
  }
  return parts;
}

function bodyFrom(
  args: PythonArguments,
  bindings: ReadonlyMap<string, PythonNode>,
  issues: DynamicIssue[],
  declaredContentType: string | undefined,
): BodyOutcome {
  const read = (key: string): PythonNode | undefined => {
    const raw = args.keyword.get(key);
    return raw === undefined ? undefined : deepResolve(raw, bindings);
  };

  const bodyFromText = (text: string): BodyOutcome => {
    if (
      declaredContentType?.toLowerCase().startsWith("application/json") === true
    ) {
      const value = parseJsonText(text);
      if (value !== undefined) {
        return { body: { kind: "json", value, raw: text } };
      }
    }
    return { body: { kind: "text", value: text } };
  };

  const binaryFrom = (node: PythonNode): BodyOutcome | undefined => {
    if (node.kind !== "encoded") return undefined;
    const text = asString(node.value);
    if (text === undefined) {
      issues.push(
        issueFor(
          "body",
          "Dynamic binary body cannot be resolved statically.",
          node.value,
        ),
      );
      return {};
    }
    return {
      body: { kind: "binary", source: { kind: "inline", value: text } },
    };
  };

  const json = read("json");
  if (json !== undefined) {
    const value = asJson(json);
    if (value === undefined) {
      issues.push(
        issueFor(
          "body",
          "Dynamic JSON body cannot be resolved statically.",
          json,
        ),
      );
      return {};
    }
    return {
      body: { kind: "json", value, raw: JSON.stringify(value) },
      header: { name: "Content-Type", value: "application/json" },
    };
  }

  const files = read("files");
  if (files !== undefined) {
    const parts = multipartFrom(files);
    if (parts === undefined) {
      issues.push(
        issueFor(
          "body",
          "Dynamic multipart body cannot be resolved statically.",
          files,
        ),
      );
      return {};
    }
    // `data=` alongside `files=` contributes extra text fields.
    const extra = read("data");
    const extraFields = extra === undefined ? [] : (pairs(extra) ?? undefined);
    if (extra !== undefined && extraFields === undefined) {
      issues.push(
        issueFor(
          "body",
          "Dynamic multipart fields cannot be resolved statically.",
          extra,
        ),
      );
      return {};
    }
    return {
      body: {
        kind: "multipart",
        parts: [
          ...(extraFields ?? []).map((field): MultipartPart => ({
            kind: "field",
            name: field.name,
            value: field.value,
          })),
          ...parts,
        ],
      },
    };
  }

  // HTTPX spells a raw body `content=`; requests overloads `data=`.
  const content = read("content");
  if (content !== undefined) {
    const binary = binaryFrom(content);
    if (binary !== undefined) return binary;
    const text = asString(content);
    if (text === undefined) {
      issues.push(
        issueFor(
          "body",
          "Dynamic body cannot be resolved statically.",
          content,
        ),
      );
      return {};
    }
    return bodyFromText(text);
  }

  const data = read("data");
  if (data !== undefined) {
    const binary = binaryFrom(data);
    if (binary !== undefined) return binary;
    const fields = pairs(data);
    if (fields !== undefined) {
      const raw = fields
        .map(
          (field) =>
            `${encodeURIComponent(field.name)}=${encodeURIComponent(field.value)}`,
        )
        .join("&");
      // No header is attached: a form-urlencoded body already implies the
      // content type throughout the model, and adding it explicitly would make
      // a round trip emit a header the original command did not carry.
      return { body: { kind: "form-urlencoded", fields, raw } };
    }
    const text = asString(data);
    if (text !== undefined) {
      // A pre-encoded string under a form content type is a form body. Reading
      // it back as one lets the explicit header drop away, because the model
      // already implies it — otherwise a round trip would grow a header.
      if (
        declaredContentType
          ?.toLowerCase()
          .startsWith("application/x-www-form-urlencoded") === true
      ) {
        const fields: FormField[] = [];
        for (const pair of text.split("&")) {
          if (pair.length === 0) continue;
          const separator = pair.indexOf("=");
          fields.push({
            name: decodeURIComponent(
              separator < 0 ? pair : pair.slice(0, separator),
            ),
            value:
              separator < 0
                ? ""
                : decodeURIComponent(pair.slice(separator + 1)),
          });
        }
        return {
          body: { kind: "form-urlencoded", fields, raw: text },
          dropContentType: true,
        };
      }
      return bodyFromText(text);
    }
    issues.push(
      issueFor("body", "Dynamic body cannot be resolved statically.", data),
    );
  }

  return {};
}

export function parsePythonRequest(source: string): ReverseParseResult {
  const calls = collectCalls(source);
  // The two stdlib-adjacent clients are checked first: their call shapes are
  // distinct, and `connection.request(...)` would otherwise be indistinguishable
  // from a Requests session call.
  const stdlib = detectPythonStdlib(source, calls);
  if (stdlib !== undefined) {
    return parsePythonStdlibRequest(source, calls, stdlib);
  }
  const detected = detect(source, calls);
  if (detected === undefined) {
    throw new CodeParseError(
      "No supported Requests, HTTPX, aiohttp, urllib3, or http.client call was found.",
    );
  }

  const { call, client } = detected;
  const bindings = collectBindings(source, call.start);
  const issues: DynamicIssue[] = [];
  const positional = call.args.positional;

  let method = detected.method;
  let urlNode: PythonNode | undefined;
  if (method === undefined) {
    const methodNode = positional[0];
    const urlCandidate = positional[1];
    const resolvedMethod =
      methodNode === undefined ? undefined : deepResolve(methodNode, bindings);
    const literalMethod =
      resolvedMethod === undefined ? undefined : asString(resolvedMethod);
    if (literalMethod === undefined) {
      issues.push(
        issueFor(
          "method",
          "Dynamic HTTP method cannot be resolved statically.",
          resolvedMethod ?? { kind: "unresolved", source: "missing method" },
        ),
      );
    } else {
      method = literalMethod.toUpperCase();
    }
    urlNode = urlCandidate;
  } else {
    urlNode = positional[0];
  }

  const resolvedUrl =
    urlNode === undefined ? undefined : deepResolve(urlNode, bindings);
  const urlFromKeyword = call.args.keyword.get("url");
  const urlSource =
    resolvedUrl ??
    (urlFromKeyword === undefined
      ? undefined
      : deepResolve(urlFromKeyword, bindings));
  const url = urlSource === undefined ? undefined : asString(urlSource);
  if (url === undefined) {
    issues.push(
      issueFor(
        "url",
        "Dynamic URL cannot be resolved statically.",
        urlSource ?? { kind: "unresolved", source: "missing url" },
      ),
    );
  }

  const headers: Header[] = [];
  const headersNode = call.args.keyword.get("headers");
  if (headersNode !== undefined) {
    const resolvedHeaders = deepResolve(headersNode, bindings);
    const entries = pairs(resolvedHeaders);
    if (entries === undefined) {
      issues.push(
        issueFor(
          "headers",
          "Dynamic headers cannot be resolved statically.",
          resolvedHeaders,
        ),
      );
    } else {
      headers.push(
        ...entries.map((entry) => ({ name: entry.name, value: entry.value })),
      );
    }
  }

  const cookiesNode = call.args.keyword.get("cookies");
  if (cookiesNode !== undefined) {
    const resolvedCookies = deepResolve(cookiesNode, bindings);
    const entries = pairs(resolvedCookies);
    if (entries === undefined) {
      issues.push(
        issueFor(
          "headers",
          "Dynamic cookies cannot be resolved statically.",
          resolvedCookies,
        ),
      );
    } else if (entries.length > 0) {
      headers.push({
        name: "Cookie",
        value: entries
          .map((entry) => `${entry.name}=${entry.value}`)
          .join("; "),
      });
    }
  }

  const authNode = call.args.keyword.get("auth");
  if (authNode !== undefined) {
    const resolvedAuth = deepResolve(authNode, bindings);
    // requests and HTTPX take a plain tuple; aiohttp wraps the same pair in
    // BasicAuth, and HTTPX accepts its own equivalent.
    const credentials =
      resolvedAuth.kind === "tuple" || resolvedAuth.kind === "list"
        ? resolvedAuth.items
        : resolvedAuth.kind === "call" &&
            /(?:^|\.)BasicAuth$/u.test(resolvedAuth.callee)
          ? resolvedAuth.args.positional.map((item) =>
              deepResolve(item, bindings),
            )
          : undefined;
    const username =
      credentials?.[0] === undefined ? undefined : asString(credentials[0]);
    const password =
      credentials?.[1] === undefined ? undefined : asString(credentials[1]);
    if (username === undefined || password === undefined) {
      issues.push(
        issueFor(
          "headers",
          "Dynamic authentication cannot be resolved statically.",
          resolvedAuth,
        ),
      );
    } else {
      headers.push({
        name: "Authorization",
        value: `Basic ${btoa(`${username}:${password}`)}`,
      });
    }
  }

  const paramsNode = call.args.keyword.get("params");
  let query: readonly FormField[] = [];
  if (paramsNode !== undefined) {
    const resolvedParams = deepResolve(paramsNode, bindings);
    const entries = pairs(resolvedParams);
    if (entries === undefined) {
      issues.push(
        issueFor(
          "url",
          "Dynamic query parameters cannot be resolved statically.",
          resolvedParams,
        ),
      );
    } else {
      query = entries.map((entry) => ({
        name: entry.name,
        value: entry.value,
      }));
    }
  }

  // aiohttp assembles multipart through FormData rather than a literal, so it
  // is resolved from the surrounding statements before the literal shapes.
  const rawData = call.args.keyword.get("data");
  let formParts: readonly MultipartPart[] | undefined;
  if (rawData?.kind === "name") {
    const bound = bindings.get(rawData.value);
    if (bound?.kind === "call" && /(?:^|\.)FormData$/u.test(bound.callee)) {
      formParts = formDataParts(rawData.value, calls, bindings, call.start);
      if (formParts === undefined) {
        issues.push(
          issueFor(
            "body",
            "Dynamic multipart body cannot be resolved statically.",
            {
              kind: "unresolved",
              source: rawData.value,
            },
          ),
        );
      }
    }
  }

  const {
    body,
    header: bodyHeader,
    dropContentType,
  } = formParts === undefined
    ? bodyFrom(call.args, bindings, issues, contentTypeOf(headers))
    : { body: { kind: "multipart", parts: formParts } as RequestBody };
  if (bodyHeader !== undefined && contentTypeOf(headers) === undefined) {
    headers.push(bodyHeader);
  }
  const effectiveHeaders =
    dropContentType === true
      ? headers.filter((header) => header.name.toLowerCase() !== "content-type")
      : headers;

  // The three clients disagree on both the option name and its default. HTTPX
  // renamed the argument and defaults to not following; requests and aiohttp
  // share `allow_redirects` and follow by default.
  const redirectKey =
    client === "httpx" ? "follow_redirects" : "allow_redirects";
  const redirectNode = call.args.keyword.get(redirectKey);
  let followRedirects = client !== "httpx";
  if (redirectNode !== undefined) {
    const resolvedRedirect = resolve(redirectNode, bindings);
    if (resolvedRedirect.kind !== "boolean") {
      issues.push(
        issueFor(
          "config",
          "Dynamic redirect option cannot be resolved statically.",
          resolvedRedirect,
        ),
      );
    } else {
      followRedirects = resolvedRedirect.value;
    }
  }

  const normalized = normalizeHeaders(effectiveHeaders);
  const details: StaticRequestDetails = {
    client,
    ...(method === undefined ? {} : { method }),
    ...(url === undefined ? {} : { url }),
    headers: normalized.headers,
    cookies: normalized.cookies,
    ...(normalized.auth === undefined ? {} : { auth: normalized.auth }),
    ...(body === undefined ? {} : { body }),
    followRedirects,
  };

  if (issues.length > 0) throw new DynamicExpressionError(issues, details);

  return {
    client,
    request: createHttpRequest(appendQuery(url ?? "", query), {
      method: method ?? "GET",
      headers: normalized.headers,
      cookies: normalized.cookies,
      ...(normalized.auth === undefined ? {} : { auth: normalized.auth }),
      ...(body === undefined ? {} : { body }),
      followRedirects,
    }),
  };
}
