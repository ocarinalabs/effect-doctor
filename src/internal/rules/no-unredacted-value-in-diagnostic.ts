import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";

import {
  bindingForReference,
  collectImportBindings,
  identifierHasBinding,
  isUnshadowedGlobal,
  namedMember,
  unwrapExpression,
} from "./ast.ts";
import { EFFECT_IMPORT_BINDINGS, effectExportName } from "./effect-imports.ts";
import type { EffectImportBinding } from "./effect-imports.ts";

type RedactedImportBinding = "namespace" | "value";

const REDACTED_IMPORT_BINDINGS: ReadonlyMap<string, RedactedImportBinding> =
  new Map([
    ["effect:named:Redacted", "namespace"],
    ["effect/Redacted:namespace", "namespace"],
    ["effect/Redacted:named:value", "value"],
  ]);

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
  bindings: ReadonlyMap<number, RedactedImportBinding>,
  call: ESTree.CallExpression
): boolean => {
  const callee = unwrapExpression(call.callee);
  if (callee.type === "Identifier") {
    return bindingForReference(context, bindings, callee) === "value";
  }
  const valueMember = namedMember(callee, "value");
  return (
    valueMember !== undefined &&
    identifierHasBinding(context, bindings, valueMember.object, "namespace")
  );
};

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
    let redactedBindings: ReadonlyMap<number, RedactedImportBinding> =
      new Map();
    let functionDepth = 0;
    const diagnosticDepths: number[] = [];
    const diagnosticCalls = new WeakSet<ESTree.CallExpression>();
    const diagnosticConstructors = new WeakSet<ESTree.NewExpression>();

    const enterFunction = () => {
      functionDepth += 1;
    };
    const exitFunction = () => {
      functionDepth -= 1;
    };
    const enterDiagnostic = () => {
      diagnosticDepths.push(functionDepth);
    };
    const exitDiagnostic = () => {
      diagnosticDepths.pop();
    };
    const isInsideCurrentDiagnostic = () =>
      diagnosticDepths.includes(functionDepth);

    return {
      before() {
        effectBindings = collectImportBindings(
          context.sourceCode.ast,
          EFFECT_IMPORT_BINDINGS
        );
        redactedBindings = collectImportBindings(
          context.sourceCode.ast,
          REDACTED_IMPORT_BINDINGS
        );
      },
      ArrowFunctionExpression: enterFunction,
      "ArrowFunctionExpression:exit": exitFunction,
      FunctionDeclaration: enterFunction,
      "FunctionDeclaration:exit": exitFunction,
      FunctionExpression: enterFunction,
      "FunctionExpression:exit": exitFunction,
      CallExpression(node) {
        if (
          isEffectDiagnosticCall(context, effectBindings, node) ||
          isConsoleLogCall(context, node)
        ) {
          diagnosticCalls.add(node);
          enterDiagnostic();
          return;
        }
        if (
          isInsideCurrentDiagnostic() &&
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
          exitDiagnostic();
        }
      },
      NewExpression(node) {
        if (isGlobalErrorConstructor(context, node)) {
          diagnosticConstructors.add(node);
          enterDiagnostic();
        }
      },
      "NewExpression:exit"(node) {
        if (diagnosticConstructors.has(node)) {
          exitDiagnostic();
        }
      },
    };
  },
});
