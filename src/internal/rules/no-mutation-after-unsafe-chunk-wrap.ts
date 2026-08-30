import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree, Variable } from "@oxlint/plugins";

import {
  collectImportBindings,
  importedExportName,
  isFunctionBoundary,
  unwrapExpression,
  variableForReference,
} from "./ast.ts";

type ChunkImportBinding = "*" | "fromArrayUnsafe";

const CHUNK_IMPORT_BINDINGS: ReadonlyMap<string, ChunkImportBinding> = new Map([
  ["effect:named:Chunk", "*"],
  ["effect/Chunk:namespace", "*"],
  ["effect/Chunk:named:fromArrayUnsafe", "fromArrayUnsafe"],
]);

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
  expression: ESTree.Expression
): ESTree.IdentifierReference | undefined => {
  const node = unwrapExpression(expression);
  return node.type === "Identifier" ? node : undefined;
};

const localVariable = (
  context: Context,
  expression: ESTree.Expression
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
  bindings: ReadonlyMap<number, ChunkImportBinding>,
  node: ESTree.CallExpression
): Variable | undefined => {
  if (node.callee.type === "Super") {
    return undefined;
  }
  const operation = importedExportName(context, bindings, node.callee);
  if (operation !== "fromArrayUnsafe") {
    return undefined;
  }
  const [argument] = node.arguments;
  return argument === undefined || argument.type === "SpreadElement"
    ? undefined
    : localVariable(context, argument);
};

const directMemberVariable = (
  context: Context,
  member: ESTree.MemberExpression
): Variable | undefined =>
  member.object.type === "Super"
    ? undefined
    : localVariable(context, member.object);

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
    ? directMemberVariable(context, callee)
    : undefined;
};

const assignedMemberVariable = (
  context: Context,
  target: ESTree.AssignmentTarget
): Variable | undefined =>
  target.type === "MemberExpression"
    ? directMemberVariable(context, target)
    : undefined;

const updatedMemberVariable = (
  context: Context,
  target: ESTree.SimpleAssignmentTarget
): Variable | undefined =>
  target.type === "MemberExpression"
    ? directMemberVariable(context, target)
    : undefined;

type WrapsByBoundary = ReadonlyMap<Variable, ReadonlyMap<number, number>>;

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
  wraps: WrapsByBoundary,
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
  wraps: Map<Variable, Map<number, number>>,
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

export const noMutationAfterUnsafeChunkWrap = defineRule({
  meta: {
    docs: {
      description:
        "Prevent direct mutation of arrays shared with Chunk.fromArrayUnsafe.",
    },
    type: "problem",
  },
  createOnce(context) {
    let bindings: ReadonlyMap<number, ChunkImportBinding> = new Map();
    const wraps = new Map<Variable, Map<number, number>>();

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
        bindings = collectImportBindings(
          context.sourceCode.ast,
          CHUNK_IMPORT_BINDINGS
        );
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
        reportIfWrapped(node, assignedMemberVariable(context, node.left));
      },
      UpdateExpression(node) {
        reportIfWrapped(node, updatedMemberVariable(context, node.argument));
      },
    };
  },
});
