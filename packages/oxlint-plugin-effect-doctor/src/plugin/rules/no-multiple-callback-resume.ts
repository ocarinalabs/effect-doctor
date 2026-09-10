import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree, Variable } from "@oxlint/plugins";

import { collectImportBindings, unwrapExpression } from "../internal/ast.ts";
import {
  EFFECT_IMPORT_BINDINGS,
  effectExportName,
} from "../internal/effect-imports.ts";
import type { EffectImportBinding } from "../internal/effect-imports.ts";

type CallbackFunction = ESTree.ArrowFunctionExpression | ESTree.Function;

const callbackFunction = (
  argument: ESTree.Argument | undefined
): CallbackFunction | undefined => {
  if (argument === undefined || argument.type === "SpreadElement") {
    return undefined;
  }
  const node = unwrapExpression(argument);
  return node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionExpression"
    ? node
    : undefined;
};

const isEffectCallback = (
  context: Context,
  bindings: ReadonlyMap<number, EffectImportBinding>,
  node: ESTree.CallExpression
): boolean => effectExportName(context, bindings, node.callee) === "callback";

const continuationVariable = (
  context: Context,
  register: CallbackFunction
): Variable | undefined => {
  const [parameter] = register.params;
  if (parameter?.type !== "Identifier") {
    return undefined;
  }
  return context.sourceCode.scopeManager
    .getDeclaredVariables(register)
    .find((variable) =>
      variable.defs.some(
        (definition) =>
          definition.type === "Parameter" &&
          definition.name.range[0] === parameter.range[0]
      )
    );
};

const isFunctionBoundary = (node: ESTree.Node): boolean =>
  node.type === "ArrowFunctionExpression" ||
  node.type === "FunctionExpression" ||
  node.type === "FunctionDeclaration";

const belongsDirectlyToRegister = (
  node: ESTree.Node,
  register: CallbackFunction
): boolean => {
  let ancestor: ESTree.Node | null = node.parent;
  while (ancestor !== null && ancestor !== register) {
    if (isFunctionBoundary(ancestor)) {
      return false;
    }
    ancestor = ancestor.parent;
  }
  return ancestor === register;
};

type DirectResumeCall = {
  readonly block: ESTree.BlockStatement;
  readonly call: ESTree.CallExpression;
  readonly statement: ESTree.ExpressionStatement;
};

const directResumeCall = (
  variable: Variable,
  register: CallbackFunction
): readonly DirectResumeCall[] =>
  variable.references.flatMap((reference) => {
    const { identifier } = reference;
    const call = identifier.parent;
    if (
      call.type !== "CallExpression" ||
      call.callee !== identifier ||
      !belongsDirectlyToRegister(identifier, register)
    ) {
      return [];
    }
    const statement = call.parent;
    if (
      statement.type !== "ExpressionStatement" ||
      statement.expression !== call ||
      statement.parent.type !== "BlockStatement"
    ) {
      return [];
    }
    return [{ block: statement.parent, call, statement }];
  });

const terminatesBlockPath = (statement: ESTree.Statement): boolean =>
  statement.type === "BreakStatement" ||
  statement.type === "ContinueStatement" ||
  statement.type === "ReturnStatement" ||
  statement.type === "ThrowStatement";

type CallsByBlock = Map<
  ESTree.BlockStatement,
  Map<number, ESTree.CallExpression>
>;

const callsGroupedByBlock = (
  variable: Variable,
  register: CallbackFunction
): CallsByBlock => {
  const callsByBlock: CallsByBlock = new Map();
  for (const { block, call, statement } of directResumeCall(
    variable,
    register
  )) {
    const calls = callsByBlock.get(block);
    if (calls === undefined) {
      callsByBlock.set(block, new Map([[statement.range[0], call]]));
    } else {
      calls.set(statement.range[0], call);
    }
  }
  return callsByBlock;
};

const reportRepeat = (context: Context, call: ESTree.CallExpression): void => {
  context.report({
    message:
      "Call the Effect.callback continuation at most once along this path. Effect ignores later resumes.",
    node: call,
  });
};

const reportRepeatedCallsInBlock = (
  context: Context,
  block: ESTree.BlockStatement,
  calls: ReadonlyMap<number, ESTree.CallExpression>
): void => {
  let resumed = false;
  for (const statement of block.body) {
    if (terminatesBlockPath(statement)) {
      resumed = false;
      continue;
    }
    const call = calls.get(statement.range[0]);
    if (call === undefined) {
      continue;
    }
    if (resumed) {
      reportRepeat(context, call);
    }
    resumed = true;
  }
};

const reportRepeatedCalls = (
  context: Context,
  variable: Variable,
  register: CallbackFunction
): void => {
  for (const [block, calls] of callsGroupedByBlock(variable, register)) {
    reportRepeatedCallsInBlock(context, block, calls);
  }
};

export const noMultipleCallbackResume = defineRule({
  meta: {
    docs: {
      description:
        "Call an Effect.callback continuation at most once on a straight-line path.",
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
        if (!isEffectCallback(context, bindings, node)) {
          return;
        }
        const register = callbackFunction(node.arguments[0]);
        if (register === undefined) {
          return;
        }
        const continuation = continuationVariable(context, register);
        if (continuation === undefined) {
          return;
        }
        reportRepeatedCalls(context, continuation, register);
      },
    };
  },
});
