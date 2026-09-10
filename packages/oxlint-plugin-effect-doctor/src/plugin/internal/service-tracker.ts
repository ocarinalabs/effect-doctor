import type { Context, ESTree } from "@oxlint/plugins";

import {
  delegatedYield,
  unwrapExpression,
  variableForReference,
} from "./ast.ts";
import { collectModuleBindings, moduleExportName } from "./effect-module.ts";
import type { EffectModule, ModuleBindings } from "./effect-module.ts";

export type ServiceTracker = {
  readonly initialize: () => void;
  readonly owns: (expression: ESTree.Expression | ESTree.Super) => boolean;
  readonly record: (node: ESTree.VariableDeclarator) => void;
};

export const makeServiceTracker = (
  context: Context,
  module: EffectModule,
  serviceExport: string
): ServiceTracker => {
  let bindings: ModuleBindings = new Map();
  const instances = new Set<number>();

  return {
    initialize() {
      bindings = collectModuleBindings(context, module);
      instances.clear();
    },
    owns(expression) {
      if (expression.type === "Super") {
        return false;
      }
      const node = unwrapExpression(expression);
      if (node.type !== "Identifier") {
        return false;
      }
      const variable = variableForReference(context, node);
      return (
        variable?.defs.some((definition) =>
          instances.has(definition.name.range[0])
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
        moduleExportName(context, bindings, module, service) === serviceExport
      ) {
        instances.add(node.id.range[0]);
      }
    },
  };
};
