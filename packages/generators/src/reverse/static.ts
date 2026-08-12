import * as t from "@babel/types";
import type { JsonValue } from "@curltocode/core";

export type StaticResult =
  { readonly ok: true; readonly value: JsonValue } | { readonly ok: false };
export type StaticBindings = ReadonlyMap<string, t.Expression>;

export function unwrapExpression(expression: t.Expression): t.Expression {
  if (
    t.isTSAsExpression(expression) ||
    t.isTSSatisfiesExpression(expression) ||
    t.isTSNonNullExpression(expression) ||
    t.isTypeCastExpression(expression)
  ) {
    return unwrapExpression(expression.expression);
  }
  return expression;
}

function propertyName(
  property: t.ObjectProperty | t.ObjectMethod,
): string | undefined {
  if (property.computed) return undefined;
  if (t.isIdentifier(property.key)) return property.key.name;
  if (t.isStringLiteral(property.key) || t.isNumericLiteral(property.key))
    return String(property.key.value);
  return undefined;
}

export function objectProperties(
  object: t.ObjectExpression,
): ReadonlyMap<string, t.Expression> | undefined {
  const properties = new Map<string, t.Expression>();
  for (const property of object.properties) {
    if (!t.isObjectProperty(property) || !t.isExpression(property.value))
      return undefined;
    const name = propertyName(property);
    if (name === undefined) return undefined;
    properties.set(name, unwrapExpression(property.value));
  }
  return properties;
}

export function resolveExpression(
  expression: t.Expression,
  bindings: StaticBindings = new Map(),
  resolving: ReadonlySet<string> = new Set(),
): t.Expression | undefined {
  const node = unwrapExpression(expression);
  if (!t.isIdentifier(node)) return node;
  if (resolving.has(node.name)) return undefined;
  const bound = bindings.get(node.name);
  if (bound === undefined) return node;
  return resolveExpression(bound, bindings, new Set([...resolving, node.name]));
}

export function evaluateStatic(
  expression: t.Expression,
  bindings: StaticBindings = new Map(),
  resolving: ReadonlySet<string> = new Set(),
): StaticResult {
  const unwrapped = unwrapExpression(expression);
  if (t.isIdentifier(unwrapped)) {
    if (resolving.has(unwrapped.name)) return { ok: false };
    const bound = bindings.get(unwrapped.name);
    if (bound === undefined) return { ok: false };
    return evaluateStatic(
      bound,
      bindings,
      new Set([...resolving, unwrapped.name]),
    );
  }
  const node = unwrapped;
  if (t.isStringLiteral(node) || t.isBooleanLiteral(node)) {
    return { ok: true, value: node.value };
  }
  if (t.isNumericLiteral(node)) {
    return Number.isFinite(node.value)
      ? { ok: true, value: node.value }
      : { ok: false };
  }
  if (t.isNullLiteral(node)) return { ok: true, value: null };
  if (t.isTemplateLiteral(node)) {
    let value = "";
    for (let index = 0; index < node.quasis.length; index += 1) {
      const quasi = node.quasis[index];
      value += quasi?.value.cooked ?? quasi?.value.raw ?? "";
      const expression = node.expressions[index];
      if (expression === undefined) continue;
      if (!t.isExpression(expression)) return { ok: false };
      const result = evaluateStatic(expression, bindings, resolving);
      if (
        !result.ok ||
        (typeof result.value === "object" && result.value !== null)
      ) {
        return { ok: false };
      }
      value += String(result.value);
    }
    return { ok: true, value };
  }
  if (t.isBinaryExpression(node) && node.operator === "+") {
    const left = evaluateStatic(node.left, bindings, resolving);
    const right = evaluateStatic(node.right, bindings, resolving);
    if (
      !left.ok ||
      !right.ok ||
      (typeof left.value !== "string" && typeof left.value !== "number") ||
      (typeof right.value !== "string" && typeof right.value !== "number")
    ) {
      return { ok: false };
    }
    const value =
      typeof left.value === "string" || typeof right.value === "string"
        ? String(left.value) + String(right.value)
        : left.value + right.value;
    return typeof value === "number" && !Number.isFinite(value)
      ? { ok: false }
      : { ok: true, value };
  }
  if (
    t.isUnaryExpression(node) &&
    node.operator === "-" &&
    t.isNumericLiteral(node.argument)
  ) {
    return Number.isFinite(node.argument.value)
      ? { ok: true, value: -node.argument.value }
      : { ok: false };
  }
  if (t.isArrayExpression(node)) {
    const values: JsonValue[] = [];
    for (const element of node.elements) {
      if (element === null || !t.isExpression(element)) return { ok: false };
      const result = evaluateStatic(element, bindings, resolving);
      if (!result.ok) return result;
      values.push(result.value);
    }
    return { ok: true, value: values };
  }
  if (t.isObjectExpression(node)) {
    const properties = objectProperties(node);
    if (properties === undefined) return { ok: false };
    const value: Record<string, JsonValue> = {};
    for (const [name, property] of properties) {
      const result = evaluateStatic(property, bindings, resolving);
      if (!result.ok) return result;
      value[name] = result.value;
    }
    return { ok: true, value };
  }
  return { ok: false };
}

export function staticString(
  expression: t.Expression | undefined,
  bindings: StaticBindings = new Map(),
): string | undefined {
  if (expression === undefined) return undefined;
  const result = evaluateStatic(expression, bindings);
  return result.ok && typeof result.value === "string"
    ? result.value
    : undefined;
}
