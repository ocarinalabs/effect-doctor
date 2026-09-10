import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";

import {
  collectImportBindings,
  containsNode,
  isFunctionBoundary,
  isUnshadowedGlobal,
  namedMember,
  unwrapExpression,
} from "../internal/ast.ts";
import type { FunctionBoundary } from "../internal/ast.ts";
import { effectGeneratorFunction } from "../internal/effect-generator.ts";
import type { EffectGeneratorFunction } from "../internal/effect-generator.ts";
import { EFFECT_IMPORT_BINDINGS } from "../internal/effect-imports.ts";
import type { EffectImportBinding } from "../internal/effect-imports.ts";
import {
  collectModuleBindings,
  defineEffectModule,
  moduleExportName,
} from "../internal/effect-module.ts";
import type { ModuleBindings } from "../internal/effect-module.ts";
import { enclosingPromiseAdapter } from "../internal/promise-adapter.ts";
import type { PromiseAdapterFunction } from "../internal/promise-adapter.ts";
import { makeServiceTracker } from "../internal/service-tracker.ts";
import type { ServiceTracker } from "../internal/service-tracker.ts";
import { makeSqlClientTracker } from "../internal/sql-client.ts";

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

const HTTP_CLIENT_SERVICE = "HttpClient";

const HTTP_CLIENT_MODULE = defineEffectModule(
  "effect/unstable/http",
  "HttpClient",
  [...HTTP_OPERATIONS, HTTP_CLIENT_SERVICE]
);

const isModuleHttpCall = (
  context: Context,
  bindings: ModuleBindings,
  node: ESTree.CallExpression
): boolean => {
  const operation = moduleExportName(
    context,
    bindings,
    HTTP_CLIENT_MODULE,
    node.callee
  );
  return operation !== undefined && HTTP_OPERATIONS.has(operation);
};

const isServiceHttpCall = (
  httpClients: ServiceTracker,
  node: ESTree.CallExpression
): boolean => {
  if (node.callee.type === "Super") {
    return false;
  }
  const callee = unwrapExpression(node.callee);
  return (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier" &&
    HTTP_OPERATIONS.has(callee.property.name) &&
    httpClients.owns(callee.object)
  );
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
  ownsSqlClient: (expression: ESTree.Expression | ESTree.Super) => boolean
): ESTree.Expression | undefined => {
  if (node.callee.type === "Super") {
    return undefined;
  }
  const [argument] = node.arguments;
  if (argument === undefined || argument.type === "SpreadElement") {
    return undefined;
  }
  const transaction = namedMember(node.callee, "withTransaction");
  if (transaction === undefined || !ownsSqlClient(transaction.object)) {
    return undefined;
  }
  return argument;
};

const enclosingTransaction = (
  node: ESTree.CallExpression,
  ownsSqlClient: (expression: ESTree.Expression | ESTree.Super) => boolean
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

const makeOwnedTransactionCheck =
  (
    context: Context,
    ownsSqlClient: (expression: ESTree.Expression | ESTree.Super) => boolean
  ) =>
  (
    node: ESTree.CallExpression,
    promiseAdapter: PromiseAdapterFunction | undefined,
    effectBindings: ReadonlyMap<number, EffectImportBinding>
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
    const httpClients = makeServiceTracker(
      context,
      HTTP_CLIENT_MODULE,
      HTTP_CLIENT_SERVICE
    );
    let effectBindings: ReadonlyMap<number, EffectImportBinding> = new Map();
    let httpBindings: ModuleBindings = new Map();
    const insideOwnedTransaction = makeOwnedTransactionCheck(
      context,
      sqlClients.owns
    );

    return {
      before() {
        sqlClients.initialize();
        httpClients.initialize();
        effectBindings = collectImportBindings(
          context.sourceCode.ast,
          EFFECT_IMPORT_BINDINGS
        );
        httpBindings = collectModuleBindings(context, HTTP_CLIENT_MODULE);
      },
      VariableDeclarator(node) {
        sqlClients.record(node);
        httpClients.record(node);
      },
      CallExpression(node) {
        const globalFetch = isGlobalFetch(context, node);
        if (
          !globalFetch &&
          !isModuleHttpCall(context, httpBindings, node) &&
          !isServiceHttpCall(httpClients, node)
        ) {
          return;
        }
        const promiseAdapter = globalFetch
          ? enclosingPromiseAdapter(context, effectBindings, node)
          : undefined;
        if (globalFetch && promiseAdapter === undefined) {
          return;
        }
        if (!insideOwnedTransaction(node, promiseAdapter, effectBindings)) {
          return;
        }
        context.report({
          message:
            "Move this HTTP operation outside SqlClient.withTransaction so the database transaction does not stay open across external I/O.",
          node,
        });
      },
    };
  },
});
