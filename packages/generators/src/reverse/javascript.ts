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
import { classifyStringBody } from "./shared/body.js";
import { parseMultipartBody } from "./http/index.js";
import { CodeParseError, DynamicExpressionError } from "./types.js";
import type {
  DynamicIssue,
  ReverseClient,
  ReverseParseResult,
} from "./types.js";

function headerEntries(
  expression: t.Expression | undefined,
  bindings: StaticBindings,
): readonly Header[] | undefined {
  if (expression === undefined) return [];
  const node = resolveExpression(expression, bindings);
  if (node === undefined) return undefined;
  let value: JsonValue | undefined;
  if (t.isObjectExpression(node) || t.isArrayExpression(node)) {
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
    // Undici accepts a flat `[name, value, name, value]` array, which is how
    // it preserves duplicate header names.
    if (value.every((entry) => typeof entry === "string")) {
      if (value.length % 2 !== 0) return undefined;
      const headers: Header[] = [];
      for (let index = 0; index < value.length; index += 2) {
        const name = value[index];
        const entry = value[index + 1];
        if (typeof name !== "string" || typeof entry !== "string")
          return undefined;
        headers.push({ name, value: entry });
      }
      return headers;
    }
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
  const buffered = bufferFromString(node, bindings);
  if (buffered !== undefined) {
    return { kind: "binary", source: { kind: "inline", value: buffered } };
  }
  // `new Blob([...])` wraps a payload for a browser API; the bytes inside it
  // are the request, so the single-part form is unwrapped.
  if (
    t.isNewExpression(node) &&
    t.isIdentifier(node.callee, { name: "Blob" }) &&
    node.arguments.length >= 1
  ) {
    const argument = expressionArgument(node.arguments[0]);
    const parts =
      argument === undefined
        ? undefined
        : resolveExpression(argument, bindings);
    if (
      parts !== undefined &&
      t.isArrayExpression(parts) &&
      parts.elements.length === 1
    ) {
      const only = parts.elements[0];
      return only !== null && only !== undefined && t.isExpression(only)
        ? bodyFromExpression(only, bindings)
        : "dynamic";
    }
    return "dynamic";
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
  // With a declared type the shared classifier decides, so JavaScript reads an
  // opaque media type as bytes the same way every other reverse parser does.
  return type === undefined ? body : classifyStringBody(body.value, type);
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

/**
 * Resolve a URL argument that may be wrapped in `new URL(...)`.
 *
 * The single-argument form is a plain absolute URL. The two-argument form
 * resolves a relative reference against a base, which is exactly what the
 * WHATWG URL constructor does, so it is reproduced here rather than rejected.
 */
function staticUrlLike(
  expression: t.Expression | undefined,
  bindings: StaticBindings,
): string | undefined {
  const direct = staticString(expression, bindings);
  if (direct !== undefined) return direct;
  if (expression === undefined) return undefined;
  const node = resolveExpression(expression, bindings);
  if (
    node === undefined ||
    !t.isNewExpression(node) ||
    !t.isIdentifier(node.callee, { name: "URL" }) ||
    node.arguments.length === 0 ||
    node.arguments.length > 2
  ) {
    return undefined;
  }
  const target = staticString(expressionArgument(node.arguments[0]), bindings);
  if (target === undefined) return undefined;
  if (node.arguments.length === 1) return target;
  const base = staticString(expressionArgument(node.arguments[1]), bindings);
  if (base === undefined) return undefined;
  try {
    return new URL(target, base).toString();
  } catch {
    return undefined;
  }
}

/**
 * Unwrap `new Request(url, init)`, which carries the same init object shape
 * that `fetch` accepts as its second argument.
 */
function requestConstructorInit(
  expression: t.Expression | undefined,
  bindings: StaticBindings,
):
  | { readonly url: t.Expression; readonly init: t.Expression | undefined }
  | undefined {
  if (expression === undefined) return undefined;
  const node = resolveExpression(expression, bindings);
  if (
    node === undefined ||
    !t.isNewExpression(node) ||
    !t.isIdentifier(node.callee, { name: "Request" }) ||
    node.arguments.length === 0
  ) {
    return undefined;
  }
  const url = expressionArgument(node.arguments[0]);
  if (url === undefined) return undefined;
  return { url, init: expressionArgument(node.arguments[1]) };
}

/**
 * A client whose request is one URL argument plus one options object.
 *
 * `fetch`, Ky, and Got all take that shape, and Ky is fetch underneath, so the
 * three differ only in which option names they read and in how each spells its
 * redirect policy. Those differences are data here rather than three near
 * copies of the same reader.
 */
interface OptionsClientDialect {
  readonly client: ReverseClient;
  /** Used when reporting an option this reader does not understand. */
  readonly label: string;
  /** Options that describe the request itself. */
  readonly options: readonly string[];
  /**
   * Options that change how the client behaves around the exchange without
   * changing the bytes it puts on the wire, so they are accepted and ignored
   * rather than reported as unrepresentable.
   */
  readonly ignored: readonly string[];
  /** Either the Fetch string enum, or a boolean option named here. */
  readonly redirect:
    | { readonly kind: "fetch" }
    | { readonly kind: "boolean"; readonly option: string };
  /** Whether a `new Request(...)` first argument is accepted. */
  readonly requestObject: boolean;
  /**
   * Whether a string body gains `text/plain;charset=UTF-8`. The Fetch standard
   * says it does, and Ky inherits that by calling fetch. Got writes to a Node
   * socket and adds nothing.
   */
  readonly implicitTextContentType: boolean;
}

const FETCH_DIALECT: OptionsClientDialect = {
  client: "fetch",
  label: "fetch",
  options: ["method", "headers", "body"],
  ignored: [],
  redirect: { kind: "fetch" },
  requestObject: true,
  implicitTextContentType: true,
};

const KY_DIALECT: OptionsClientDialect = {
  client: "ky",
  label: "Ky",
  options: ["method", "headers", "body", "json", "searchParams"],
  // `retry` and `throwHttpErrors` decide what happens after a response
  // arrives, not what is sent.
  ignored: ["retry", "throwHttpErrors", "timeout"],
  redirect: { kind: "fetch" },
  requestObject: false,
  implicitTextContentType: true,
};

const GOT_DIALECT: OptionsClientDialect = {
  client: "got",
  label: "Got",
  options: ["method", "headers", "body", "json", "form", "searchParams"],
  ignored: ["retry", "throwHttpErrors", "timeout", "responseType"],
  redirect: { kind: "boolean", option: "followRedirect" },
  requestObject: false,
  implicitTextContentType: false,
};

/** Append a `searchParams` option, which may be a string or a plain object. */
function urlWithSearchParams(
  url: string,
  expression: t.Expression,
  bindings: StaticBindings,
): string | undefined {
  const literal = staticString(expression, bindings);
  if (literal !== undefined) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return undefined;
    }
    for (const [name, value] of new URLSearchParams(literal)) {
      parsed.searchParams.append(name, value);
    }
    return parsed.toString();
  }
  return addStaticParams(url, expression, bindings);
}

/** Serialize name/value pairs the way the existing URLSearchParams reader does. */
function encodeFields(fields: readonly { name: string; value: string }[]) {
  return fields
    .map(
      ({ name, value }) =>
        `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    )
    .join("&");
}

function optionsClientRequest(
  source: string,
  program: t.Program,
  call: t.CallExpression,
  bindings: StaticBindings,
  dialect: OptionsClientDialect,
  /** Method named by a per-verb shortcut such as `got.post(...)`. */
  shortcutMethod: string | undefined,
): ReverseParseResult {
  const issues: DynamicIssue[] = [];
  const firstArgument = expressionArgument(call.arguments[0]);
  // `fetch` accepts a URL, a `new URL(...)`, or a `new Request(...)`, and a
  // Request carries its own init that the second argument then overrides.
  const requestInit = dialect.requestObject
    ? requestConstructorInit(firstArgument, bindings)
    : undefined;
  const urlExpression = requestInit?.url ?? firstArgument;
  let url = staticUrlLike(urlExpression, bindings);
  if (url === undefined)
    issues.push(
      issue(
        "url",
        "Dynamic URL cannot be resolved statically.",
        source,
        urlExpression,
      ),
    );
  const initExpression =
    expressionArgument(call.arguments[1]) ?? requestInit?.init;
  let properties: ReadonlyMap<string, t.Expression> = new Map();
  if (initExpression !== undefined) {
    const unwrapped = resolveExpression(initExpression, bindings);
    if (unwrapped === undefined || !t.isObjectExpression(unwrapped)) {
      issues.push(
        issue(
          "config",
          `Dynamic ${dialect.label} options cannot be resolved statically.`,
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
            `Computed or spread ${dialect.label} options cannot be resolved statically.`,
            source,
            initExpression,
          ),
        );
      }
    }
  }
  const redirectOption =
    dialect.redirect.kind === "fetch" ? "redirect" : dialect.redirect.option;
  const known = [...dialect.options, ...dialect.ignored, redirectOption];
  for (const [name, expression] of properties) {
    if (!known.includes(name)) {
      issues.push(
        issue(
          "config",
          `Unsupported ${dialect.label} option cannot be represented safely: ${name}.`,
          source,
          expression,
        ),
      );
    }
  }
  const methodExpression = properties.get("method");
  const method =
    methodExpression === undefined
      ? (shortcutMethod ?? "GET")
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
  const jsonExpression = properties.get("json");
  const formExpression = properties.get("form");
  const supplied = [bodyExpression, jsonExpression, formExpression].filter(
    (expression) => expression !== undefined,
  );
  // A client that serializes for you still sets the content type for you, so
  // the implied header is recorded alongside the body rather than guessed at
  // afterwards.
  let impliedContentType: string | undefined;
  let parsedBody: RequestBody | undefined | "dynamic";
  if (supplied.length > 1) {
    issues.push(
      issue(
        "body",
        `${dialect.label} was given more than one body option, so which payload is sent is ambiguous.`,
        source,
        supplied[0],
      ),
    );
  } else if (jsonExpression !== undefined) {
    const value = evaluateStatic(jsonExpression, bindings);
    if (!value.ok || !isJsonValue(value.value)) {
      parsedBody = "dynamic";
    } else {
      parsedBody = {
        kind: "json",
        value: value.value,
        raw: JSON.stringify(value.value),
      };
      impliedContentType = "application/json";
    }
  } else if (formExpression !== undefined) {
    const value = evaluateStatic(formExpression, bindings);
    if (
      !value.ok ||
      value.value === null ||
      typeof value.value !== "object" ||
      Array.isArray(value.value)
    ) {
      parsedBody = "dynamic";
    } else {
      const fields = Object.entries(value.value).map(([name, entry]) => ({
        name,
        value: String(entry),
      }));
      parsedBody = {
        kind: "form-urlencoded",
        fields,
        raw: encodeFields(fields),
      };
      impliedContentType = "application/x-www-form-urlencoded";
    }
  } else {
    const candidate = bodyFromExpression(bodyExpression, bindings);
    parsedBody =
      candidate === "dynamic"
        ? (staticFormDataBody(program, call, bodyExpression, bindings) ??
          "dynamic")
        : candidate;
  }
  const declaredHeaders = [...(headers ?? [])];
  if (
    impliedContentType !== undefined &&
    contentType(declaredHeaders) === undefined
  ) {
    declaredHeaders.push({
      name: "Content-Type",
      value: impliedContentType,
    });
  }
  const body = refineBodyForHeaders(parsedBody, declaredHeaders);
  if (body === "dynamic")
    issues.push(
      issue(
        "body",
        "Dynamic body cannot be resolved statically.",
        source,
        bodyExpression ?? jsonExpression ?? formExpression,
      ),
    );

  const searchExpression = properties.get("searchParams");
  if (searchExpression !== undefined && url !== undefined) {
    const expanded = urlWithSearchParams(url, searchExpression, bindings);
    if (expanded === undefined) {
      issues.push(
        issue(
          "url",
          `Dynamic ${dialect.label} searchParams cannot be resolved statically.`,
          source,
          searchExpression,
        ),
      );
    } else {
      url = expanded;
    }
  }

  let followRedirects = true;
  // Whether the source states a policy at all, so a partial result reports
  // only what was actually written rather than the client's default.
  let redirectStated = false;
  if (dialect.redirect.kind === "fetch") {
    const redirectExpression = properties.get("redirect");
    redirectStated = redirectExpression !== undefined;
    const redirect = staticString(redirectExpression, bindings);
    if (
      redirectExpression !== undefined &&
      redirect !== "manual" &&
      redirect !== "follow"
    ) {
      issues.push(
        issue(
          "config",
          `${dialect.label} redirect must be the static value 'follow' or 'manual'.`,
          source,
          redirectExpression,
        ),
      );
    }
    followRedirects = redirect !== "manual";
  } else {
    const option = dialect.redirect.option;
    const redirectExpression = properties.get(option);
    redirectStated = redirectExpression !== undefined;
    if (redirectExpression !== undefined) {
      const value = evaluateStatic(redirectExpression, bindings);
      if (!value.ok || typeof value.value !== "boolean") {
        issues.push(
          issue(
            "config",
            `${dialect.label} ${option} must be a static boolean.`,
            source,
            redirectExpression,
          ),
        );
      } else {
        followRedirects = value.value;
      }
    }
  }

  if (issues.length > 0) {
    const partialHeaders =
      headers === undefined ? undefined : normalizeHeaders(declaredHeaders);
    throw new DynamicExpressionError(issues, {
      client: dialect.client,
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
      ...(redirectStated ? { followRedirects } : {}),
    });
  }
  const effectiveHeaders = [...declaredHeaders];
  if (
    dialect.implicitTextContentType &&
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
    client: dialect.client,
    request: createHttpRequest(url ?? "", {
      method: method ?? "GET",
      headers: normalized.headers,
      cookies: normalized.cookies,
      ...(normalized.auth === undefined ? {} : { auth: normalized.auth }),
      ...(body === undefined || body === "dynamic" ? {} : { body }),
      followRedirects,
    }),
  };
}

/**
 * Names bound to Undici's `request` export, plus the namespace forms.
 *
 * Undici is the client Node's own documentation reaches for when `fetch` is
 * not enough, and it is already a forward target, so its call shape is read
 * back here rather than being reported as unsupported JavaScript.
 */
function undiciRequestNames(program: t.Program): ReadonlySet<string> {
  const names = new Set<string>();
  for (const statement of program.body) {
    if (
      !t.isImportDeclaration(statement) ||
      statement.source.value !== "undici"
    ) {
      continue;
    }
    for (const specifier of statement.specifiers) {
      if (
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported, { name: "request" })
      ) {
        names.add(specifier.local.name);
      }
    }
  }
  return names;
}

function isUndiciCallee(
  callee: t.Node,
  requestNames: ReadonlySet<string>,
): boolean {
  if (t.isIdentifier(callee) && requestNames.has(callee.name)) return true;
  return (
    t.isMemberExpression(callee) &&
    !callee.computed &&
    t.isIdentifier(callee.object, { name: "undici" }) &&
    t.isIdentifier(callee.property, { name: "request" })
  );
}

/**
 * Read `request(url, options)` from Undici.
 *
 * Undici differs from `fetch` in three ways that matter here: headers may be a
 * flat array, the query string can be supplied separately through `query`, and
 * redirects are opt-in through `maxRedirections` rather than on by default.
 */
function undiciRequest(
  source: string,
  program: t.Program,
  call: t.CallExpression,
  bindings: StaticBindings,
): ReverseParseResult {
  const issues: DynamicIssue[] = [];
  const urlExpression = expressionArgument(call.arguments[0]);
  const baseUrl = staticUrlLike(urlExpression, bindings);
  if (baseUrl === undefined)
    issues.push(
      issue(
        "url",
        "Dynamic URL cannot be resolved statically.",
        source,
        urlExpression,
      ),
    );
  const optionsExpression = expressionArgument(call.arguments[1]);
  let properties: ReadonlyMap<string, t.Expression> = new Map();
  if (optionsExpression !== undefined) {
    const unwrapped = resolveExpression(optionsExpression, bindings);
    if (
      unwrapped === undefined ||
      !t.isObjectExpression(unwrapped) ||
      objectProperties(unwrapped) === undefined
    ) {
      issues.push(
        issue(
          "config",
          "Dynamic Undici options cannot be resolved statically.",
          source,
          optionsExpression,
        ),
      );
    } else {
      properties = objectProperties(unwrapped) ?? new Map();
    }
  }
  for (const [name, expression] of properties) {
    if (
      ![
        "method",
        "headers",
        "body",
        "query",
        "maxRedirections",
        // The dispatcher carries connection policy, including the redirect
        // interceptor this project's own generator emits.
        "dispatcher",
      ].includes(name)
    ) {
      issues.push(
        issue(
          "config",
          `Unsupported Undici option cannot be represented safely: ${name}.`,
          source,
          expression,
        ),
      );
    }
  }
  const url =
    baseUrl === undefined
      ? undefined
      : addStaticParams(baseUrl, properties.get("query"), bindings);
  if (url === undefined && baseUrl !== undefined) {
    issues.push(
      issue(
        "url",
        "Dynamic Undici query parameters cannot be resolved statically.",
        source,
        properties.get("query"),
      ),
    );
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
  const body = refineBodyForHeaders(
    bodyCandidate === "dynamic"
      ? (staticFormDataBody(program, call, bodyExpression, bindings) ??
          "dynamic")
      : bodyCandidate,
    headers ?? [],
  );
  if (body === "dynamic")
    issues.push(
      issue(
        "body",
        "Dynamic body cannot be resolved statically.",
        source,
        bodyExpression,
      ),
    );
  // Undici does not follow redirects unless asked, either through
  // `maxRedirections` or through a dispatcher composing the redirect
  // interceptor.
  const redirectionsExpression = properties.get("maxRedirections");
  let followRedirects = false;
  if (redirectionsExpression !== undefined) {
    const value = evaluateStatic(redirectionsExpression, bindings);
    if (!value.ok || typeof value.value !== "number") {
      issues.push(
        issue(
          "config",
          "Undici maxRedirections must be a static number.",
          source,
          redirectionsExpression,
        ),
      );
    } else followRedirects = value.value > 0;
  }
  const dispatcherExpression = properties.get("dispatcher");
  if (dispatcherExpression !== undefined) {
    const resolved = resolveExpression(dispatcherExpression, bindings);
    let composed = false;
    if (resolved !== undefined) {
      walk(resolved, (node) => {
        if (
          t.isMemberExpression(node) &&
          t.isIdentifier(node.object, { name: "interceptors" }) &&
          t.isIdentifier(node.property, { name: "redirect" })
        ) {
          composed = true;
        }
      });
    }
    if (composed) followRedirects = true;
    else if (resolved === undefined) {
      issues.push(
        issue(
          "config",
          "Undici dispatcher cannot be resolved statically.",
          source,
          dispatcherExpression,
        ),
      );
    }
  }
  if (issues.length > 0) {
    const partialHeaders =
      headers === undefined ? undefined : normalizeHeaders(headers);
    throw new DynamicExpressionError(issues, {
      client: "undici",
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
      followRedirects,
    });
  }
  const normalized = normalizeHeaders([...(headers ?? [])]);
  return {
    client: "undici",
    request: createHttpRequest(url ?? "", {
      method: method ?? "GET",
      headers: normalized.headers,
      cookies: normalized.cookies,
      ...(normalized.auth === undefined ? {} : { auth: normalized.auth }),
      ...(body === undefined || body === "dynamic" ? {} : { body }),
      followRedirects,
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

const AXIOS_METHODS: readonly string[] = [
  "request",
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
];

/**
 * Configuration objects passed to `axios.create(...)`, keyed by the variable
 * the instance was assigned to.
 *
 * Instances are how most production code calls Axios, so a parser that only
 * reads bare `axios.get(...)` misses the common shape. Only top-level `const`
 * and `let` declarations are collected, matching the safe-binding rule the
 * rest of this parser follows.
 */
function axiosInstanceConfigs(
  program: t.Program,
  axiosNames: ReadonlySet<string>,
): ReadonlyMap<string, t.ObjectExpression | undefined> {
  const instances = new Map<string, t.ObjectExpression | undefined>();
  walk(program, (node) => {
    if (!t.isVariableDeclarator(node) || !t.isIdentifier(node.id)) return;
    const init = node.init;
    if (
      !t.isCallExpression(init) ||
      !t.isMemberExpression(init.callee) ||
      init.callee.computed ||
      !t.isIdentifier(init.callee.object) ||
      !axiosNames.has(init.callee.object.name) ||
      !t.isIdentifier(init.callee.property, { name: "create" })
    ) {
      return;
    }
    const argument = init.arguments[0];
    instances.set(
      node.id.name,
      argument !== undefined && t.isObjectExpression(argument)
        ? argument
        : undefined,
    );
  });
  return instances;
}

function axiosCallKind(
  call: t.CallExpression,
  axiosNames: ReadonlySet<string>,
):
  | "request"
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "head"
  | "options"
  | undefined {
  if (t.isIdentifier(call.callee) && axiosNames.has(call.callee.name))
    return "request";
  if (
    t.isMemberExpression(call.callee) &&
    t.isIdentifier(call.callee.object) &&
    axiosNames.has(call.callee.object.name) &&
    t.isIdentifier(call.callee.property) &&
    AXIOS_METHODS.includes(call.callee.property.name)
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
  instanceConfig?: t.ObjectExpression | undefined,
): ReverseParseResult {
  const issues: DynamicIssue[] = [];
  // Instance defaults sit underneath the per-call configuration, which is the
  // precedence Axios itself applies when merging the two.
  const defaults =
    instanceConfig === undefined
      ? new Map<string, t.Expression>()
      : (objectProperties(instanceConfig) ?? new Map<string, t.Expression>());
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
        "baseURL",
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
  // `baseURL` may come from either the instance or the call; a call-level URL
  // that is already absolute wins, matching how Axios resolves the pair.
  const baseUrlExpression =
    properties.get("baseURL") ?? defaults.get("baseURL");
  const baseUrl =
    baseUrlExpression === undefined
      ? undefined
      : staticString(baseUrlExpression, bindings);
  const resolvedUrl =
    rawUrl === undefined
      ? undefined
      : baseUrl === undefined || /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//u.test(rawUrl)
        ? rawUrl
        : `${baseUrl.replace(/\/+$/u, "")}/${rawUrl.replace(/^\/+/u, "")}`;
  if (
    baseUrlExpression !== undefined &&
    baseUrl === undefined &&
    rawUrl !== undefined
  ) {
    issues.push(
      issue(
        "url",
        "Dynamic Axios baseURL cannot be resolved statically.",
        source,
        baseUrlExpression,
      ),
    );
  }
  const url =
    resolvedUrl === undefined
      ? undefined
      : addStaticParams(
          addStaticParams(resolvedUrl, defaults.get("params"), bindings) ??
            resolvedUrl,
          properties.get("params"),
          bindings,
        );
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
  const callHeaders = headerEntries(headersExpression, bindings);
  const defaultHeadersExpression = defaults.get("headers");
  const defaultHeaders = headerEntries(defaultHeadersExpression, bindings);
  // A per-call header replaces the instance default of the same name rather
  // than appending a second copy of it.
  const headers =
    callHeaders === undefined || defaultHeaders === undefined
      ? undefined
      : [
          ...defaultHeaders.filter(
            (header) =>
              !callHeaders.some(
                (override) =>
                  override.name.toLowerCase() === header.name.toLowerCase(),
              ),
          ),
          ...callHeaders,
        ];
  if (headers === undefined)
    issues.push(
      issue(
        "headers",
        "Dynamic headers cannot be resolved statically.",
        source,
        callHeaders === undefined
          ? headersExpression
          : defaultHeadersExpression,
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
  const configuredAuth = axiosAuth(
    properties.get("auth") ?? defaults.get("auth"),
    bindings,
  );
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

/**
 * Names a module's default export is bound to, including the CommonJS form.
 *
 * The single-client Node packages are imported under whatever name the file
 * chooses, so the reader follows the binding rather than insisting on the
 * package name.
 */
function defaultImportNames(
  program: t.Program,
  module: string,
  fallback: string,
): ReadonlySet<string> {
  const names = new Set([fallback]);
  for (const statement of program.body) {
    if (t.isImportDeclaration(statement) && statement.source.value === module) {
      for (const specifier of statement.specifiers) {
        if (
          t.isImportDefaultSpecifier(specifier) ||
          t.isImportNamespaceSpecifier(specifier)
        ) {
          names.add(specifier.local.name);
        }
      }
    }
  }
  walk(program, (node) => {
    if (
      !t.isVariableDeclarator(node) ||
      !t.isIdentifier(node.id) ||
      !t.isCallExpression(node.init) ||
      !t.isIdentifier(node.init.callee, { name: "require" })
    ) {
      return;
    }
    const argument = node.init.arguments[0];
    if (t.isStringLiteral(argument) && argument.value === module) {
      names.add(node.id.name);
    }
  });
  return names;
}

/** One `.name(args)` step of a fluent chain, outermost first. */
interface ChainLink {
  readonly name: string;
  readonly call: t.CallExpression;
}

/**
 * Split a fluent chain into the call that starts it and the steps applied to
 * it. SuperAgent is the only JavaScript target built this way, so the walk is
 * kept here rather than in the shared C-family chain reader.
 */
function flattenChain(call: t.CallExpression): {
  readonly base: t.CallExpression;
  readonly links: readonly ChainLink[];
} {
  const links: ChainLink[] = [];
  let current: t.CallExpression = call;
  for (;;) {
    const callee = current.callee;
    if (
      !t.isMemberExpression(callee) ||
      callee.computed ||
      !t.isIdentifier(callee.property) ||
      !t.isCallExpression(callee.object)
    ) {
      return { base: current, links: links.reverse() };
    }
    links.push({ name: callee.property.name, call: current });
    current = callee.object;
  }
}

/** SuperAgent's per-verb helpers. `del` exists because `delete` is reserved. */
const SUPERAGENT_METHODS: Readonly<Record<string, string>> = {
  get: "GET",
  head: "HEAD",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  del: "DELETE",
  delete: "DELETE",
  options: "OPTIONS",
};

/**
 * Steps that decide what happens around the exchange rather than what is sent.
 * `.ok()` is in this list because the generated code uses it to stop SuperAgent
 * throwing on a non-2xx, which changes nothing about the request.
 */
const SUPERAGENT_IGNORED: readonly string[] = [
  "ok",
  "timeout",
  "retry",
  "buffer",
  "parse",
  "responseType",
  "then",
];

function superagentRequest(
  source: string,
  call: t.CallExpression,
  bindings: StaticBindings,
): ReverseParseResult {
  const issues: DynamicIssue[] = [];
  const { base, links } = flattenChain(call);
  let method: string | undefined;
  let url: string | undefined;
  if (t.isIdentifier(base.callee)) {
    // `superagent("PATCH", url)` — the method is data, so any verb works.
    method = staticString(expressionArgument(base.arguments[0]), bindings);
    url = staticUrlLike(expressionArgument(base.arguments[1]), bindings);
    if (method === undefined || url === undefined) {
      issues.push(
        issue(
          "url",
          "SuperAgent needs a static method and URL to be read back.",
          source,
          base,
        ),
      );
    }
  } else if (
    t.isMemberExpression(base.callee) &&
    t.isIdentifier(base.callee.property)
  ) {
    method = SUPERAGENT_METHODS[base.callee.property.name];
    url = staticUrlLike(expressionArgument(base.arguments[0]), bindings);
    if (url === undefined) {
      issues.push(
        issue(
          "url",
          "Dynamic URL cannot be resolved statically.",
          source,
          base,
        ),
      );
    }
  }

  const headers: Header[] = [];
  const parts: Array<
    | { kind: "field"; name: string; value: string }
    | {
        kind: "file";
        name: string;
        path: string;
        filename?: string;
        contentType?: string;
      }
  > = [];
  let auth: RequestAuth | undefined;
  let body: RequestBody | undefined | "dynamic";
  let followRedirects = true;

  for (const link of links) {
    if (SUPERAGENT_IGNORED.includes(link.name)) continue;
    const args = link.call.arguments;
    if (link.name === "set") {
      if (args.length === 1) {
        const entries = headerEntries(expressionArgument(args[0]), bindings);
        if (entries === undefined) {
          issues.push(
            issue(
              "headers",
              "Dynamic headers cannot be resolved statically.",
              source,
              link.call,
            ),
          );
        } else {
          headers.push(...entries);
        }
        continue;
      }
      const name = staticString(expressionArgument(args[0]), bindings);
      const value = staticString(expressionArgument(args[1]), bindings);
      if (name === undefined || value === undefined) {
        issues.push(
          issue(
            "headers",
            "Dynamic headers cannot be resolved statically.",
            source,
            link.call,
          ),
        );
      } else {
        headers.push({ name, value });
      }
      continue;
    }
    if (link.name === "type") {
      const value = staticString(expressionArgument(args[0]), bindings);
      if (value === undefined) {
        issues.push(
          issue(
            "headers",
            "Dynamic content type cannot be resolved statically.",
            source,
            link.call,
          ),
        );
      } else {
        headers.push({ name: "Content-Type", value });
      }
      continue;
    }
    if (link.name === "auth") {
      const username = staticString(expressionArgument(args[0]), bindings);
      const password = staticString(expressionArgument(args[1]), bindings);
      if (username === undefined || password === undefined) {
        issues.push(
          issue(
            "config",
            "Dynamic credentials cannot be resolved statically.",
            source,
            link.call,
          ),
        );
      } else {
        auth = { kind: "basic", username, password };
      }
      continue;
    }
    if (link.name === "redirects") {
      const value = evaluateStatic(
        expressionArgument(args[0]) ?? t.numericLiteral(0),
        bindings,
      );
      if (!value.ok || typeof value.value !== "number") {
        issues.push(
          issue(
            "config",
            "SuperAgent redirects must be a static number.",
            source,
            link.call,
          ),
        );
      } else {
        followRedirects = value.value > 0;
      }
      continue;
    }
    if (link.name === "query") {
      const expression = expressionArgument(args[0]);
      if (expression === undefined || url === undefined) continue;
      const expanded = urlWithSearchParams(url, expression, bindings);
      if (expanded === undefined) {
        issues.push(
          issue(
            "url",
            "Dynamic query cannot be resolved statically.",
            source,
            link.call,
          ),
        );
      } else {
        url = expanded;
      }
      continue;
    }
    if (link.name === "send") {
      body = bodyFromExpression(expressionArgument(args[0]), bindings);
      continue;
    }
    if (link.name === "field") {
      const name = staticString(expressionArgument(args[0]), bindings);
      const value = staticString(expressionArgument(args[1]), bindings);
      if (name === undefined || value === undefined) {
        issues.push(
          issue(
            "body",
            "Dynamic multipart field cannot be resolved statically.",
            source,
            link.call,
          ),
        );
      } else {
        parts.push({ kind: "field", name, value });
      }
      continue;
    }
    if (link.name === "attach") {
      const name = staticString(expressionArgument(args[0]), bindings);
      const path = staticString(expressionArgument(args[1]), bindings);
      if (name === undefined || path === undefined) {
        issues.push(
          issue(
            "body",
            "SuperAgent can only be read back when an attached file is a static path.",
            source,
            link.call,
          ),
        );
        continue;
      }
      const optionsExpression = expressionArgument(args[2]);
      const resolved =
        optionsExpression === undefined
          ? undefined
          : resolveExpression(optionsExpression, bindings);
      const options =
        resolved !== undefined && t.isObjectExpression(resolved)
          ? objectProperties(resolved)
          : undefined;
      const filename =
        staticString(options?.get("filename"), bindings) ??
        path.split("/").at(-1) ??
        path;
      const partType = staticString(options?.get("contentType"), bindings);
      parts.push({
        kind: "file",
        name,
        path,
        filename,
        ...(partType === undefined ? {} : { contentType: partType }),
      });
      continue;
    }
    issues.push(
      issue(
        "config",
        `Unsupported SuperAgent step cannot be represented safely: ${link.name}.`,
        source,
        link.call,
      ),
    );
  }

  const effective =
    parts.length > 0
      ? headers.filter((header) => header.name.toLowerCase() !== "content-type")
      : headers;
  const resolvedBody =
    parts.length > 0
      ? ({ kind: "multipart", parts } as RequestBody)
      : refineBodyForHeaders(body, effective);
  if (resolvedBody === "dynamic") {
    issues.push(
      issue(
        "body",
        "Dynamic body cannot be resolved statically.",
        source,
        call,
      ),
    );
  }
  const normalized = normalizeHeaders(effective);
  if (issues.length > 0) {
    throw new DynamicExpressionError(issues, {
      client: "superagent",
      ...(method === undefined ? {} : { method }),
      ...(url === undefined ? {} : { url }),
      headers: normalized.headers,
      cookies: normalized.cookies,
      ...((auth ?? normalized.auth === undefined)
        ? {}
        : { auth: auth ?? normalized.auth }),
      ...(resolvedBody === undefined || resolvedBody === "dynamic"
        ? {}
        : { body: resolvedBody }),
      followRedirects,
    });
  }
  return {
    client: "superagent",
    request: createHttpRequest(url ?? "", {
      method: method ?? "GET",
      headers: normalized.headers,
      cookies: normalized.cookies,
      ...(auth === undefined
        ? normalized.auth === undefined
          ? {}
          : { auth: normalized.auth }
        : { auth }),
      ...(resolvedBody === undefined || resolvedBody === "dynamic"
        ? {}
        : { body: resolvedBody }),
      followRedirects,
    }),
  };
}

/** The core HTTP modules, under both the bare and the `node:` specifier. */
const NODE_HTTP_MODULES: readonly string[] = [
  "node:https",
  "node:http",
  "https",
  "http",
];

/**
 * Names bound to `request` from `node:http` or `node:https`, plus the
 * namespace forms that reach it as `https.request`.
 */
function nodeRequestNames(program: t.Program): {
  readonly direct: ReadonlySet<string>;
  readonly namespaces: ReadonlySet<string>;
} {
  const direct = new Set<string>();
  const namespaces = new Set<string>();
  for (const statement of program.body) {
    if (
      !t.isImportDeclaration(statement) ||
      !NODE_HTTP_MODULES.includes(statement.source.value)
    ) {
      continue;
    }
    for (const specifier of statement.specifiers) {
      if (
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported, { name: "request" })
      ) {
        direct.add(specifier.local.name);
      } else if (
        t.isImportDefaultSpecifier(specifier) ||
        t.isImportNamespaceSpecifier(specifier)
      ) {
        namespaces.add(specifier.local.name);
      }
    }
  }
  walk(program, (node) => {
    if (
      !t.isVariableDeclarator(node) ||
      !t.isIdentifier(node.id) ||
      !t.isCallExpression(node.init) ||
      !t.isIdentifier(node.init.callee, { name: "require" })
    ) {
      return;
    }
    const argument = node.init.arguments[0];
    if (
      t.isStringLiteral(argument) &&
      NODE_HTTP_MODULES.includes(argument.value)
    ) {
      namespaces.add(node.id.name);
    }
  });
  return { direct, namespaces };
}

function isNodeRequestCallee(
  callee: t.Node,
  names: ReturnType<typeof nodeRequestNames>,
): boolean {
  if (t.isIdentifier(callee)) return names.direct.has(callee.name);
  return (
    t.isMemberExpression(callee) &&
    !callee.computed &&
    t.isIdentifier(callee.object) &&
    names.namespaces.has(callee.object.name) &&
    t.isIdentifier(callee.property, { name: "request" })
  );
}

/** Header values `node:http` accepts: one string, or an array for duplicates. */
function nodeHeaderEntries(
  expression: t.Expression | undefined,
  bindings: StaticBindings,
): readonly Header[] | undefined {
  if (expression === undefined) return [];
  const node = resolveExpression(expression, bindings);
  if (node === undefined) return undefined;
  const value = evaluateStatic(node, bindings);
  if (!value.ok || value.value === null || typeof value.value !== "object") {
    return undefined;
  }
  if (Array.isArray(value.value)) return undefined;
  const headers: Header[] = [];
  for (const [name, entry] of Object.entries(value.value)) {
    if (typeof entry === "string") {
      headers.push({ name, value: entry });
      continue;
    }
    // An array is how the core module carries the same field name twice.
    if (Array.isArray(entry) && entry.every((one) => typeof one === "string")) {
      for (const one of entry) headers.push({ name, value: one });
      continue;
    }
    return undefined;
  }
  return headers;
}

/** The name a call's result was assigned to, when it was assigned at all. */
function assignedName(
  program: t.Program,
  call: t.CallExpression,
): string | undefined {
  let name: string | undefined;
  walk(program, (node) => {
    if (
      name !== undefined ||
      !t.isVariableDeclarator(node) ||
      !t.isIdentifier(node.id) ||
      node.init !== call
    ) {
      return;
    }
    name = node.id.name;
  });
  return name;
}

function nodeHttpRequest(
  source: string,
  program: t.Program,
  call: t.CallExpression,
  bindings: StaticBindings,
): ReverseParseResult {
  const issues: DynamicIssue[] = [];
  const url = staticUrlLike(expressionArgument(call.arguments[0]), bindings);
  if (url === undefined) {
    issues.push(
      issue(
        "url",
        "The core modules can also take a host and path object; only a static URL string can be read back.",
        source,
        expressionArgument(call.arguments[0]),
      ),
    );
  }
  const optionsExpression = expressionArgument(call.arguments[1]);
  let properties: ReadonlyMap<string, t.Expression> = new Map();
  if (optionsExpression !== undefined && !t.isFunction(optionsExpression)) {
    const resolved = resolveExpression(optionsExpression, bindings);
    const object =
      resolved !== undefined && t.isObjectExpression(resolved)
        ? objectProperties(resolved)
        : undefined;
    if (object === undefined) {
      issues.push(
        issue(
          "config",
          "Dynamic request options cannot be resolved statically.",
          source,
          optionsExpression,
        ),
      );
    } else {
      properties = object;
    }
  }
  for (const [name, expression] of properties) {
    if (!["method", "headers"].includes(name)) {
      issues.push(
        issue(
          "config",
          `Unsupported node:http option cannot be represented safely: ${name}.`,
          source,
          expression,
        ),
      );
    }
  }
  const method =
    staticString(properties.get("method"), bindings) ??
    (properties.has("method") ? undefined : "GET");
  if (method === undefined) {
    issues.push(
      issue(
        "method",
        "Dynamic method cannot be resolved statically.",
        source,
        properties.get("method"),
      ),
    );
  }
  const headers = nodeHeaderEntries(properties.get("headers"), bindings);
  if (headers === undefined) {
    issues.push(
      issue(
        "headers",
        "Dynamic headers cannot be resolved statically.",
        source,
        properties.get("headers"),
      ),
    );
  }

  // The payload is whatever was written to the request, in source order.
  const variable = assignedName(program, call);
  const written: string[] = [];
  let dynamicWrite = false;
  if (variable !== undefined) {
    const after = call.end ?? 0;
    const writes: Array<{ start: number; expression: t.Expression }> = [];
    walk(program, (node) => {
      if (
        !t.isCallExpression(node) ||
        !t.isMemberExpression(node.callee) ||
        node.callee.computed ||
        !t.isIdentifier(node.callee.object, { name: variable }) ||
        !t.isIdentifier(node.callee.property) ||
        !["write", "end"].includes(node.callee.property.name) ||
        (node.start ?? 0) < after
      ) {
        return;
      }
      const argument = expressionArgument(node.arguments[0]);
      if (argument === undefined) return;
      writes.push({ start: node.start ?? 0, expression: argument });
    });
    for (const { expression } of writes.sort((a, b) => a.start - b.start)) {
      const chunk =
        staticString(expression, bindings) ??
        bufferFromString(expression, bindings);
      if (chunk === undefined) {
        dynamicWrite = true;
        continue;
      }
      written.push(chunk);
    }
  }
  if (dynamicWrite) {
    issues.push(
      issue(
        "body",
        "Dynamic request payload cannot be resolved statically.",
        source,
        call,
      ),
    );
  }

  const payload = written.join("");
  const declared = [...(headers ?? [])];
  const declaredType = declared.find(
    (header) => header.name.toLowerCase() === "content-type",
  )?.value;
  const boundary = /boundary=("?)([^";]+)\1/u.exec(declaredType ?? "")?.[2];
  let body: RequestBody | undefined | "dynamic";
  let effective = declared;
  if (payload.length > 0 && boundary !== undefined) {
    if (/filename="/u.test(payload)) {
      issues.push(
        issue(
          "body",
          "This multipart body carries a file's contents rather than its path, so the upload cannot be described as a cURL command.",
          source,
          call,
        ),
      );
    } else {
      const parts = parseMultipartBody(
        payload.replaceAll("\r\n", "\n"),
        boundary,
      );
      if (parts === undefined) {
        issues.push(
          issue(
            "body",
            "This request declares a multipart body whose parts could not be read.",
            source,
            call,
          ),
        );
      } else {
        body = {
          kind: "multipart",
          parts: parts.map(({ name, value }) => ({
            kind: "field" as const,
            name,
            value,
          })),
        };
        // The boundary is framing for this message, not part of the request.
        effective = declared.filter(
          (header) => header.name.toLowerCase() !== "content-type",
        );
      }
    }
  } else if (payload.length > 0) {
    body = refineBodyForHeaders({ kind: "text", value: payload }, declared);
  }

  const normalized = normalizeHeaders(effective);
  if (issues.length > 0) {
    throw new DynamicExpressionError(issues, {
      client: "https",
      ...(method === undefined ? {} : { method }),
      ...(url === undefined ? {} : { url }),
      headers: normalized.headers,
      cookies: normalized.cookies,
      ...(normalized.auth === undefined ? {} : { auth: normalized.auth }),
      ...(body === undefined || body === "dynamic" ? {} : { body }),
      // The core modules do not follow redirects at all.
      followRedirects: false,
    });
  }
  return {
    client: "https",
    request: createHttpRequest(url ?? "", {
      method: method ?? "GET",
      headers: normalized.headers,
      cookies: normalized.cookies,
      ...(normalized.auth === undefined ? {} : { auth: normalized.auth }),
      ...(body === undefined || body === "dynamic" ? {} : { body }),
      followRedirects: false,
    }),
  };
}

/** `Buffer.from("...", "utf8")`, which is how binary chunks are written. */
function bufferFromString(
  expression: t.Expression,
  bindings: StaticBindings,
): string | undefined {
  const node = resolveExpression(expression, bindings);
  if (
    node === undefined ||
    !t.isCallExpression(node) ||
    !t.isMemberExpression(node.callee) ||
    !t.isIdentifier(node.callee.object, { name: "Buffer" }) ||
    !t.isIdentifier(node.callee.property, { name: "from" })
  ) {
    return undefined;
  }
  return staticString(expressionArgument(node.arguments[0]), bindings);
}

/**
 * jQuery and XMLHttpRequest both follow redirects and neither can be told not
 * to, so a request read back from either states that policy rather than
 * inheriting cURL's default of stopping at the first response.
 */
const BROWSER_ALWAYS_FOLLOWS = true;

/** Options `$.ajax` accepts that describe the request itself. */
const JQUERY_OPTIONS: readonly string[] = [
  "url",
  "method",
  "type",
  "headers",
  "data",
  "contentType",
  "processData",
];

/** Options that decide response handling or transport, not what is sent. */
const JQUERY_IGNORED: readonly string[] = [
  "dataType",
  "success",
  "error",
  "complete",
  "cache",
  "async",
  "timeout",
];

function jqueryRequest(
  source: string,
  program: t.Program,
  call: t.CallExpression,
  bindings: StaticBindings,
): ReverseParseResult {
  const issues: DynamicIssue[] = [];
  const configExpression = expressionArgument(call.arguments[0]);
  const resolved =
    configExpression === undefined
      ? undefined
      : resolveExpression(configExpression, bindings);
  const properties =
    resolved !== undefined && t.isObjectExpression(resolved)
      ? objectProperties(resolved)
      : undefined;
  if (properties === undefined) {
    throw new CodeParseError(
      "This $.ajax call was not given a static settings object, so the request cannot be read back.",
    );
  }
  for (const [name, expression] of properties) {
    if (![...JQUERY_OPTIONS, ...JQUERY_IGNORED].includes(name)) {
      issues.push(
        issue(
          "config",
          `Unsupported $.ajax setting cannot be represented safely: ${name}.`,
          source,
          expression,
        ),
      );
    }
  }
  const url = staticUrlLike(properties.get("url"), bindings);
  if (url === undefined) {
    issues.push(
      issue(
        "url",
        "Dynamic URL cannot be resolved statically.",
        source,
        properties.get("url"),
      ),
    );
  }
  const methodExpression = properties.get("method") ?? properties.get("type");
  const method =
    methodExpression === undefined
      ? "GET"
      : staticString(methodExpression, bindings);
  if (method === undefined) {
    issues.push(
      issue(
        "method",
        "Dynamic method cannot be resolved statically.",
        source,
        methodExpression,
      ),
    );
  }
  const headers = headerEntries(properties.get("headers"), bindings) ?? [];
  const declared = [...headers];
  const contentTypeExpression = properties.get("contentType");
  if (contentTypeExpression !== undefined) {
    const value = evaluateStatic(contentTypeExpression, bindings);
    if (value.ok && typeof value.value === "string") {
      declared.push({ name: "Content-Type", value: value.value });
    } else if (!value.ok || value.value !== false) {
      issues.push(
        issue(
          "headers",
          "jQuery contentType must be a static media type or false.",
          source,
          contentTypeExpression,
        ),
      );
    }
  }
  const dataExpression = properties.get("data");
  const candidate = bodyFromExpression(dataExpression, bindings);
  const body = refineBodyForHeaders(
    candidate === "dynamic"
      ? (staticFormDataBody(program, call, dataExpression, bindings) ??
          "dynamic")
      : candidate,
    declared,
  );
  if (body === "dynamic") {
    issues.push(
      issue(
        "body",
        "Dynamic body cannot be resolved statically.",
        source,
        dataExpression,
      ),
    );
  }
  const normalized = normalizeHeaders(declared);
  if (issues.length > 0) {
    throw new DynamicExpressionError(issues, {
      client: "jquery",
      ...(method === undefined ? {} : { method }),
      ...(url === undefined ? {} : { url }),
      headers: normalized.headers,
      cookies: normalized.cookies,
      ...(normalized.auth === undefined ? {} : { auth: normalized.auth }),
      ...(body === undefined || body === "dynamic" ? {} : { body }),
      followRedirects: BROWSER_ALWAYS_FOLLOWS,
    });
  }
  return {
    client: "jquery",
    request: createHttpRequest(url ?? "", {
      method: method ?? "GET",
      headers: normalized.headers,
      cookies: normalized.cookies,
      ...(normalized.auth === undefined ? {} : { auth: normalized.auth }),
      ...(body === undefined || body === "dynamic" ? {} : { body }),
      followRedirects: BROWSER_ALWAYS_FOLLOWS,
    }),
  };
}

/**
 * The `send` call, which is the point every binding has to be resolvable at.
 *
 * Anchoring here rather than at the constructor lets a body declared just
 * above the send resolve, which is how the call is usually written.
 */
function xhrSendCall(
  program: t.Program,
  declaration: t.VariableDeclarator,
): t.CallExpression | undefined {
  if (!t.isIdentifier(declaration.id)) return undefined;
  const name = declaration.id.name;
  let found: t.CallExpression | undefined;
  walk(program, (node) => {
    if (
      found !== undefined ||
      !t.isCallExpression(node) ||
      !t.isMemberExpression(node.callee) ||
      node.callee.computed ||
      !t.isIdentifier(node.callee.object, { name }) ||
      !t.isIdentifier(node.callee.property, { name: "send" })
    ) {
      return;
    }
    found = node;
  });
  return found;
}

function xhrRequest(
  source: string,
  program: t.Program,
  declaration: t.VariableDeclarator,
  bindings: StaticBindings,
): ReverseParseResult {
  const issues: DynamicIssue[] = [];
  if (!t.isIdentifier(declaration.id)) {
    throw new CodeParseError(
      "This XMLHttpRequest was not assigned to a plain variable, so its calls cannot be followed.",
    );
  }
  const name = declaration.id.name;
  const start = declaration.end ?? 0;
  const calls: Array<{
    start: number;
    call: t.CallExpression;
    member: string;
  }> = [];
  // The whole request surface of an XMLHttpRequest is `open`, `setRequestHeader`
  // and `send`. Everything else on the object reads a response or attaches an
  // event handler, so the other members are passed over rather than reported:
  // none of them can change what goes on the wire.
  walk(program, (node) => {
    if (
      !t.isCallExpression(node) ||
      !t.isMemberExpression(node.callee) ||
      node.callee.computed ||
      !t.isIdentifier(node.callee.object, { name }) ||
      !t.isIdentifier(node.callee.property) ||
      (node.start ?? 0) < start
    ) {
      return;
    }
    calls.push({
      start: node.start ?? 0,
      call: node,
      member: node.callee.property.name,
    });
  });
  calls.sort((a, b) => a.start - b.start);

  let method: string | undefined;
  let url: string | undefined;
  let auth: RequestAuth | undefined;
  const headers: Header[] = [];
  let bodyExpression: t.Expression | undefined;
  let sent = false;
  for (const { call, member } of calls) {
    if (member === "open") {
      method = staticString(expressionArgument(call.arguments[0]), bindings);
      url = staticUrlLike(expressionArgument(call.arguments[1]), bindings);
      if (method === undefined || url === undefined) {
        issues.push(
          issue(
            "url",
            "XMLHttpRequest.open needs a static method and URL to be read back.",
            source,
            call,
          ),
        );
      }
      const username = staticString(
        expressionArgument(call.arguments[3]),
        bindings,
      );
      const password = staticString(
        expressionArgument(call.arguments[4]),
        bindings,
      );
      if (username !== undefined && password !== undefined) {
        auth = { kind: "basic", username, password };
      }
      continue;
    }
    if (member === "setRequestHeader") {
      const headerName = staticString(
        expressionArgument(call.arguments[0]),
        bindings,
      );
      const value = staticString(
        expressionArgument(call.arguments[1]),
        bindings,
      );
      if (headerName === undefined || value === undefined) {
        issues.push(
          issue(
            "headers",
            "Dynamic headers cannot be resolved statically.",
            source,
            call,
          ),
        );
      } else {
        headers.push({ name: headerName, value });
      }
      continue;
    }
    if (member === "send") {
      sent = true;
      bodyExpression = expressionArgument(call.arguments[0]);
    }
  }
  if (!sent) {
    throw new CodeParseError(
      "This XMLHttpRequest is never sent, so there is no request to convert.",
    );
  }
  const sendCall = calls.find(({ member }) => member === "send")?.call;
  const candidate = bodyFromExpression(bodyExpression, bindings);
  const body = refineBodyForHeaders(
    candidate === "dynamic" && sendCall !== undefined
      ? (staticFormDataBody(program, sendCall, bodyExpression, bindings) ??
          "dynamic")
      : candidate,
    headers,
  );
  if (body === "dynamic") {
    issues.push(
      issue(
        "body",
        "Dynamic body cannot be resolved statically.",
        source,
        bodyExpression,
      ),
    );
  }
  const normalized = normalizeHeaders(headers);
  const resolvedAuth = auth ?? normalized.auth;
  if (issues.length > 0) {
    throw new DynamicExpressionError(issues, {
      client: "xhr",
      ...(method === undefined ? {} : { method }),
      ...(url === undefined ? {} : { url }),
      headers: normalized.headers,
      cookies: normalized.cookies,
      ...(resolvedAuth === undefined ? {} : { auth: resolvedAuth }),
      ...(body === undefined || body === "dynamic" ? {} : { body }),
      followRedirects: BROWSER_ALWAYS_FOLLOWS,
    });
  }
  return {
    client: "xhr",
    request: createHttpRequest(url ?? "", {
      method: method ?? "GET",
      headers: normalized.headers,
      cookies: normalized.cookies,
      ...(resolvedAuth === undefined ? {} : { auth: resolvedAuth }),
      ...(body === undefined || body === "dynamic" ? {} : { body }),
      followRedirects: BROWSER_ALWAYS_FOLLOWS,
    }),
  };
}

/** Per-verb shortcuts Got and Ky expose beside the options form. */
const SHORTCUT_METHODS: readonly string[] = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
];

/** A `client.post(url, options)` shortcut on one of the bound names. */
function shortcutCall(
  call: t.CallExpression,
  names: ReadonlySet<string>,
): string | undefined {
  if (
    !t.isMemberExpression(call.callee) ||
    call.callee.computed ||
    !t.isIdentifier(call.callee.object) ||
    !names.has(call.callee.object.name) ||
    !t.isIdentifier(call.callee.property) ||
    !SHORTCUT_METHODS.includes(call.callee.property.name)
  ) {
    return undefined;
  }
  return call.callee.property.name.toUpperCase();
}

/** `$.ajax({...})` or `jQuery.ajax({...})`. */
function isJqueryAjax(callee: t.Node): boolean {
  return (
    t.isMemberExpression(callee) &&
    !callee.computed &&
    t.isIdentifier(callee.object) &&
    ["$", "jQuery"].includes(callee.object.name) &&
    t.isIdentifier(callee.property, { name: "ajax" })
  );
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

  // XMLHttpRequest is identified by its constructor rather than by a call, so
  // it is settled before the call walk begins.
  let xhrDeclaration: t.VariableDeclarator | undefined;
  walk(ast.program, (node) => {
    if (
      xhrDeclaration !== undefined ||
      !t.isVariableDeclarator(node) ||
      !t.isNewExpression(node.init) ||
      !t.isIdentifier(node.init.callee, { name: "XMLHttpRequest" })
    ) {
      return;
    }
    xhrDeclaration = node;
  });
  if (xhrDeclaration !== undefined) {
    const anchor = xhrSendCall(ast.program, xhrDeclaration);
    if (anchor === undefined) {
      throw new CodeParseError(
        "This XMLHttpRequest is never sent, so there is no request to convert.",
      );
    }
    const bindings = collectStaticBindings(ast.program, anchor);
    return xhrRequest(source, ast.program, xhrDeclaration, bindings);
  }

  const axiosNames = axiosBindingNames(ast.program);
  const undiciNames = undiciRequestNames(ast.program);
  const gotNames = defaultImportNames(ast.program, "got", "got");
  const kyNames = defaultImportNames(ast.program, "ky", "ky");
  const superagentNames = defaultImportNames(
    ast.program,
    "superagent",
    "superagent",
  );
  const nodeNames = nodeRequestNames(ast.program);
  const instances = axiosInstanceConfigs(ast.program, axiosNames);
  // Instance variables answer to the same call shapes as the `axios` import.
  const callableNames = new Set([...axiosNames, ...instances.keys()]);

  let match:
    | {
        readonly call: t.CallExpression;
        readonly client:
          | "fetch"
          | "axios"
          | "undici"
          | "got"
          | "ky"
          | "superagent"
          | "https"
          | "jquery";
        readonly kind?: NonNullable<ReturnType<typeof axiosCallKind>>;
        readonly shortcut?: string;
      }
    | undefined;
  let instanceName: string | undefined;
  walk(ast.program, (node) => {
    if (match !== undefined || !t.isCallExpression(node)) return;
    if (isJqueryAjax(node.callee)) {
      match = { call: node, client: "jquery" };
      return;
    }
    if (isNodeRequestCallee(node.callee, nodeNames)) {
      match = { call: node, client: "https" };
      return;
    }
    // A SuperAgent chain is matched at its outermost call, which `walk` reaches
    // first, so the whole chain is available to the reader.
    const chainRoot = flattenChain(node).base;
    if (
      (t.isIdentifier(chainRoot.callee) &&
        superagentNames.has(chainRoot.callee.name)) ||
      (t.isMemberExpression(chainRoot.callee) &&
        !chainRoot.callee.computed &&
        t.isIdentifier(chainRoot.callee.object) &&
        superagentNames.has(chainRoot.callee.object.name) &&
        t.isIdentifier(chainRoot.callee.property) &&
        chainRoot.callee.property.name in SUPERAGENT_METHODS)
    ) {
      match = { call: node, client: "superagent" };
      return;
    }
    for (const [client, names] of [
      ["got", gotNames],
      ["ky", kyNames],
    ] as const) {
      if (t.isIdentifier(node.callee) && names.has(node.callee.name)) {
        match = { call: node, client };
        return;
      }
      const shortcut = shortcutCall(node, names);
      if (shortcut !== undefined) {
        match = { call: node, client, shortcut };
        return;
      }
    }
    // Undici is checked before fetch because a project may import both, and its
    // `request` export is a distinct call shape.
    if (isUndiciCallee(node.callee, undiciNames)) {
      match = { call: node, client: "undici" };
      return;
    }
    if (isFetchCallee(node.callee)) {
      match = { call: node, client: "fetch" };
      return;
    }
    const kind = axiosCallKind(node, callableNames);
    if (kind === undefined) return;
    // `axios.create(...)` is itself a member call on an Axios name, but it
    // builds a client rather than issuing a request.
    const calleeName = t.isMemberExpression(node.callee)
      ? t.isIdentifier(node.callee.object)
        ? node.callee.object.name
        : undefined
      : t.isIdentifier(node.callee)
        ? node.callee.name
        : undefined;
    match = { call: node, client: "axios", kind };
    instanceName = calleeName;
  });
  if (match === undefined)
    throw new CodeParseError(
      "No supported JavaScript request was found. This reader recognises fetch, Axios, Undici, Got, Ky, SuperAgent, node:http and node:https, jQuery, and XMLHttpRequest.",
    );
  const bindings = collectStaticBindings(ast.program, match.call);
  if (match.client === "jquery")
    return jqueryRequest(source, ast.program, match.call, bindings);
  if (match.client === "https")
    return nodeHttpRequest(source, ast.program, match.call, bindings);
  if (match.client === "superagent")
    return superagentRequest(source, match.call, bindings);
  if (match.client === "got" || match.client === "ky") {
    return optionsClientRequest(
      source,
      ast.program,
      match.call,
      bindings,
      match.client === "got" ? GOT_DIALECT : KY_DIALECT,
      match.shortcut,
    );
  }
  if (match.client === "undici")
    return undiciRequest(source, ast.program, match.call, bindings);
  return match.client === "fetch"
    ? optionsClientRequest(
        source,
        ast.program,
        match.call,
        bindings,
        FETCH_DIALECT,
        undefined,
      )
    : axiosRequest(
        source,
        ast.program,
        match.call,
        match.kind ?? "request",
        bindings,
        instanceName === undefined ? undefined : instances.get(instanceName),
      );
}
