import { createHttpRequest } from "@curltocode/core";
import type { Header, MultipartPart, RequestBody } from "@curltocode/core";

import { parseMultipartBody } from "../http/index.js";
import { normalizeHeaders } from "../normalize.js";
import { classifyStringBody } from "../shared/body.js";
import { DynamicExpressionError } from "../types.js";
import type {
  DynamicIssue,
  ReverseClient,
  ReverseParseResult,
  StaticRequestDetails,
} from "../types.js";
import { collectBindings, deepResolve, resolve } from "./syntax.js";
import type { PythonCall, PythonNode } from "./syntax.js";
import { asString, contentTypeOf, filePathFrom, pairs } from "./values.js";

/**
 * Readers for the two Python clients that are not third-party request wrappers.
 *
 * `http.client` is the standard library's own connection object, so the URL is
 * split across the constructor and the request call and has to be reassembled.
 * urllib3 is the transport underneath Requests, and its `request` takes the
 * whole URL but names its options differently.
 */

interface StdlibDetection {
  readonly client: Extract<ReverseClient, "httpclient" | "urllib3">;
  readonly call: PythonCall;
  /** The connection variable, for `http.client` only. */
  readonly connection?: PythonCall;
}

const CONNECTION_CLASSES = /(?:^|\.)(HTTPSConnection|HTTPConnection)$/u;

/**
 * Find a stdlib or urllib3 request call.
 *
 * Detection is by call shape rather than by the import line, because both
 * modules are commonly aliased and `http.client` is often imported as
 * `from http.client import HTTPSConnection`.
 */
export function detectPythonStdlib(
  source: string,
  calls: readonly PythonCall[],
): StdlibDetection | undefined {
  const poolNames = new Set<string>();
  for (const match of source.matchAll(
    /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*urllib3\.(?:PoolManager|ProxyManager|HTTPConnectionPool|HTTPSConnectionPool)\(/gu,
  )) {
    const name = match[1];
    if (name !== undefined) poolNames.add(name);
  }

  const connections = new Map<string, PythonCall>();
  for (const call of calls) {
    if (CONNECTION_CLASSES.test(call.callee)) {
      // The constructor is not itself assigned in the call list, so the
      // variable name is read from the statement it appears in.
      const assignment = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*$/u.exec(
        source.slice(0, call.start),
      );
      const name = assignment?.[1];
      if (name !== undefined) connections.set(name, call);
    }
  }

  for (const call of calls) {
    const segments = call.callee.split(".");
    const name = segments[segments.length - 1] ?? "";
    const receiver = segments.slice(0, -1).join(".");
    if (name !== "request") continue;
    if (receiver === "urllib3" || poolNames.has(receiver)) {
      return { client: "urllib3", call };
    }
    const connection = connections.get(receiver);
    if (connection !== undefined) {
      return { client: "httpclient", call, connection };
    }
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
    expression: node.kind === "unresolved" ? node.source : "dynamic value",
  };
}

/** Read a headers argument, including urllib3's duplicate-preserving dict. */
function stdlibHeaders(
  node: PythonNode | undefined,
  bindings: ReadonlyMap<string, PythonNode>,
  variableName: string | undefined,
  calls: readonly PythonCall[],
  before: number,
): readonly Header[] | undefined {
  if (node === undefined) return [];
  const resolved = deepResolve(node, bindings);
  // `urllib3.HTTPHeaderDict()` is populated by `add` calls, which is how the
  // same field name is sent twice; a dict literal cannot express that.
  if (
    resolved.kind === "call" &&
    /(?:^|\.)HTTPHeaderDict$/u.test(resolved.callee)
  ) {
    if (variableName === undefined) return undefined;
    const headers: Header[] = [];
    for (const candidate of calls) {
      if (candidate.start >= before) continue;
      if (candidate.callee !== `${variableName}.add`) continue;
      const nameNode = candidate.args.positional[0];
      const valueNode = candidate.args.positional[1];
      if (nameNode === undefined || valueNode === undefined) return undefined;
      const name = asString(deepResolve(nameNode, bindings));
      const value = asString(deepResolve(valueNode, bindings));
      if (name === undefined || value === undefined) return undefined;
      headers.push({ name, value });
    }
    return headers;
  }
  const entries = pairs(resolved);
  return entries?.map((entry) => ({ name: entry.name, value: entry.value }));
}

/**
 * Read urllib3's `fields`, which is a list of `(name, value)` pairs where the
 * value may itself be a `(filename, data, content_type)` tuple.
 */
function urllib3Fields(
  node: PythonNode,
  bindings: ReadonlyMap<string, PythonNode>,
): readonly MultipartPart[] | "file-bytes" | undefined {
  if (node.kind !== "list" && node.kind !== "tuple" && node.kind !== "dict") {
    return undefined;
  }
  const entries =
    node.kind === "dict"
      ? node.entries.map((entry) => [entry.key, entry.value] as const)
      : node.items.map((item) =>
          item.kind === "tuple" || item.kind === "list"
            ? ([item.items[0], item.items[1]] as const)
            : ([undefined, undefined] as const),
        );
  const parts: MultipartPart[] = [];
  for (const [nameNode, valueNode] of entries) {
    if (nameNode === undefined || valueNode === undefined) return undefined;
    const name = asString(deepResolve(nameNode, bindings));
    if (name === undefined) return undefined;
    const value = deepResolve(valueNode, bindings);
    if (value.kind !== "tuple" && value.kind !== "list") {
      const text = asString(value);
      if (text === undefined) return undefined;
      parts.push({ kind: "field", name, value: text });
      continue;
    }
    const [filenameNode, dataNode, typeNode] = value.items;
    if (dataNode === undefined) return undefined;
    const filename =
      filenameNode === undefined || filenameNode.kind === "none"
        ? undefined
        : asString(deepResolve(filenameNode, bindings));
    if (filename === undefined) {
      const text = asString(deepResolve(dataNode, bindings));
      if (text === undefined) return undefined;
      parts.push({ kind: "field", name, value: text });
      continue;
    }
    const path = filePathFrom(dataNode, bindings);
    if (path === undefined) {
      // The tuple names a file but carries its bytes, which is what
      // `open(path, "rb").read()` produces. There is no path left to hand a
      // cURL command, so this is reported rather than approximated.
      return "file-bytes";
    }
    const contentType =
      typeNode === undefined
        ? undefined
        : asString(deepResolve(typeNode, bindings));
    parts.push({
      kind: "file",
      name,
      path,
      ...(filename === path ? {} : { filename }),
      ...(contentType === undefined ? {} : { contentType }),
    });
  }
  return parts;
}

/** Split a declared multipart Content-Type back into its parts. */
function multipartFromPayload(
  payload: string,
  declaredType: string,
): readonly MultipartPart[] | undefined {
  const boundary = /boundary=("?)([^";]+)\1/u.exec(declaredType)?.[2];
  if (boundary === undefined) return undefined;
  const parts = parseMultipartBody(payload.replaceAll("\r\n", "\n"), boundary);
  return parts?.map(({ name, value }) => ({
    kind: "field" as const,
    name,
    value,
  }));
}

export function parsePythonStdlibRequest(
  source: string,
  calls: readonly PythonCall[],
  detected: StdlibDetection,
): ReverseParseResult {
  const { call, client } = detected;
  const bindings = collectBindings(source, call.start);
  const issues: DynamicIssue[] = [];
  const positional = call.args.positional;

  const methodNode = positional[0];
  const method =
    methodNode === undefined
      ? undefined
      : asString(deepResolve(methodNode, bindings))?.toUpperCase();
  if (method === undefined) {
    issues.push(
      issueFor("method", "Dynamic HTTP method cannot be resolved statically.", {
        kind: "unresolved",
        source: "missing method",
      }),
    );
  }

  let url: string | undefined;
  if (client === "urllib3") {
    const urlNode = positional[1] ?? call.args.keyword.get("url");
    url =
      urlNode === undefined
        ? undefined
        : asString(deepResolve(urlNode, bindings));
  } else {
    // `http.client` puts the authority on the connection and the target on the
    // request, so the URL only exists once the two are put back together.
    const hostNode = detected.connection?.args.positional[0];
    const host =
      hostNode === undefined
        ? undefined
        : asString(deepResolve(hostNode, bindings));
    const portNode = detected.connection?.args.positional[1];
    const port =
      portNode === undefined
        ? undefined
        : asString(deepResolve(portNode, bindings));
    const targetNode = positional[1] ?? call.args.keyword.get("url");
    const target =
      targetNode === undefined
        ? undefined
        : asString(deepResolve(targetNode, bindings));
    const secure = /(?:^|\.)HTTPSConnection$/u.test(
      detected.connection?.callee ?? "",
    );
    if (host !== undefined && target !== undefined) {
      const authority = port === undefined ? host : `${host}:${port}`;
      url = `${secure ? "https" : "http"}://${authority}${
        target.startsWith("/") ? target : `/${target}`
      }`;
    }
  }
  if (url === undefined) {
    issues.push(
      issueFor("url", "Dynamic URL cannot be resolved statically.", {
        kind: "unresolved",
        source: "missing url",
      }),
    );
  }

  const headersNode =
    call.args.keyword.get("headers") ??
    (client === "httpclient" ? positional[3] : undefined);
  const headerVariable =
    headersNode?.kind === "name" ? headersNode.value : undefined;
  const headers =
    stdlibHeaders(headersNode, bindings, headerVariable, calls, call.start) ??
    undefined;
  if (headers === undefined) {
    issues.push(
      issueFor("headers", "Dynamic headers cannot be resolved statically.", {
        kind: "unresolved",
        source: "headers",
      }),
    );
  }
  const declaredType = contentTypeOf(headers ?? []);

  let body: RequestBody | undefined;
  let effectiveHeaders = [...(headers ?? [])];
  const fieldsNode = call.args.keyword.get("fields");
  const bodyNode =
    call.args.keyword.get("body") ??
    (client === "httpclient" ? positional[2] : undefined);
  if (fieldsNode !== undefined) {
    const parts = urllib3Fields(deepResolve(fieldsNode, bindings), bindings);
    if (parts === "file-bytes") {
      issues.push(
        issueFor(
          "body",
          "This multipart field carries a file's contents rather than its path, so the upload cannot be described as a cURL command.",
          { kind: "unresolved", source: "fields" },
        ),
      );
    } else if (parts === undefined) {
      issues.push(
        issueFor(
          "body",
          "Dynamic multipart fields cannot be resolved statically.",
          { kind: "unresolved", source: "fields" },
        ),
      );
    } else {
      body = { kind: "multipart", parts };
      effectiveHeaders = effectiveHeaders.filter(
        (header) => header.name.toLowerCase() !== "content-type",
      );
    }
  } else if (bodyNode !== undefined) {
    const resolved = deepResolve(bodyNode, bindings);
    if (resolved.kind === "none") {
      body = undefined;
    } else {
      const path = filePathFrom(bodyNode, bindings);
      if (path !== undefined) {
        body = {
          kind: "binary",
          source: { kind: "file", path },
          ...(declaredType === undefined ? {} : { contentType: declaredType }),
        };
      } else {
        const text =
          resolved.kind === "encoded"
            ? asString(resolved.value)
            : asString(resolved);
        if (text === undefined) {
          issues.push(
            issueFor(
              "body",
              "Dynamic request body cannot be resolved statically.",
              resolved,
            ),
          );
        } else {
          const parts =
            declaredType === undefined
              ? undefined
              : multipartFromPayload(text, declaredType);
          if (parts !== undefined) {
            body = { kind: "multipart", parts };
            effectiveHeaders = effectiveHeaders.filter(
              (header) => header.name.toLowerCase() !== "content-type",
            );
          } else {
            body = classifyStringBody(text, declaredType);
          }
        }
      }
    }
  }

  // urllib3 follows redirects unless told not to; `http.client` never follows
  // at all, so its policy is a fact about the module rather than an option.
  let followRedirects = client === "urllib3";
  const redirectNode = call.args.keyword.get("redirect");
  if (client === "urllib3" && redirectNode !== undefined) {
    const resolved = resolve(redirectNode, bindings);
    if (resolved.kind !== "boolean") {
      issues.push(
        issueFor(
          "config",
          "Dynamic redirect option cannot be resolved statically.",
          resolved,
        ),
      );
    } else {
      followRedirects = resolved.value;
    }
  }
  if (client === "httpclient") followRedirects = false;

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
    request: createHttpRequest(url ?? "", {
      method: method ?? "GET",
      headers: normalized.headers,
      cookies: normalized.cookies,
      ...(normalized.auth === undefined ? {} : { auth: normalized.auth }),
      ...(body === undefined ? {} : { body }),
      followRedirects,
    }),
  };
}
