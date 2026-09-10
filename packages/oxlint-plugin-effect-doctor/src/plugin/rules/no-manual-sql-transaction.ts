import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { makeSqlClientTracker } from "../internal/sql-client.ts";

const TRANSACTION_CONTROL =
  /^(?:BEGIN(?:\s+TRANSACTION)?|COMMIT|ROLLBACK(?:\s+TO)?|SAVEPOINT|RELEASE\s+SAVEPOINT)\b/iu;

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
    const sqlClients = makeSqlClientTracker(context);
    return {
      before() {
        sqlClients.initialize();
      },
      VariableDeclarator(node) {
        sqlClients.record(node);
      },
      TaggedTemplateExpression(node) {
        const command = transactionCommand(node.quasi);
        if (command === undefined || !sqlClients.owns(node.tag)) {
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
