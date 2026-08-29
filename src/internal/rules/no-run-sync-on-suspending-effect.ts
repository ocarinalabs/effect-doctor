import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";

import { collectImportBindings, unwrapExpression } from "./ast.ts";
import { EFFECT_IMPORT_BINDINGS, effectExportName } from "./effect-imports.ts";
import type { EffectImportBinding } from "./effect-imports.ts";

const SYNC_RUNNERS: ReadonlySet<string> = new Set(["runSync", "runSyncExit"]);
const SUSPENDING_CALLS: ReadonlySet<string> = new Set([
  "callback",
  "promise",
  "sleep",
  "tryPromise",
]);
const SUSPENDING_VALUES: ReadonlySet<string> = new Set(["never", "yieldNow"]);

const expressionArgument = (
  argument: ESTree.Argument | undefined
): ESTree.Expression | undefined =>
  argument === undefined || argument.type === "SpreadElement"
    ? undefined
    : unwrapExpression(argument);

const isKnownSuspendingEffect = (
  context: Context,
  bindings: ReadonlyMap<number, EffectImportBinding>,
  expression: ESTree.Expression
): boolean => {
  const node = unwrapExpression(expression);
  if (node.type === "CallExpression") {
    const name = effectExportName(context, bindings, node.callee);
    return name !== undefined && SUSPENDING_CALLS.has(name);
  }
  const name = effectExportName(context, bindings, node);
  return name !== undefined && SUSPENDING_VALUES.has(name);
};

export const noRunSyncOnSuspendingEffect = defineRule({
  meta: {
    docs: {
      description:
        "Avoid synchronous runners for Effect constructors that are proven to suspend.",
    },
    type: "problem",
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
        const runner = effectExportName(context, bindings, node.callee);
        const effect = expressionArgument(node.arguments[0]);
        if (
          runner === undefined ||
          !SYNC_RUNNERS.has(runner) ||
          effect === undefined ||
          !isKnownSuspendingEffect(context, bindings, effect)
        ) {
          return;
        }
        context.report({
          message: `${runner} cannot complete an Effect that is known to suspend; use an asynchronous runner at this boundary.`,
          node,
        });
      },
    };
  },
});
