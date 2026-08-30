import type { Context, ESTree } from "@oxlint/plugins";

import {
  bindingForReference,
  collectImportBindings,
  delegatedYield,
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

export type SqlClientTracker = {
  readonly initialize: () => void;
  readonly record: (node: ESTree.VariableDeclarator) => void;
  readonly owns: (expression: ESTree.Expression) => boolean;
};

export const makeSqlClientTracker = (context: Context): SqlClientTracker => {
  let imports: ReadonlyMap<number, SqlImportBinding> = new Map();
  const sqlClients = new Set<number>();

  return {
    initialize() {
      imports = collectImportBindings(context.sourceCode.ast, SQL_IMPORTS);
    },
    owns(expression) {
      const node = unwrapExpression(expression);
      if (node.type !== "Identifier") {
        return false;
      }
      const variable = variableForReference(context, node);
      return (
        variable?.defs.some((definition) =>
          sqlClients.has(definition.name.range[0])
        ) ?? false
      );
    },
    record(node) {
      if (node.id.type !== "Identifier") {
        return;
      }
      const service = delegatedYield(node.init);
      if (
        service !== undefined &&
        isSqlClientService(context, imports, service)
      ) {
        sqlClients.add(node.id.range[0]);
      }
    },
  };
};
