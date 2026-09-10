import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";

import { collectImportBindings, unwrapExpression } from "../internal/ast.ts";
import {
  EFFECT_IMPORT_BINDINGS,
  effectExportName,
} from "../internal/effect-imports.ts";
import type { EffectImportBinding } from "../internal/effect-imports.ts";

const SYNC_RUNNERS: ReadonlySet<string> = new Set(["runSync", "runSyncExit"]);
const SUSPENDING_CALLS: ReadonlySet<string> = new Set([
  "promise",
  "tryPromise",
]);
const POSITIVE_INTEGER_DURATION =
  /^(?:[1-9]\d*)\s+(?:nanos?|micros?|millis?|seconds?|minutes?|hours?|days?|weeks?)$/u;

const expressionArgument = (
  argument: ESTree.Argument | undefined
): ESTree.Expression | undefined =>
  argument === undefined || argument.type === "SpreadElement"
    ? undefined
    : unwrapExpression(argument);

const isPositiveSleepDuration = (
  argument: ESTree.Argument | undefined
): boolean => {
  const duration = expressionArgument(argument);
  if (duration?.type !== "Literal") {
    return false;
  }
  if (typeof duration.value === "number") {
    return Number.isFinite(duration.value) && duration.value >= 0.000001;
  }
  if (typeof duration.value === "bigint") {
    return duration.value > 0n;
  }
  return (
    typeof duration.value === "string" &&
    (duration.value === "Infinity" ||
      POSITIVE_INTEGER_DURATION.test(duration.value))
  );
};

const isKnownSuspendingEffect = (
  context: Context,
  bindings: ReadonlyMap<number, EffectImportBinding>,
  expression: ESTree.Expression
): boolean => {
  const node = unwrapExpression(expression);
  if (node.type === "CallExpression") {
    const name = effectExportName(context, bindings, node.callee);
    if (name === "sleep") {
      return isPositiveSleepDuration(node.arguments[0]);
    }
    return name !== undefined && SUSPENDING_CALLS.has(name);
  }
  const name = effectExportName(context, bindings, node);
  return name === "never";
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
          message: `${runner} cannot successfully evaluate an Effect that is known to suspend; use an asynchronous runner at this boundary.`,
          node,
        });
      },
    };
  },
});
