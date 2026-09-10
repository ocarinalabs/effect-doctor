import type { Context, ESTree } from "@oxlint/plugins";

import { isUnshadowedGlobal, unwrapExpression } from "./ast.ts";

export const jsonStringifyCall = (
  context: Context,
  expression: ESTree.Expression
): ESTree.CallExpression | undefined => {
  const node = unwrapExpression(expression);
  if (
    node.type !== "CallExpression" ||
    node.arguments.length !== 1 ||
    node.callee.type !== "MemberExpression" ||
    node.callee.computed ||
    node.callee.property.type !== "Identifier" ||
    node.callee.property.name !== "stringify"
  ) {
    return undefined;
  }
  const owner = unwrapExpression(node.callee.object);
  return owner.type === "Identifier" &&
    isUnshadowedGlobal(context, owner, "JSON")
    ? node
    : undefined;
};
