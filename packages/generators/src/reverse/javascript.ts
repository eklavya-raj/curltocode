import { parse } from "@babel/parser";
import * as t from "@babel/types";
import { createHttpRequest } from "@curltocode/core";
import type {
  Header,
  JsonValue,
  RequestAuth,
  RequestBody,
} from "@curltocode/core";

import {
  collectStaticBindings,
  containsNode,
  expressionArgument,
  isLexicalScope,
  issue,
  memberRootName,
  walk,
  walkWithAncestors,
} from "./ast-analysis.js";
import {
  evaluateStatic,
  objectProperties,
  resolveExpression,
  staticString,
  unwrapExpression,
} from "./static.js";
import type { StaticBindings } from "./static.js";
import { normalizeHeaders } from "./normalize.js";
import { CodeParseError, DynamicExpressionError } from "./types.js";
import type { DynamicIssue, ReverseParseResult } from "./types.js";

function headerEntries(
  expression: t.Expression | undefined,
  bindings: StaticBindings,
): readonly Header[] | undefined {
  if (expression === undefined) return [];
  const node = resolveExpression(expression, bindings);
  if (node === undefined) return undefined;
  let value: JsonValue | undefined;
  if (t.isObjectExpression(node)) {
    const result = evaluateStatic(node, bindings);
    if (result.ok) value = result.value;
  } else if (
    t.isNewExpression(node) &&
    t.isIdentifier(node.callee, { name: "Headers" }) &&
    node.arguments.length === 1
  ) {
    const argument = node.arguments[0];
    if (argument !== undefined && t.isExpression(argument)) {
      const result = evaluateStatic(argument, bindings);
      if (result.ok) value = result.value;
    }
  }
  if (Array.isArray(value)) {
    const headers: Header[] = [];
    for (const entry of value) {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== "string" ||
        typeof entry[1] !== "string"
      ) {
        return undefined;
      }
      headers.push({ name: entry[0], value: entry[1] });
    }
    return headers;
  }
  if (value !== null && typeof value === "object") {
    const headers: Header[] = [];
    for (const [name, entry] of Object.entries(value)) {
      if (typeof entry !== "string") return undefined;
      headers.push({ name, value: entry });
    }
    return headers;
  }
  return undefined;
}

function bodyFromExpression(
  expression: t.Expression | undefined,
  bindings: StaticBindings,
): RequestBody | undefined | "dynamic" {
  if (expression === undefined) return undefined;
  const node = resolveExpression(expression, bindings);
  if (node === undefined) return "dynamic";
  if (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.property, { name: "encode" }) &&
    t.isNewExpression(node.callee.object) &&
    t.isIdentifier(node.callee.object.callee, { name: "TextEncoder" }) &&
    node.callee.object.arguments.length === 0
  ) {
    const value = staticString(expressionArgument(node.arguments[0]), bindings);
    return value === undefined
      ? "dynamic"
      : { kind: "binary", source: { kind: "inline", value } };
  }
  if (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.object, { name: "JSON" }) &&
    t.isIdentifier(node.callee.property, { name: "stringify" })
  ) {
    const valueExpression = expressionArgument(node.arguments[0]);
    if (valueExpression === undefined) return "dynamic";
    const value = evaluateStatic(valueExpression, bindings);
    if (!value.ok) return "dynamic";
    const replacer = node.arguments[1];
    if (
      replacer !== undefined &&
      !t.isNullLiteral(replacer) &&
      !t.isIdentifier(replacer, { name: "undefined" })
    ) {
      return "dynamic";
    }
    const spaceExpression = expressionArgument(node.arguments[2]);
    const space =
      spaceExpression === undefined
        ? undefined
        : evaluateStatic(spaceExpression, bindings);
    if (
      space !== undefined &&
      (!space.ok ||
        (typeof space.value !== "string" && typeof space.value !== "number"))
    ) {
      return "dynamic";
    }
    const indentation: string | number | undefined =
      space?.ok === true &&
      (typeof space.value === "string" || typeof space.value === "number")
        ? space.value
        : undefined;
    return {
      kind: "json",
      value: value.value,
      raw: JSON.stringify(value.value, undefined, indentation),
    };
  }
  if (
    t.isNewExpression(node) &&
    t.isIdentifier(node.callee, { name: "URLSearchParams" }) &&
    node.arguments.length === 1
  ) {
    const argument = node.arguments[0];
    if (argument === undefined || !t.isExpression(argument)) return "dynamic";
    const value = evaluateStatic(argument, bindings);
    if (!value.ok) return "dynamic";
    if (Array.isArray(value.value)) {
      const fields = value.value.map((entry) =>
        Array.isArray(entry) &&
        entry.length === 2 &&
        typeof entry[0] === "string" &&
        typeof entry[1] === "string"
          ? { name: entry[0], value: entry[1] }
          : undefined,
      );
      return fields.every((field) => field !== undefined)
        ? {
            kind: "form-urlencoded",
            fields,
            raw: fields
              .map(
                ({ name, value }) =>
                  `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
              )
              .join("&"),
          }
        : "dynamic";
    }
    if (value.value !== null && typeof value.value === "object") {
      return {
        kind: "form-urlencoded",
        fields: Object.entries(value.value).map(([name, entry]) => ({
          name,
          value: String(entry),
        })),
        raw: Object.entries(value.value)
          .map(
            ([name, entry]) =>
              `${encodeURIComponent(name)}=${encodeURIComponent(String(entry))}`,
          )
          .join("&"),
      };
    }
    return "dynamic";
  }
  const value = evaluateStatic(node, bindings);
  if (!value.ok) return "dynamic";
  if (typeof value.value === "string")
    return { kind: "text", value: value.value };
  if (value.value !== null && typeof value.value === "object") {
    return {
      kind: "json",
      value: value.value,
      raw: JSON.stringify(value.value),
    };
  }
  return { kind: "text", value: String(value.value) };
}

function staticFormDataBody(
  program: t.Program,
  requestCall: t.CallExpression,
  expression: t.Expression | undefined,
  bindings: StaticBindings,
): RequestBody | undefined {
  if (expression === undefined) return undefined;
  const reference = unwrapExpression(expression);
  if (!t.isIdentifier(reference)) return undefined;
  const callStart = requestCall.start ?? Number.POSITIVE_INFINITY;
  let declaration: t.VariableDeclarator | undefined;
  walkWithAncestors(program, [], (node, ancestors) => {
    if (
      declaration !== undefined ||
      !t.isVariableDeclarator(node) ||
      !t.isIdentifier(node.id, { name: reference.name }) ||
      !t.isNewExpression(node.init) ||
      !t.isIdentifier(node.init.callee, { name: "FormData" }) ||
      node.init.arguments.length !== 0 ||
      (node.end ?? Number.POSITIVE_INFINITY) >= callStart
    ) {
      return;
    }
    const variableDeclaration = ancestors.at(-1);
    const scope = [...ancestors].reverse().find(isLexicalScope) ?? program;
    if (
      t.isVariableDeclaration(variableDeclaration, { kind: "const" }) &&
      containsNode(scope, requestCall)
    ) {
      declaration = node;
    }
  });
  if (declaration === undefined) return undefined;

  const declaredAt = declaration.end ?? 0;
  const parts: Array<{
    readonly kind: "field";
    readonly name: string;
    readonly value: string;
  }> = [];
  let unsafeUse = false;
  walk(program, (node) => {
    if (
      unsafeUse ||
      node.start === null ||
      node.start === undefined ||
      node.start <= declaredAt ||
      node.start >= callStart
    ) {
      return;
    }
    if (
      t.isAssignmentExpression(node) &&
      memberRootName(node.left) === reference.name
    ) {
      unsafeUse = true;
      return;
    }
    if (
      t.isCallExpression(node) &&
      node.arguments.some(
        (argument) =>
          t.isExpression(argument) &&
          t.isIdentifier(unwrapExpression(argument), { name: reference.name }),
      )
    ) {
      unsafeUse = true;
      return;
    }
    if (
      !t.isCallExpression(node) ||
      !t.isMemberExpression(node.callee) ||
      !t.isIdentifier(node.callee.object, { name: reference.name })
    ) {
      return;
    }
    if (!t.isIdentifier(node.callee.property, { name: "append" })) {
      unsafeUse = true;
      return;
    }
    const name = staticString(expressionArgument(node.arguments[0]), bindings);
    const value = staticString(expressionArgument(node.arguments[1]), bindings);
    if (
      name === undefined ||
      value === undefined ||
      node.arguments.length !== 2
    ) {
      unsafeUse = true;
      return;
    }
    parts.push({ kind: "field", name, value });
  });
  return unsafeUse ? undefined : { kind: "multipart", parts };
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return typeof value === "object" && Object.values(value).every(isJsonValue);
}

function contentType(headers: readonly Header[]): string | undefined {
  return headers
    .find((header) => header.name.toLowerCase() === "content-type")
    ?.value.toLowerCase();
}

function formBody(raw: string): RequestBody {
  return {
    kind: "form-urlencoded",
    raw,
    fields: Array.from(new URLSearchParams(raw), ([name, value]) => ({
      name,
      value,
    })),
  };
}

function refineBodyForHeaders(
  body: RequestBody | undefined | "dynamic",
  headers: readonly Header[],
): RequestBody | undefined | "dynamic" {
  if (body === undefined || body === "dynamic") return body;
  const type = contentType(headers);
  if (body.kind === "binary" && type !== undefined) {
    return { ...body, contentType: type };
  }
  if (body.kind === "json" && type?.includes("json") !== true) {
    if (type?.includes("application/x-www-form-urlencoded") === true) {
      return formBody(body.raw);
    }
    return { kind: "text", value: body.raw };
  }
  if (body.kind !== "text") return body;
  if (type?.includes("application/x-www-form-urlencoded") === true) {
    return formBody(body.value);
  }
  if (type?.includes("json") === true) {
    try {
      const value: unknown = JSON.parse(body.value);
      if (isJsonValue(value)) {
        return { kind: "json", value, raw: body.value };
      }
    } catch {
      return body;
    }
  }
  return body;
}

function addStaticParams(
  url: string,
  expression: t.Expression | undefined,
  bindings: StaticBindings,
): string | undefined {
  if (expression === undefined) return url;
  const value = evaluateStatic(expression, bindings);
  if (
    !value.ok ||
    value.value === null ||
    typeof value.value !== "object" ||
    Array.isArray(value.value)
  )
    return undefined;
  const parsed = new URL(url);
  for (const [name, entry] of Object.entries(value.value)) {
    if (
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean"
    ) {
      parsed.searchParams.append(name, String(entry));
    } else return undefined;
  }
  return parsed.toString();
}

function axiosAuth(
  expression: t.Expression | undefined,
  bindings: StaticBindings,
): RequestAuth | undefined | "dynamic" {
  if (expression === undefined) return undefined;
  const node = resolveExpression(expression, bindings);
  if (node === undefined) return "dynamic";
  if (!t.isObjectExpression(node)) return "dynamic";
  const properties = objectProperties(node);
  if (properties === undefined) return "dynamic";
  const username = staticString(properties.get("username"), bindings);
  const password = staticString(properties.get("password"), bindings);
  if (username === undefined || password === undefined) return "dynamic";
  return { kind: "basic", username, password };
}

function fetchRequest(
  source: string,
  program: t.Program,
  call: t.CallExpression,
  bindings: StaticBindings,
): ReverseParseResult {
  const issues: DynamicIssue[] = [];
  const urlExpression = expressionArgument(call.arguments[0]);
  const url = staticString(urlExpression, bindings);
  if (url === undefined)
    issues.push(
      issue(
        "url",
        "Dynamic URL cannot be resolved statically.",
        source,
        urlExpression,
      ),
    );
  const initExpression = expressionArgument(call.arguments[1]);
  let properties: ReadonlyMap<string, t.Expression> = new Map();
  if (initExpression !== undefined) {
    const unwrapped = resolveExpression(initExpression, bindings);
    if (unwrapped === undefined || !t.isObjectExpression(unwrapped)) {
      issues.push(
        issue(
          "config",
          "Dynamic fetch options cannot be resolved statically.",
          source,
          initExpression,
        ),
      );
    } else {
      properties = objectProperties(unwrapped) ?? new Map();
      if (objectProperties(unwrapped) === undefined) {
        issues.push(
          issue(
            "config",
            "Computed or spread fetch options cannot be resolved statically.",
            source,
            initExpression,
          ),
        );
      }
    }
  }
  for (const [name, expression] of properties) {
    if (!["method", "headers", "body", "redirect"].includes(name)) {
      issues.push(
        issue(
          "config",
          `Unsupported fetch option cannot be represented safely: ${name}.`,
          source,
          expression,
        ),
      );
    }
  }
  const methodExpression = properties.get("method");
  const method =
    methodExpression === undefined
      ? "GET"
      : staticString(methodExpression, bindings);
  if (method === undefined)
    issues.push(
      issue(
        "method",
        "Dynamic method cannot be resolved statically.",
        source,
        methodExpression,
      ),
    );
  const headersExpression = properties.get("headers");
  const headers = headerEntries(headersExpression, bindings);
  if (headers === undefined)
    issues.push(
      issue(
        "headers",
        "Dynamic headers cannot be resolved statically.",
        source,
        headersExpression,
      ),
    );
  const bodyExpression = properties.get("body");
  const bodyCandidate = bodyFromExpression(bodyExpression, bindings);
  const parsedBody =
    bodyCandidate === "dynamic"
      ? (staticFormDataBody(program, call, bodyExpression, bindings) ??
        "dynamic")
      : bodyCandidate;
  const body = refineBodyForHeaders(parsedBody, headers ?? []);
  if (body === "dynamic")
    issues.push(
      issue(
        "body",
        "Dynamic body cannot be resolved statically.",
        source,
        bodyExpression,
      ),
    );
  const redirectExpression = properties.get("redirect");
  const redirect = staticString(redirectExpression, bindings);
  if (
    redirectExpression !== undefined &&
    redirect !== "manual" &&
    redirect !== "follow"
  ) {
    issues.push(
      issue(
        "config",
        "Fetch redirect must be the static value 'follow' or 'manual'.",
        source,
        redirectExpression,
      ),
    );
  }
  if (issues.length > 0) {
    const partialHeaders =
      headers === undefined ? undefined : normalizeHeaders(headers);
    throw new DynamicExpressionError(issues, {
      client: "fetch",
      ...(method === undefined ? {} : { method }),
      ...(url === undefined ? {} : { url }),
      ...(partialHeaders === undefined
        ? {}
        : {
            headers: partialHeaders.headers,
            cookies: partialHeaders.cookies,
            ...(partialHeaders.auth === undefined
              ? {}
              : { auth: partialHeaders.auth }),
          }),
      ...(body === undefined || body === "dynamic" ? {} : { body }),
      ...(redirect === undefined
        ? {}
        : { followRedirects: redirect !== "manual" }),
    });
  }
  const effectiveHeaders = [...(headers ?? [])];
  if (
    body !== undefined &&
    body !== "dynamic" &&
    body.kind === "text" &&
    contentType(effectiveHeaders) === undefined
  ) {
    effectiveHeaders.push({
      name: "Content-Type",
      value: "text/plain;charset=UTF-8",
    });
  }
  const normalized = normalizeHeaders(effectiveHeaders);
  return {
    client: "fetch",
    request: createHttpRequest(url ?? "", {
      method: method ?? "GET",
      headers: normalized.headers,
      cookies: normalized.cookies,
      ...(normalized.auth === undefined ? {} : { auth: normalized.auth }),
      ...(body === undefined || body === "dynamic" ? {} : { body }),
      followRedirects: redirect !== "manual",
    }),
  };
}

function isFetchCallee(callee: t.Node): boolean {
  if (t.isIdentifier(callee, { name: "fetch" })) return true;
  return (
    t.isMemberExpression(callee) &&
    !callee.computed &&
    t.isIdentifier(callee.object) &&
    ["window", "globalThis"].includes(callee.object.name) &&
    t.isIdentifier(callee.property, { name: "fetch" })
  );
}

function axiosBindingNames(program: t.Program): ReadonlySet<string> {
  const names = new Set(["axios"]);
  for (const statement of program.body) {
    if (
      !t.isImportDeclaration(statement) ||
      statement.source.value !== "axios"
    ) {
      continue;
    }
    for (const specifier of statement.specifiers) {
      if (
        t.isImportDefaultSpecifier(specifier) ||
        t.isImportNamespaceSpecifier(specifier)
      ) {
        names.add(specifier.local.name);
      }
    }
  }
  return names;
}

function axiosCallKind(
  call: t.CallExpression,
  axiosNames: ReadonlySet<string>,
): "request" | "get" | "post" | "put" | "patch" | "delete" | undefined {
  if (t.isIdentifier(call.callee) && axiosNames.has(call.callee.name))
    return "request";
  if (
    t.isMemberExpression(call.callee) &&
    t.isIdentifier(call.callee.object) &&
    axiosNames.has(call.callee.object.name) &&
    t.isIdentifier(call.callee.property) &&
    ["request", "get", "post", "put", "patch", "delete"].includes(
      call.callee.property.name,
    )
  ) {
    return call.callee.property.name as ReturnType<typeof axiosCallKind>;
  }
  return undefined;
}

function axiosRequest(
  source: string,
  program: t.Program,
  call: t.CallExpression,
  kind: NonNullable<ReturnType<typeof axiosCallKind>>,
  bindings: StaticBindings,
): ReverseParseResult {
  const issues: DynamicIssue[] = [];
  let urlExpression: t.Expression | undefined;
  let dataExpression: t.Expression | undefined;
  let configExpression: t.Expression | undefined;
  if (kind === "request")
    configExpression = expressionArgument(call.arguments[0]);
  else {
    urlExpression = expressionArgument(call.arguments[0]);
    if (["post", "put", "patch"].includes(kind)) {
      dataExpression = expressionArgument(call.arguments[1]);
      configExpression = expressionArgument(call.arguments[2]);
    } else configExpression = expressionArgument(call.arguments[1]);
  }
  let properties: ReadonlyMap<string, t.Expression> = new Map();
  if (configExpression !== undefined) {
    const unwrapped = resolveExpression(configExpression, bindings);
    if (unwrapped !== undefined && t.isObjectExpression(unwrapped))
      properties = objectProperties(unwrapped) ?? new Map();
    if (
      unwrapped === undefined ||
      !t.isObjectExpression(unwrapped) ||
      objectProperties(unwrapped) === undefined
    ) {
      issues.push(
        issue(
          "config",
          "Dynamic Axios configuration cannot be resolved statically.",
          source,
          configExpression,
        ),
      );
    }
  } else if (kind === "request") {
    issues.push(
      issue(
        "config",
        "Axios requires a static configuration object.",
        source,
        call,
      ),
    );
  }
  for (const [name, expression] of properties) {
    if (
      ![
        "url",
        "method",
        "headers",
        "data",
        "params",
        "maxRedirects",
        "auth",
      ].includes(name)
    ) {
      issues.push(
        issue(
          "config",
          `Unsupported Axios option cannot be represented safely: ${name}.`,
          source,
          expression,
        ),
      );
    }
  }
  urlExpression ??= properties.get("url");
  dataExpression ??= properties.get("data");
  const rawUrl = staticString(urlExpression, bindings);
  const url =
    rawUrl === undefined
      ? undefined
      : addStaticParams(rawUrl, properties.get("params"), bindings);
  if (url === undefined)
    issues.push(
      issue(
        "url",
        "Dynamic URL or query parameters cannot be resolved statically.",
        source,
        urlExpression,
      ),
    );
  const methodExpression = properties.get("method");
  const method =
    kind === "request"
      ? methodExpression === undefined
        ? "GET"
        : staticString(methodExpression, bindings)
      : kind.toUpperCase();
  if (method === undefined)
    issues.push(
      issue(
        "method",
        "Dynamic method cannot be resolved statically.",
        source,
        methodExpression,
      ),
    );
  const headersExpression = properties.get("headers");
  const headers = headerEntries(headersExpression, bindings);
  if (headers === undefined)
    issues.push(
      issue(
        "headers",
        "Dynamic headers cannot be resolved statically.",
        source,
        headersExpression,
      ),
    );
  const bodyCandidate = bodyFromExpression(dataExpression, bindings);
  const parsedBody =
    bodyCandidate === "dynamic"
      ? (staticFormDataBody(program, call, dataExpression, bindings) ??
        "dynamic")
      : bodyCandidate;
  const declaredContentType = contentType(headers ?? []);
  if (
    parsedBody !== "dynamic" &&
    parsedBody?.kind === "json" &&
    declaredContentType !== undefined &&
    !declaredContentType.includes("json")
  ) {
    issues.push(
      issue(
        "body",
        "Axios automatic object serialization for this non-JSON content type cannot be represented safely.",
        source,
        dataExpression,
      ),
    );
  }
  const body =
    parsedBody !== "dynamic" &&
    parsedBody?.kind === "text" &&
    declaredContentType === undefined &&
    method !== undefined &&
    ["POST", "PUT", "PATCH"].includes(method)
      ? formBody(parsedBody.value)
      : refineBodyForHeaders(parsedBody, headers ?? []);
  if (body === "dynamic")
    issues.push(
      issue(
        "body",
        "Dynamic request data cannot be resolved statically.",
        source,
        dataExpression,
      ),
    );
  const configuredAuth = axiosAuth(properties.get("auth"), bindings);
  if (configuredAuth === "dynamic") {
    issues.push(
      issue(
        "config",
        "Dynamic Axios authentication cannot be resolved statically.",
        source,
        properties.get("auth"),
      ),
    );
  }
  const maxRedirects = properties.get("maxRedirects");
  const redirectValue =
    maxRedirects === undefined
      ? undefined
      : evaluateStatic(maxRedirects, bindings);
  if (
    maxRedirects !== undefined &&
    (!redirectValue?.ok || typeof redirectValue.value !== "number")
  ) {
    issues.push(
      issue(
        "config",
        "Dynamic Axios redirect behavior cannot be resolved statically.",
        source,
        maxRedirects,
      ),
    );
  }
  if (issues.length > 0) {
    const partialHeaders =
      headers === undefined ? undefined : normalizeHeaders(headers);
    const partialAuth =
      configuredAuth === undefined
        ? partialHeaders?.auth
        : configuredAuth === "dynamic"
          ? undefined
          : configuredAuth;
    throw new DynamicExpressionError(issues, {
      client: "axios",
      ...(method === undefined ? {} : { method }),
      ...(url === undefined ? {} : { url }),
      ...(partialHeaders === undefined
        ? {}
        : {
            headers: partialHeaders.headers,
            cookies: partialHeaders.cookies,
          }),
      ...(partialAuth === undefined ? {} : { auth: partialAuth }),
      ...(body === undefined ||
      body === "dynamic" ||
      issues.some((entry) => entry.kind === "body")
        ? {}
        : { body }),
      ...(redirectValue?.ok === true
        ? { followRedirects: redirectValue.value !== 0 }
        : {}),
    });
  }
  const normalized = normalizeHeaders(headers ?? []);
  const normalizedHeaders = [...normalized.headers];
  const normalizedBody =
    parsedBody !== "dynamic" &&
    parsedBody?.kind === "json" &&
    contentType(normalizedHeaders) === undefined
      ? parsedBody
      : body;
  if (
    normalizedBody !== undefined &&
    normalizedBody !== "dynamic" &&
    normalizedBody.kind === "json" &&
    contentType(normalizedHeaders) === undefined
  ) {
    normalizedHeaders.push({
      name: "Content-Type",
      value: "application/json",
    });
  }
  const auth = configuredAuth === undefined ? normalized.auth : configuredAuth;
  return {
    client: "axios",
    request: createHttpRequest(url ?? "", {
      method: method ?? "GET",
      headers: normalizedHeaders,
      cookies: normalized.cookies,
      ...(auth === undefined || auth === "dynamic" ? {} : { auth }),
      ...(normalizedBody === undefined || normalizedBody === "dynamic"
        ? {}
        : { body: normalizedBody }),
      followRedirects: !(
        redirectValue?.ok === true && redirectValue.value === 0
      ),
    }),
  };
}

export function parseJavaScriptRequest(source: string): ReverseParseResult {
  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(source, {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx"],
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown JavaScript syntax error.";
    throw new CodeParseError(
      `Unable to parse JavaScript/TypeScript: ${message}`,
    );
  }
  let match:
    | {
        readonly call: t.CallExpression;
        readonly client: "fetch" | "axios";
        readonly kind?: NonNullable<ReturnType<typeof axiosCallKind>>;
      }
    | undefined;
  const axiosNames = axiosBindingNames(ast.program);
  walk(ast.program, (node) => {
    if (match !== undefined || !t.isCallExpression(node)) return;
    if (isFetchCallee(node.callee)) match = { call: node, client: "fetch" };
    else {
      const kind = axiosCallKind(node, axiosNames);
      if (kind !== undefined) match = { call: node, client: "axios", kind };
    }
  });
  if (match === undefined)
    throw new CodeParseError(
      "No supported fetch() or Axios request was found.",
    );
  const bindings = collectStaticBindings(ast.program, match.call);
  return match.client === "fetch"
    ? fetchRequest(source, ast.program, match.call, bindings)
    : axiosRequest(
        source,
        ast.program,
        match.call,
        match.kind ?? "request",
        bindings,
      );
}
