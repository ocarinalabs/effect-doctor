import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import {
  collectImportBindings,
  isUnshadowedGlobal,
  staticPropertyName,
  staticString,
  unwrapExpression,
} from "./ast.ts";
import { EFFECT_IMPORT_BINDINGS } from "./effect-imports.ts";
import type { EffectImportBinding } from "./effect-imports.ts";
import { enclosingPromiseAdapter } from "./promise-adapter.ts";

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
      staticPropertyName(property) === "signal"
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
