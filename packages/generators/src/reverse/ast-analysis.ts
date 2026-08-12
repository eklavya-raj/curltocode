import * as t from "@babel/types";

import { unwrapExpression } from "./static.js";
import type { StaticBindings } from "./static.js";
import type { DynamicIssue } from "./types.js";

export function walk(node: t.Node, visitor: (node: t.Node) => void): void {
  visitor(node);
  const keys = t.VISITOR_KEYS[node.type] ?? [];
  for (const key of keys) {
    const child: unknown = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(child)) {
      for (const entry of child) {
        if (entry !== null && typeof entry === "object" && "type" in entry) {
          walk(entry as t.Node, visitor);
        }
      }
    } else if (child !== null && typeof child === "object" && "type" in child) {
      walk(child as t.Node, visitor);
    }
  }
}

export function walkWithAncestors(
  node: t.Node,
  ancestors: readonly t.Node[],
  visitor: (node: t.Node, ancestors: readonly t.Node[]) => void,
): void {
  visitor(node, ancestors);
  const keys = t.VISITOR_KEYS[node.type] ?? [];
  for (const key of keys) {
    const child: unknown = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(child)) {
      for (const entry of child) {
        if (entry !== null && typeof entry === "object" && "type" in entry) {
          walkWithAncestors(entry as t.Node, [...ancestors, node], visitor);
        }
      }
    } else if (child !== null && typeof child === "object" && "type" in child) {
      walkWithAncestors(child as t.Node, [...ancestors, node], visitor);
    }
  }
}

export function memberRootName(node: t.Node): string | undefined {
  if (t.isIdentifier(node)) return node.name;
  if (t.isMemberExpression(node)) return memberRootName(node.object);
  return undefined;
}

export function containsNode(container: t.Node, node: t.Node): boolean {
  if (
    container.start === null ||
    container.start === undefined ||
    container.end === null ||
    container.end === undefined ||
    node.start === null ||
    node.start === undefined ||
    node.end === null ||
    node.end === undefined
  ) {
    return false;
  }
  return container.start <= node.start && container.end >= node.end;
}

export function isLexicalScope(node: t.Node): boolean {
  return t.isProgram(node) || t.isBlockStatement(node) || t.isCatchClause(node);
}

function bindingMayBeMutated(
  program: t.Program,
  name: string,
  after: number,
  before: number,
): boolean {
  let mutated = false;
  walk(program, (node) => {
    if (
      mutated ||
      node.start === null ||
      node.start === undefined ||
      node.start <= after ||
      node.start >= before
    ) {
      return;
    }
    if (t.isAssignmentExpression(node) && memberRootName(node.left) === name) {
      mutated = true;
    } else if (
      t.isUpdateExpression(node) &&
      memberRootName(node.argument) === name
    ) {
      mutated = true;
    } else if (
      t.isCallExpression(node) &&
      t.isMemberExpression(node.callee) &&
      memberRootName(node.callee.object) === name
    ) {
      mutated = true;
    }
  });
  return mutated;
}

export function collectStaticBindings(
  program: t.Program,
  call: t.CallExpression,
): StaticBindings {
  const callStart = call.start ?? Number.POSITIVE_INFINITY;
  const candidates = new Map<
    string,
    { readonly expression: t.Expression; readonly declaredAt: number }
  >();
  walkWithAncestors(program, [], (node, ancestors) => {
    if (
      !t.isVariableDeclaration(node) ||
      node.kind !== "const" ||
      (node.start ?? Number.POSITIVE_INFINITY) >= callStart
    ) {
      return;
    }
    const scope = [...ancestors].reverse().find(isLexicalScope) ?? program;
    if (!containsNode(scope, call)) return;
    for (const declarator of node.declarations) {
      if (
        t.isIdentifier(declarator.id) &&
        t.isExpression(declarator.init) &&
        (declarator.init.end ?? Number.POSITIVE_INFINITY) < callStart
      ) {
        candidates.set(declarator.id.name, {
          expression: declarator.init,
          declaredAt: declarator.init.end ?? 0,
        });
      }
    }
  });
  return new Map(
    [...candidates]
      .filter(
        ([name, candidate]) =>
          !bindingMayBeMutated(program, name, candidate.declaredAt, callStart),
      )
      .map(([name, candidate]) => [name, candidate.expression]),
  );
}

export function expressionArgument(
  argument: t.CallExpression["arguments"][number] | undefined,
): t.Expression | undefined {
  return argument !== undefined && t.isExpression(argument)
    ? unwrapExpression(argument)
    : undefined;
}

export function issue(
  kind: DynamicIssue["kind"],
  message: string,
  source: string,
  node: t.Node | undefined,
): DynamicIssue {
  const expression =
    node?.start === null ||
    node?.start === undefined ||
    node.end === null ||
    node.end === undefined
      ? "unknown expression"
      : source.slice(node.start, node.end);
  return { kind, message, expression };
}
