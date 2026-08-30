import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";

import {
  bindingForReference,
  collectImportBindings,
  containsNode,
  isFunctionBoundary,
  namedMember,
  unwrapExpression,
} from "./ast.ts";

type EffectBinding =
  | "effect-package"
  | "effect-module"
  | "fn"
  | "fn-untraced"
  | "fn-untraced-eager"
  | "gen";

const IMPORT_BINDINGS: ReadonlyMap<string, EffectBinding> = new Map([
  ["effect:namespace", "effect-package"],
  ["effect:named:Effect", "effect-module"],
  ["effect/Effect:namespace", "effect-module"],
  ["effect/Effect:named:fn", "fn"],
  ["effect/Effect:named:fnUntraced", "fn-untraced"],
  ["effect/Effect:named:fnUntracedEager", "fn-untraced-eager"],
  ["effect/Effect:named:gen", "gen"],
]);

const DIRECT_EXPORTS: ReadonlyMap<EffectBinding, string> = new Map([
  ["fn", "fn"],
  ["fn-untraced", "fnUntraced"],
  ["fn-untraced-eager", "fnUntracedEager"],
  ["gen", "gen"],
]);

const TEST_FILE_PATTERN = /\.(?:spec|test)\.[cm]?[jt]sx?$/u;

type GeneratorFunction = ESTree.Function;

const directEffectExport = (
  context: Context,
  bindings: ReadonlyMap<number, EffectBinding>,
  node: ESTree.IdentifierReference
): string | undefined => {
  const binding = bindingForReference(context, bindings, node);
  return binding === undefined ? undefined : DIRECT_EXPORTS.get(binding);
};

const effectModuleExport = (
  context: Context,
  bindings: ReadonlyMap<number, EffectBinding>,
  member: ESTree.MemberExpression
): string | undefined => {
  const owner = unwrapExpression(member.object);
  return owner.type === "Identifier" &&
    bindingForReference(context, bindings, owner) === "effect-module" &&
    member.property.type === "Identifier"
    ? member.property.name
    : undefined;
};

const effectPackageExport = (
  context: Context,
  bindings: ReadonlyMap<number, EffectBinding>,
  member: ESTree.MemberExpression
): string | undefined => {
  const effectMember = namedMember(member.object, "Effect");
  if (effectMember === undefined || member.property.type !== "Identifier") {
    return undefined;
  }
  const packageOwner = unwrapExpression(effectMember.object);
  return packageOwner.type === "Identifier" &&
    bindingForReference(context, bindings, packageOwner) === "effect-package"
    ? member.property.name
    : undefined;
};

const importedEffectMember = (
  context: Context,
  bindings: ReadonlyMap<number, EffectBinding>,
  expression: ESTree.Expression
): string | undefined => {
  const node = unwrapExpression(expression);
  if (node.type === "Identifier") {
    return directEffectExport(context, bindings, node);
  }
  if (
    node.type !== "MemberExpression" ||
    node.computed ||
    node.property.type !== "Identifier"
  ) {
    return undefined;
  }
  return (
    effectModuleExport(context, bindings, node) ??
    effectPackageExport(context, bindings, node)
  );
};

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
  bindings: ReadonlyMap<number, EffectBinding>,
  node: ESTree.CallExpression
): GeneratorFunction | undefined => {
  if (node.callee.type === "Super") {
    return undefined;
  }
  const constructor = importedEffectMember(context, bindings, node.callee);
  return constructor === "gen" ||
    constructor === "fn" ||
    constructor === "fnUntraced" ||
    constructor === "fnUntracedEager"
    ? inlineGenerator(node.arguments)
    : undefined;
};

const namedFnGenerator = (
  context: Context,
  bindings: ReadonlyMap<number, EffectBinding>,
  node: ESTree.CallExpression
): GeneratorFunction | undefined => {
  if (node.callee.type === "Super") {
    return undefined;
  }
  const factory = unwrapExpression(node.callee);
  if (
    factory.type !== "CallExpression" ||
    factory.callee.type === "Super" ||
    importedEffectMember(context, bindings, factory.callee) !== "fn"
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
    let bindings: ReadonlyMap<number, EffectBinding> = new Map();
    let skipFile = false;
    const effectGenerators = new Set<number>();
    return {
      before() {
        effectGenerators.clear();
        skipFile = TEST_FILE_PATTERN.test(context.filename);
        bindings = collectImportBindings(
          context.sourceCode.ast,
          IMPORT_BINDINGS
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
