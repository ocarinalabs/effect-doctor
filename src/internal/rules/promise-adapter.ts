import type { Context, ESTree } from "@oxlint/plugins";

import { staticPropertyName } from "./ast.ts";
import { effectExportName } from "./effect-imports.ts";
import type { EffectImportBinding } from "./effect-imports.ts";

export type PromiseAdapterFunction =
  | ESTree.ArrowFunctionExpression
  | ESTree.Function;

const isPromiseAdapterFunction = (
  node: ESTree.Node
): node is PromiseAdapterFunction =>
  node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression";

const directAdapterName = (
  context: Context,
  bindings: ReadonlyMap<number, EffectImportBinding>,
  adapterFunction: PromiseAdapterFunction
): string | undefined => {
  const { parent } = adapterFunction;
  if (parent.type !== "CallExpression") {
    return undefined;
  }
  return parent.arguments[0] === adapterFunction
    ? effectExportName(context, bindings, parent.callee)
    : undefined;
};

const tryPromiseOptionsFor = (
  adapterFunction: PromiseAdapterFunction
): ESTree.ObjectExpression | undefined => {
  const { parent } = adapterFunction;
  if (
    parent.type !== "Property" ||
    parent.value !== adapterFunction ||
    parent.kind !== "init" ||
    staticPropertyName(parent) !== "try"
  ) {
    return undefined;
  }
  const options = parent.parent;
  return options.type === "ObjectExpression" ? options : undefined;
};

const isPromiseAdapterCallback = (
  context: Context,
  bindings: ReadonlyMap<number, EffectImportBinding>,
  adapterFunction: PromiseAdapterFunction
): boolean => {
  const directAdapter = directAdapterName(context, bindings, adapterFunction);
  if (directAdapter === "promise" || directAdapter === "tryPromise") {
    return true;
  }
  const options = tryPromiseOptionsFor(adapterFunction);
  if (options === undefined) {
    return false;
  }
  const adapterCall = options.parent;
  return (
    adapterCall.type === "CallExpression" &&
    adapterCall.arguments[0] === options &&
    effectExportName(context, bindings, adapterCall.callee) === "tryPromise"
  );
};

export const enclosingPromiseAdapter = (
  context: Context,
  bindings: ReadonlyMap<number, EffectImportBinding>,
  node: ESTree.Node
): PromiseAdapterFunction | undefined => {
  let ancestor = node.parent;
  while (ancestor !== null) {
    if (isPromiseAdapterFunction(ancestor)) {
      return isPromiseAdapterCallback(context, bindings, ancestor)
        ? ancestor
        : undefined;
    }
    ancestor = ancestor.parent;
  }
  return undefined;
};
