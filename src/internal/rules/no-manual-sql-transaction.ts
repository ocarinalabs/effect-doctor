import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";

import {
  bindingForReference,
  collectImportBindings,
  identifierHasBinding,
  namedMember,
  unwrapExpression,
  variableForReference,
} from "./ast.ts";

type SqlImportBinding = "module" | "service";

const SQL_IMPORTS: ReadonlyMap<string, SqlImportBinding> = new Map([
  ["effect/unstable/sql:named:SqlClient", "module"],
  ["effect/unstable/sql/SqlClient:namespace", "module"],
  ["effect/unstable/sql/SqlClient:named:SqlClient", "service"],
]);

const TRANSACTION_CONTROL =
  /^(?:BEGIN(?:\s+TRANSACTION)?|COMMIT|ROLLBACK(?:\s+TO)?|SAVEPOINT|RELEASE\s+SAVEPOINT)\b/iu;

const isSqlClientService = (
  context: Context,
  bindings: ReadonlyMap<number, SqlImportBinding>,
  expression: ESTree.Expression
): boolean => {
  const node = unwrapExpression(expression);
  if (node.type === "Identifier") {
    return bindingForReference(context, bindings, node) === "service";
  }
  const service = namedMember(node, "SqlClient");
  return (
    service !== undefined &&
    identifierHasBinding(context, bindings, service.object, "module")
  );
};

const yieldedExpression = (
  expression: ESTree.Expression | null
): ESTree.Expression | undefined => {
  if (expression === null) {
    return undefined;
  }
  const node = unwrapExpression(expression);
  return node.type === "YieldExpression" && node.argument !== null
    ? unwrapExpression(node.argument)
    : undefined;
};

const isBoundSqlClient = (
  context: Context,
  bindings: ReadonlySet<number>,
  tag: ESTree.Expression
): boolean => {
  const node = unwrapExpression(tag);
  if (node.type !== "Identifier") {
    return false;
  }
  const variable = variableForReference(context, node);
  return (
    variable?.defs.some((definition) =>
      bindings.has(definition.name.range[0])
    ) ?? false
  );
};

const transactionCommand = (
  quasi: ESTree.TemplateLiteral
): string | undefined => {
  const [head] = quasi.quasis;
  if (head === undefined) {
    return undefined;
  }
  const first = head.value.cooked ?? head.value.raw;
  const command = first.trimStart();
  return TRANSACTION_CONTROL.test(command) ? command : undefined;
};

export const noManualSqlTransaction = defineRule({
  meta: {
    docs: {
      description:
        "Use Effect SQL transaction ownership instead of sending transaction-control statements manually.",
    },
    type: "problem",
  },
  createOnce(context) {
    let imports: ReadonlyMap<number, SqlImportBinding> = new Map();
    const sqlClients = new Set<number>();
    return {
      before() {
        imports = collectImportBindings(context.sourceCode.ast, SQL_IMPORTS);
      },
      VariableDeclarator(node) {
        if (node.id.type !== "Identifier") {
          return;
        }
        const service = yieldedExpression(node.init);
        if (
          service !== undefined &&
          isSqlClientService(context, imports, service)
        ) {
          sqlClients.add(node.id.range[0]);
        }
      },
      TaggedTemplateExpression(node) {
        const command = transactionCommand(node.quasi);
        if (
          command === undefined ||
          !isBoundSqlClient(context, sqlClients, node.tag)
        ) {
          return;
        }
        context.report({
          message:
            "Run this work with SqlClient.withTransaction so Effect owns the connection, commit, rollback, and interruption lifecycle.",
          node,
        });
      },
    };
  },
});
