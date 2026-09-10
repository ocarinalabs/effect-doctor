import { defineRule } from "@oxlint/plugins";

import { collectImportBindings } from "../internal/ast.ts";
import {
  EFFECT_IMPORT_BINDINGS,
  effectExportName,
} from "../internal/effect-imports.ts";
import type { EffectImportBinding } from "../internal/effect-imports.ts";
import { jsonStringifyCall } from "../internal/json.ts";

const LOG_FUNCTIONS: ReadonlySet<string> = new Set([
  "log",
  "logDebug",
  "logError",
  "logFatal",
  "logInfo",
  "logTrace",
  "logWarning",
]);

export const preferStructuredLogData = defineRule({
  meta: {
    docs: {
      description:
        "Pass structured values directly to Effect logging instead of serializing them first.",
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
        const logger = effectExportName(context, bindings, node.callee);
        if (logger === undefined || !LOG_FUNCTIONS.has(logger)) {
          return;
        }
        for (const argument of node.arguments) {
          if (argument.type === "SpreadElement") {
            continue;
          }
          const stringify = jsonStringifyCall(context, argument);
          if (stringify !== undefined) {
            context.report({
              message:
                "Pass this value directly to Effect logging so loggers retain its structure.",
              node: stringify,
            });
          }
        }
      },
    };
  },
});
