import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";

import {
  collectImportBindings,
  containsNode,
  isFunctionBoundary,
  unwrapExpression,
} from "../internal/ast.ts";
import {
  EFFECT_IMPORT_BINDINGS,
  effectExportName,
} from "../internal/effect-imports.ts";
import type { EffectImportBinding } from "../internal/effect-imports.ts";

const GENERATOR_CONSTRUCTORS: ReadonlySet<string> = new Set([
  "fn",
  "fnUntraced",
  "fnUntracedEager",
  "gen",
]);

const TEST_FILE_PATTERN = /\.(?:spec|test)\.[cm]?[jt]sx?$/u;

type GeneratorFunction = ESTree.Function;

const inlineGenerator = (
  arguments_: readonly ESTree.Argument[]
): GeneratorFunction | undefined => {
  for (const argument of arguments_) {
    if (argument.type === "SpreadElement") {
      continue;
    }
    const expression = unwrapExpression(argument);
    if (expression.type === "FunctionExpression" && expression.generator) {
      return expression;
    }
  }
  return undefined;
};

const directGenerator = (
  context: Context,
  bindings: ReadonlyMap<number, EffectImportBinding>,
  node: ESTree.CallExpression
): GeneratorFunction | undefined => {
  const constructor = effectExportName(context, bindings, node.callee);
  return constructor !== undefined && GENERATOR_CONSTRUCTORS.has(constructor)
    ? inlineGenerator(node.arguments)
    : undefined;
};

const namedFnGenerator = (
  context: Context,
  bindings: ReadonlyMap<number, EffectImportBinding>,
  node: ESTree.CallExpression
): GeneratorFunction | undefined => {
  if (node.callee.type === "Super") {
    return undefined;
  }
  const factory = unwrapExpression(node.callee);
  if (
    factory.type !== "CallExpression" ||
    effectExportName(context, bindings, factory.callee) !== "fn"
  ) {
    return undefined;
  }
  return inlineGenerator(node.arguments);
};

const caughtBeforeBoundary = (
  node: ESTree.ThrowStatement,
  boundary: ESTree.Node
): boolean => {
  let ancestor: ESTree.Node | null = node.parent;
  while (ancestor !== null && ancestor !== boundary) {
    if (
      ancestor.type === "TryStatement" &&
      ancestor.handler !== null &&
      containsNode(ancestor.block, node)
    ) {
      return true;
    }
    ancestor = ancestor.parent;
  }
  return false;
};

const owningFunction = (
  node: ESTree.ThrowStatement
): ESTree.ArrowFunctionExpression | ESTree.Function | undefined => {
  let ancestor: ESTree.Node | null = node.parent;
  while (ancestor !== null) {
    if (isFunctionBoundary(ancestor)) {
      return ancestor;
    }
    ancestor = ancestor.parent;
  }
  return undefined;
};

export const noThrowInEffectGenerator = defineRule({
  meta: {
    docs: {
      description:
        "Keep escaping exceptions out of confirmed Effect generator bodies.",
    },
    type: "problem",
  },
  createOnce(context) {
    let bindings: ReadonlyMap<number, EffectImportBinding> = new Map();
    let skipFile = false;
    const effectGenerators = new Set<number>();
    return {
      before() {
        effectGenerators.clear();
        skipFile = TEST_FILE_PATTERN.test(context.filename);
        bindings = collectImportBindings(
          context.sourceCode.ast,
          EFFECT_IMPORT_BINDINGS
        );
      },
      CallExpression(node) {
        if (skipFile) {
          return;
        }
        const generator =
          directGenerator(context, bindings, node) ??
          namedFnGenerator(context, bindings, node);
        if (generator !== undefined) {
          effectGenerators.add(generator.range[0]);
        }
      },
      ThrowStatement(node) {
        if (skipFile) {
          return;
        }
        const owner = owningFunction(node);
        if (
          owner === undefined ||
          !effectGenerators.has(owner.range[0]) ||
          caughtBeforeBoundary(node, owner)
        ) {
          return;
        }
        context.report({
          message:
            "A throw that escapes an Effect generator becomes an untyped defect; yield a typed error or use Effect.die to make an intentional defect explicit.",
          node,
        });
      },
    };
  },
});
