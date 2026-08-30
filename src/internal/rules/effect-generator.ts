import type { Context, ESTree } from "@oxlint/plugins";

import { unwrapExpression } from "./ast.ts";
import { effectExportName } from "./effect-imports.ts";
import type { EffectImportBinding } from "./effect-imports.ts";

export type EffectGeneratorFunction =
  | ESTree.ArrowFunctionExpression
  | ESTree.Function;

export const effectGeneratorFunction = (
  context: Context,
  bindings: ReadonlyMap<number, EffectImportBinding>,
  expression: ESTree.Expression
): EffectGeneratorFunction | undefined => {
  const node = unwrapExpression(expression);
  if (
    node.type !== "CallExpression" ||
    node.callee.type === "Super" ||
    effectExportName(context, bindings, node.callee) !== "gen"
  ) {
    return undefined;
  }
  const [generatorFunction] = node.arguments;
  return generatorFunction?.type === "ArrowFunctionExpression" ||
    generatorFunction?.type === "FunctionExpression"
    ? generatorFunction
    : undefined;
};
