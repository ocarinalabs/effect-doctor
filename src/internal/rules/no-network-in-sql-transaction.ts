import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";

import {
  collectImportBindings,
  containsNode,
  importedExportName,
  isFunctionBoundary,
  isUnshadowedGlobal,
  namedMember,
  unwrapExpression,
} from "./ast.ts";
import type { FunctionBoundary } from "./ast.ts";
import { effectGeneratorFunction } from "./effect-generator.ts";
import type { EffectGeneratorFunction } from "./effect-generator.ts";
import { EFFECT_IMPORT_BINDINGS } from "./effect-imports.ts";
import type { EffectImportBinding } from "./effect-imports.ts";
import { enclosingPromiseAdapter } from "./promise-adapter.ts";
import type { PromiseAdapterFunction } from "./promise-adapter.ts";
import { makeSqlClientTracker } from "./sql-client.ts";

const HTTP_OPERATIONS = new Set([
  "del",
  "execute",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
]);

type HttpImportBinding = "*" | string;

const HTTP_IMPORT_BINDINGS: ReadonlyMap<string, HttpImportBinding> = new Map([
  ["effect/unstable/http:named:HttpClient", "*"],
  ["effect/unstable/http/HttpClient:namespace", "*"],
  ...[...HTTP_OPERATIONS].map(
    (operation): readonly [string, HttpImportBinding] => [
      `effect/unstable/http/HttpClient:named:${operation}`,
      operation,
    ]
  ),
]);

const isHttpClientCall = (
  context: Context,
  bindings: ReadonlyMap<number, HttpImportBinding>,
  node: ESTree.CallExpression
): boolean => {
  if (node.callee.type === "Super") {
    return false;
  }
  const operation = importedExportName(context, bindings, node.callee);
  return operation !== undefined && HTTP_OPERATIONS.has(operation);
};

const isGlobalFetch = (
  context: Context,
  node: ESTree.CallExpression
): boolean => {
  const callee = unwrapExpression(node.callee);
  return (
    callee.type === "Identifier" && isUnshadowedGlobal(context, callee, "fetch")
  );
};

type TransactionContext = {
  readonly argument: ESTree.Expression;
  readonly functionBoundaries: readonly FunctionBoundary[];
};

const ownedTransactionArgument = (
  node: ESTree.CallExpression,
  ownsSqlClient: (expression: ESTree.Expression) => boolean
): ESTree.Expression | undefined => {
  if (node.callee.type === "Super") {
    return undefined;
  }
  const [argument] = node.arguments;
  if (argument === undefined || argument.type === "SpreadElement") {
    return undefined;
  }
  const transaction = namedMember(node.callee, "withTransaction");
  if (
    transaction === undefined ||
    transaction.object.type === "Super" ||
    !ownsSqlClient(transaction.object)
  ) {
    return undefined;
  }
  return argument;
};

const enclosingTransaction = (
  node: ESTree.CallExpression,
  ownsSqlClient: (expression: ESTree.Expression) => boolean
): TransactionContext | undefined => {
  const functionBoundaries: FunctionBoundary[] = [];
  let ancestor: ESTree.Node | null = node.parent;
  while (ancestor !== null) {
    if (isFunctionBoundary(ancestor)) {
      functionBoundaries.push(ancestor);
    }
    if (ancestor.type === "CallExpression") {
      const argument = ownedTransactionArgument(ancestor, ownsSqlClient);
      if (argument !== undefined && containsNode(argument, node)) {
        return { argument, functionBoundaries };
      }
    }
    ancestor = ancestor.parent;
  }
  return undefined;
};

const isAllowedBoundary = (
  boundary: FunctionBoundary,
  promiseAdapter: PromiseAdapterFunction | undefined,
  generatorFunction: EffectGeneratorFunction | undefined
): boolean => boundary === promiseAdapter || boundary === generatorFunction;

const insideOwnedTransaction = (
  context: Context,
  effectBindings: ReadonlyMap<number, EffectImportBinding>,
  node: ESTree.CallExpression,
  promiseAdapter: PromiseAdapterFunction | undefined,
  ownsSqlClient: (expression: ESTree.Expression) => boolean
): boolean => {
  const transaction = enclosingTransaction(node, ownsSqlClient);
  if (transaction === undefined) {
    return false;
  }
  const generatorFunction = effectGeneratorFunction(
    context,
    effectBindings,
    transaction.argument
  );
  return transaction.functionBoundaries.every((boundary) =>
    isAllowedBoundary(boundary, promiseAdapter, generatorFunction)
  );
};

export const noNetworkInSqlTransaction = defineRule({
  meta: {
    docs: {
      description:
        "Keep direct HTTP work outside Effect SQL transaction effects.",
    },
    type: "suggestion",
  },
  createOnce(context) {
    const sqlClients = makeSqlClientTracker(context);
    let effectBindings: ReadonlyMap<number, EffectImportBinding> = new Map();
    let httpBindings: ReadonlyMap<number, HttpImportBinding> = new Map();

    return {
      before() {
        sqlClients.initialize();
        effectBindings = collectImportBindings(
          context.sourceCode.ast,
          EFFECT_IMPORT_BINDINGS
        );
        httpBindings = collectImportBindings(
          context.sourceCode.ast,
          HTTP_IMPORT_BINDINGS
        );
      },
      VariableDeclarator(node) {
        sqlClients.record(node);
      },
      CallExpression(node) {
        const globalFetch = isGlobalFetch(context, node);
        if (!globalFetch && !isHttpClientCall(context, httpBindings, node)) {
          return;
        }
        const promiseAdapter = globalFetch
          ? enclosingPromiseAdapter(context, effectBindings, node)
          : undefined;
        if (globalFetch && promiseAdapter === undefined) {
          return;
        }
        if (
          !insideOwnedTransaction(
            context,
            effectBindings,
            node,
            promiseAdapter,
            sqlClients.owns
          )
        ) {
          return;
        }
        context.report({
          message:
            "Move this HTTP operation outside SqlClient.withTransaction so the database transaction is not held open across external I/O.",
          node,
        });
      },
    };
  },
});
