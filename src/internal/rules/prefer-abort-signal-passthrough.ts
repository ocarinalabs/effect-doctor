import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";

import {
  collectImportBindings,
  isUnshadowedGlobal,
  staticString,
  unwrapExpression,
} from "./ast.ts";
import { EFFECT_IMPORT_BINDINGS, effectExportName } from "./effect-imports.ts";
import type { EffectImportBinding } from "./effect-imports.ts";

type PromiseAdapterFunction = ESTree.ArrowFunctionExpression | ESTree.Function;

const isPromiseAdapterFunction = (
  node: ESTree.Node
): node is PromiseAdapterFunction =>
  node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression";

const propertyName = (property: ESTree.ObjectProperty): string | undefined => {
  if (property.key.type === "Identifier" && !property.computed) {
    return property.key.name;
  }
  return property.key.type === "Literal" &&
    typeof property.key.value === "string"
    ? property.key.value
    : undefined;
};

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
    propertyName(parent) !== "try"
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

const enclosingPromiseAdapter = (
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

const definitivelyOmitsSignal = (
  argument: ESTree.Argument | undefined
): boolean => {
  if (argument === undefined) {
    return true;
  }
  if (argument.type === "SpreadElement") {
    return false;
  }
  const options = unwrapExpression(argument);
  if (options.type !== "ObjectExpression") {
    return false;
  }
  for (const property of options.properties) {
    if (
      property.type === "SpreadElement" ||
      propertyName(property) === "signal"
    ) {
      return false;
    }
  }
  return true;
};

export const preferAbortSignalPassthrough = defineRule({
  meta: {
    docs: {
      description:
        "Forward Effect's AbortSignal when adapting a directly cancellable fetch promise.",
    },
    type: "suggestion",
  },
  createOnce(context) {
    let bindings: ReadonlyMap<number, EffectImportBinding> = new Map();
    return {
      before() {
        bindings = collectImportBindings(
          context.sourceCode.ast,
          EFFECT_IMPORT_BINDINGS
        );
      },
      CallExpression(node) {
        const callee = unwrapExpression(node.callee);
        const [input, init] = node.arguments;
        if (
          callee.type !== "Identifier" ||
          !isUnshadowedGlobal(context, callee, "fetch") ||
          staticString(input) === undefined ||
          !definitivelyOmitsSignal(init) ||
          enclosingPromiseAdapter(context, bindings, node) === undefined
        ) {
          return;
        }
        context.report({
          message:
            "Accept Effect's AbortSignal in this promise adapter and pass it to fetch so interruption cancels the request.",
          node,
        });
      },
    };
  },
});
