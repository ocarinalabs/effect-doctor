import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree, Variable } from "@oxlint/plugins";

import {
  isFunctionBoundary,
  unwrapExpression,
  variableForReference,
} from "../internal/ast.ts";
import {
  collectModuleBindings,
  defineEffectModule,
  moduleExportName,
} from "../internal/effect-module.ts";
import type { ModuleBindings } from "../internal/effect-module.ts";

const CHUNK_MODULE = defineEffectModule("effect", "Chunk", ["fromArrayUnsafe"]);

const MUTATING_ARRAY_METHODS: ReadonlySet<string> = new Set([
  "copyWithin",
  "fill",
  "pop",
  "push",
  "reverse",
  "shift",
  "sort",
  "splice",
  "unshift",
]);

const mutationMessage =
  "Do not mutate this array after passing it to Chunk.fromArrayUnsafe because the Chunk shares its backing storage.";

const directIdentifier = (
  expression: ESTree.Expression | ESTree.Super
): ESTree.IdentifierReference | undefined => {
  if (expression.type === "Super") {
    return undefined;
  }
  const node = unwrapExpression(expression);
  return node.type === "Identifier" ? node : undefined;
};

const localVariable = (
  context: Context,
  expression: ESTree.Expression | ESTree.Super
): Variable | undefined => {
  const identifier = directIdentifier(expression);
  if (identifier === undefined) {
    return undefined;
  }
  const variable = variableForReference(context, identifier);
  return variable !== undefined &&
    variable.defs.some((definition) => definition.type !== "ImportBinding")
    ? variable
    : undefined;
};

const unsafeWrappedVariable = (
  context: Context,
  bindings: ModuleBindings,
  node: ESTree.CallExpression
): Variable | undefined => {
  const operation = moduleExportName(
    context,
    bindings,
    CHUNK_MODULE,
    node.callee
  );
  if (operation !== "fromArrayUnsafe") {
    return undefined;
  }
  const [argument] = node.arguments;
  return argument === undefined || argument.type === "SpreadElement"
    ? undefined
    : localVariable(context, argument);
};

const mutatingMethodVariable = (
  context: Context,
  node: ESTree.CallExpression
): Variable | undefined => {
  if (node.callee.type === "Super") {
    return undefined;
  }
  const callee = unwrapExpression(node.callee);
  if (
    callee.type !== "MemberExpression" ||
    callee.property.type !== "Identifier"
  ) {
    return undefined;
  }
  const method = callee.computed ? undefined : callee.property.name;
  return method !== undefined && MUTATING_ARRAY_METHODS.has(method)
    ? localVariable(context, callee.object)
    : undefined;
};

const memberTargetVariable = (
  context: Context,
  target: ESTree.AssignmentTarget | ESTree.SimpleAssignmentTarget
): Variable | undefined =>
  target.type === "MemberExpression"
    ? localVariable(context, target.object)
    : undefined;

const reassignedVariable = (
  context: Context,
  target: ESTree.AssignmentTarget
): Variable | undefined =>
  target.type === "Identifier" ? localVariable(context, target) : undefined;

type WrapEnds = Map<Variable, Map<number, number>>;

const executionBoundaryStart = (node: ESTree.Node): number | undefined => {
  let ancestor: ESTree.Node | null = node.parent;
  while (ancestor !== null) {
    if (isFunctionBoundary(ancestor) || ancestor.type === "Program") {
      return ancestor.range[0];
    }
    ancestor = ancestor.parent;
  }
  return undefined;
};

const wasWrappedEarlier = (
  wraps: WrapEnds,
  variable: Variable | undefined,
  mutation: ESTree.Node
): boolean => {
  const boundary = executionBoundaryStart(mutation);
  if (variable === undefined || boundary === undefined) {
    return false;
  }
  const wrapEnd = wraps.get(variable)?.get(boundary);
  return wrapEnd !== undefined && wrapEnd < mutation.range[0];
};

const recordWrap = (
  wraps: WrapEnds,
  variable: Variable,
  node: ESTree.CallExpression
): void => {
  const boundary = executionBoundaryStart(node);
  if (boundary === undefined) {
    return;
  }
  const boundaries = wraps.get(variable) ?? new Map<number, number>();
  const priorWrapEnd = boundaries.get(boundary);
  boundaries.set(
    boundary,
    priorWrapEnd === undefined
      ? node.range[1]
      : Math.min(priorWrapEnd, node.range[1])
  );
  wraps.set(variable, boundaries);
};

const forgetWrap = (
  wraps: WrapEnds,
  variable: Variable | undefined,
  node: ESTree.Node
): void => {
  const boundary = executionBoundaryStart(node);
  if (variable === undefined || boundary === undefined) {
    return;
  }
  wraps.get(variable)?.delete(boundary);
};

export const noMutationAfterUnsafeChunkWrap = defineRule({
  meta: {
    docs: {
      description:
        "Prevent direct mutation of arrays shared with Chunk.fromArrayUnsafe.",
    },
    type: "problem",
  },
  createOnce(context) {
    let bindings: ModuleBindings = new Map();
    const wraps: WrapEnds = new Map();

    const reportIfWrapped = (
      node:
        | ESTree.CallExpression
        | ESTree.AssignmentExpression
        | ESTree.UpdateExpression,
      variable: Variable | undefined
    ): void => {
      if (wasWrappedEarlier(wraps, variable, node)) {
        context.report({ message: mutationMessage, node });
      }
    };

    return {
      before() {
        wraps.clear();
        bindings = collectModuleBindings(context, CHUNK_MODULE);
      },
      CallExpression(node) {
        const wrapped = unsafeWrappedVariable(context, bindings, node);
        if (wrapped !== undefined) {
          recordWrap(wraps, wrapped, node);
          return;
        }
        reportIfWrapped(node, mutatingMethodVariable(context, node));
      },
      AssignmentExpression(node) {
        reportIfWrapped(node, memberTargetVariable(context, node.left));
        if (node.operator === "=") {
          forgetWrap(wraps, reassignedVariable(context, node.left), node);
        }
      },
      UpdateExpression(node) {
        reportIfWrapped(node, memberTargetVariable(context, node.argument));
      },
    };
  },
});
