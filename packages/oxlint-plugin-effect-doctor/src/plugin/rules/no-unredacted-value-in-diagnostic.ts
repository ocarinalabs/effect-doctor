import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";

import {
  collectImportBindings,
  isUnshadowedGlobal,
  unwrapExpression,
} from "../internal/ast.ts";
import {
  EFFECT_IMPORT_BINDINGS,
  effectExportName,
} from "../internal/effect-imports.ts";
import type { EffectImportBinding } from "../internal/effect-imports.ts";
import {
  collectModuleBindings,
  defineEffectModule,
  moduleExportName,
} from "../internal/effect-module.ts";
import type { ModuleBindings } from "../internal/effect-module.ts";

const REDACTED_MODULE = defineEffectModule("effect", "Redacted", ["value"]);

const EFFECT_DIAGNOSTIC_FUNCTIONS: ReadonlySet<string> = new Set([
  "annotateCurrentSpan",
  "annotateLogs",
  "annotateLogsScoped",
  "annotateSpans",
  "log",
  "logDebug",
  "logError",
  "logFatal",
  "logInfo",
  "logTrace",
  "logWarning",
]);

const CONSOLE_LOG_FUNCTIONS: ReadonlySet<string> = new Set([
  "debug",
  "error",
  "info",
  "log",
  "trace",
  "warn",
]);

const isRedactedValueCall = (
  context: Context,
  bindings: ModuleBindings,
  call: ESTree.CallExpression
): boolean =>
  moduleExportName(context, bindings, REDACTED_MODULE, call.callee) === "value";

const isEffectDiagnosticCall = (
  context: Context,
  bindings: ReadonlyMap<number, EffectImportBinding>,
  call: ESTree.CallExpression
): boolean => {
  const exportName = effectExportName(context, bindings, call.callee);
  return (
    exportName !== undefined && EFFECT_DIAGNOSTIC_FUNCTIONS.has(exportName)
  );
};

const isConsoleLogCall = (
  context: Context,
  call: ESTree.CallExpression
): boolean => {
  const callee = unwrapExpression(call.callee);
  if (
    callee.type !== "MemberExpression" ||
    callee.computed ||
    callee.property.type !== "Identifier" ||
    !CONSOLE_LOG_FUNCTIONS.has(callee.property.name)
  ) {
    return false;
  }
  const owner = unwrapExpression(callee.object);
  return (
    owner.type === "Identifier" && isUnshadowedGlobal(context, owner, "console")
  );
};

const isGlobalErrorConstructor = (
  context: Context,
  expression: ESTree.NewExpression
): boolean => {
  const callee = unwrapExpression(expression.callee);
  return (
    callee.type === "Identifier" && isUnshadowedGlobal(context, callee, "Error")
  );
};

const MESSAGE =
  "Keep Redacted values wrapped inside logs, errors, and telemetry; reveal them only at a trusted non-diagnostic boundary.";

type DiagnosticScope = {
  readonly enter: () => void;
  readonly enterFunction: () => void;
  readonly exit: () => void;
  readonly exitFunction: () => void;
  readonly insideCurrent: () => boolean;
};

const makeDiagnosticScope = (): DiagnosticScope => {
  let functionDepth = 0;
  const diagnosticDepths: number[] = [];
  return {
    enter: () => {
      diagnosticDepths.push(functionDepth);
    },
    enterFunction: () => {
      functionDepth += 1;
    },
    exit: () => {
      diagnosticDepths.pop();
    },
    exitFunction: () => {
      functionDepth -= 1;
    },
    insideCurrent: () => diagnosticDepths.includes(functionDepth),
  };
};

export const noUnredactedValueInDiagnostic = defineRule({
  meta: {
    docs: {
      description:
        "Prevent Redacted.value from exposing secrets directly inside diagnostic and telemetry sinks.",
    },
    type: "problem",
  },
  createOnce(context) {
    let effectBindings: ReadonlyMap<number, EffectImportBinding> = new Map();
    let redactedBindings: ModuleBindings = new Map();
    const scope = makeDiagnosticScope();
    const diagnosticCalls = new WeakSet<ESTree.CallExpression>();
    const diagnosticConstructors = new WeakSet<ESTree.NewExpression>();

    return {
      before() {
        effectBindings = collectImportBindings(
          context.sourceCode.ast,
          EFFECT_IMPORT_BINDINGS
        );
        redactedBindings = collectModuleBindings(context, REDACTED_MODULE);
      },
      ArrowFunctionExpression: scope.enterFunction,
      "ArrowFunctionExpression:exit": scope.exitFunction,
      FunctionDeclaration: scope.enterFunction,
      "FunctionDeclaration:exit": scope.exitFunction,
      FunctionExpression: scope.enterFunction,
      "FunctionExpression:exit": scope.exitFunction,
      CallExpression(node) {
        if (
          isEffectDiagnosticCall(context, effectBindings, node) ||
          isConsoleLogCall(context, node)
        ) {
          diagnosticCalls.add(node);
          scope.enter();
          return;
        }
        if (
          scope.insideCurrent() &&
          isRedactedValueCall(context, redactedBindings, node)
        ) {
          context.report({
            message: MESSAGE,
            node,
          });
        }
      },
      "CallExpression:exit"(node) {
        if (diagnosticCalls.has(node)) {
          scope.exit();
        }
      },
      NewExpression(node) {
        if (isGlobalErrorConstructor(context, node)) {
          diagnosticConstructors.add(node);
          scope.enter();
        }
      },
      "NewExpression:exit"(node) {
        if (diagnosticConstructors.has(node)) {
          scope.exit();
        }
      },
    };
  },
});
