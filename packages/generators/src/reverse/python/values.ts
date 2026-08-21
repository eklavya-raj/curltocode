import type { FormField, Header, JsonValue } from "@curltocode/core";

import { resolve } from "./syntax.js";
import type { PythonNode } from "./syntax.js";

/**
 * Reading a parsed Python literal back into a value.
 *
 * These live apart from the client readers because the stdlib reader in
 * `stdlib.ts` and the third-party reader in `index.ts` both need them, and a
 * second copy of "what does this dict mean" is exactly the kind of duplication
 * that lets the two drift.
 */

export function asString(node: PythonNode): string | undefined {
  if (node.kind === "string") return node.value;
  if (node.kind === "number") return String(node.value);
  if (node.kind === "boolean") return node.value ? "True" : "False";
  return undefined;
}

/** Convert a parsed literal to JSON, or `undefined` if anything is dynamic. */
export function asJson(node: PythonNode): JsonValue | undefined {
  switch (node.kind) {
    case "string":
      return node.value;
    case "number":
      return node.value;
    case "boolean":
      return node.value;
    case "none":
      return null;
    case "list":
    case "tuple": {
      const items: JsonValue[] = [];
      for (const item of node.items) {
        const value = asJson(item);
        if (value === undefined) return undefined;
        items.push(value);
      }
      return items;
    }
    case "dict": {
      const object: Record<string, JsonValue> = {};
      for (const entry of node.entries) {
        const key = asString(entry.key);
        const value = asJson(entry.value);
        if (key === undefined || value === undefined) return undefined;
        object[key] = value;
      }
      return object;
    }
    default:
      return undefined;
  }
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value).every(isJsonValue);
}

export function parseJsonText(text: string): JsonValue | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return isJsonValue(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Read a name/value mapping. Python code writes these as a dict, but requests
 * also accepts a list of pairs, which preserves duplicate names.
 */
export function pairs(
  node: PythonNode,
): readonly { readonly name: string; readonly value: string }[] | undefined {
  if (node.kind === "dict") {
    const out: { name: string; value: string }[] = [];
    for (const entry of node.entries) {
      const name = asString(entry.key);
      const value = asString(entry.value);
      if (name === undefined || value === undefined) return undefined;
      out.push({ name, value });
    }
    return out;
  }
  if (node.kind === "list" || node.kind === "tuple") {
    const out: { name: string; value: string }[] = [];
    for (const item of node.items) {
      if (item.kind !== "tuple" && item.kind !== "list") return undefined;
      const [first, second] = item.items;
      if (first === undefined || second === undefined) return undefined;
      const name = asString(first);
      const value = asString(second);
      if (name === undefined || value === undefined) return undefined;
      out.push({ name, value });
    }
    return out;
  }
  return undefined;
}

export function contentTypeOf(headers: readonly Header[]): string | undefined {
  return headers.find((header) => header.name.toLowerCase() === "content-type")
    ?.value;
}

export function appendQuery(url: string, query: readonly FormField[]): string {
  if (query.length === 0) return url;
  const separator = url.includes("?") ? "&" : "?";
  const encoded = query
    .map(
      (field) =>
        `${encodeURIComponent(field.name)}=${encodeURIComponent(field.value)}`,
    )
    .join("&");
  return `${url}${separator}${encoded}`;
}

/**
 * Trace a value back to the file it opens.
 *
 * aiohttp examples commonly route the handle through an ExitStack, so
 * `files.enter_context(open("a.png", "rb"))` has to unwrap to the same path as
 * a bare `open(...)`.
 */
export function filePathFrom(
  node: PythonNode,
  bindings: ReadonlyMap<string, PythonNode>,
): string | undefined {
  const resolved = resolve(node, bindings);
  if (resolved.kind !== "call") return undefined;
  if (resolved.callee === "open" || resolved.callee.endsWith(".open")) {
    const first = resolved.args.positional[0];
    return first?.kind === "string" ? first.value : undefined;
  }
  if (resolved.callee.endsWith(".enter_context")) {
    const inner = resolved.args.positional[0];
    return inner === undefined ? undefined : filePathFrom(inner, bindings);
  }
  return undefined;
}
