import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";

import {
  collectImportBindings,
  delegatedYield,
  importedExportName,
  unwrapExpression,
} from "./ast.ts";
import { effectGeneratorFunction } from "./effect-generator.ts";
import { EFFECT_IMPORT_BINDINGS, effectExportName } from "./effect-imports.ts";
import type { EffectImportBinding } from "./effect-imports.ts";

type ModuleImportBinding = "*" | string;

const LAYER_EFFECT_CONSTRUCTORS = new Set([
  "effect",
  "effectContext",
  "effectDiscard",
]);

const LAYER_IMPORT_BINDINGS: ReadonlyMap<string, ModuleImportBinding> = new Map(
  [
    ["effect:named:Layer", "*"],
    ["effect/Layer:namespace", "*"],
    ...[...LAYER_EFFECT_CONSTRUCTORS].map(
      (operation): readonly [string, ModuleImportBinding] => [
        `effect/Layer:named:${operation}`,
        operation,
      ]
    ),
  ]
);

const LONG_LIVED_STREAM_SOURCES = new Set(["forever", "never"]);
const STREAM_CONSUMERS = new Set(["runDrain", "runForEach"]);
const STREAM_OPERATIONS = new Set([
  ...LONG_LIVED_STREAM_SOURCES,
  ...STREAM_CONSUMERS,
]);

const STREAM_IMPORT_BINDINGS: ReadonlyMap<string, ModuleImportBinding> =
  new Map([
    ["effect:named:Stream", "*"],
    ["effect/Stream:namespace", "*"],
    ...[...STREAM_OPERATIONS].map(
      (operation): readonly [string, ModuleImportBinding] => [
        `effect/Stream:named:${operation}`,
        operation,
      ]
    ),
  ]);

const argumentAt = (
  node: ESTree.CallExpression,
  index: number
): ESTree.Expression | undefined => {
  const argument = node.arguments[index];
  return argument === undefined || argument.type === "SpreadElement"
    ? undefined
    : unwrapExpression(argument);
};

const layerEffectArgument = (
  context: Context,
  bindings: ReadonlyMap<number, ModuleImportBinding>,
  node: ESTree.CallExpression
): ESTree.Expression | undefined => {
  if (node.callee.type === "Super") {
    return undefined;
  }
  const operation = importedExportName(context, bindings, node.callee);
  if (operation === "effect") {
    return argumentAt(node, 1);
  }
  return operation === "effectContext" || operation === "effectDiscard"
    ? argumentAt(node, 0)
    : undefined;
};

const yieldsFromStatement = (
  statement: ESTree.Statement
): readonly ESTree.Expression[] => {
  if (statement.type === "ExpressionStatement") {
    const expression = delegatedYield(statement.expression);
    return expression === undefined ? [] : [expression];
  }
  if (statement.type === "ReturnStatement") {
    const expression = delegatedYield(statement.argument);
    return expression === undefined ? [] : [expression];
  }
  if (statement.type !== "VariableDeclaration") {
    return [];
  }
  return statement.declarations.flatMap((declaration) => {
    const expression = delegatedYield(declaration.init);
    return expression === undefined ? [] : [expression];
  });
};

const topLevelYields = (
  generatorFunction: ESTree.ArrowFunctionExpression | ESTree.Function
): readonly ESTree.Expression[] => {
  const { body } = generatorFunction;
  if (body === null || body.type !== "BlockStatement") {
    return [];
  }
  return body.body.flatMap(yieldsFromStatement);
};

const importedCallName = (
  context: Context,
  bindings: ReadonlyMap<number, ModuleImportBinding>,
  node: ESTree.CallExpression
): string | undefined =>
  node.callee.type === "Super"
    ? undefined
    : importedExportName(context, bindings, node.callee);

const streamSourceName = (
  context: Context,
  bindings: ReadonlyMap<number, ModuleImportBinding>,
  expression: ESTree.Expression
): string | undefined => {
  const node = unwrapExpression(expression);
  return node.type === "CallExpression"
    ? importedCallName(context, bindings, node)
    : importedExportName(context, bindings, node);
};

const unboundedStreamRun = (
  context: Context,
  bindings: ReadonlyMap<number, ModuleImportBinding>,
  expression: ESTree.Expression
): ESTree.CallExpression | undefined => {
  const node = unwrapExpression(expression);
  if (node.type !== "CallExpression") {
    return undefined;
  }
  const operation = importedCallName(context, bindings, node);
  if (operation === undefined || !STREAM_CONSUMERS.has(operation)) {
    return undefined;
  }
  const stream = argumentAt(node, 0);
  if (stream === undefined) {
    return undefined;
  }
  const source = streamSourceName(context, bindings, stream);
  return source !== undefined && LONG_LIVED_STREAM_SOURCES.has(source)
    ? node
    : undefined;
};

const knownLongLivedExpression = (
  context: Context,
  effectBindings: ReadonlyMap<number, EffectImportBinding>,
  streamBindings: ReadonlyMap<number, ModuleImportBinding>,
  expression: ESTree.Expression
): ESTree.Expression | undefined => {
  const node = unwrapExpression(expression);
  if (effectExportName(context, effectBindings, node) === "never") {
    return node;
  }
  if (
    node.type === "CallExpression" &&
    node.callee.type !== "Super" &&
    effectExportName(context, effectBindings, node.callee) === "forever"
  ) {
    return node;
  }
  const streamRun = unboundedStreamRun(context, streamBindings, node);
  if (streamRun !== undefined) {
    return streamRun;
  }
  const generatorFunction = effectGeneratorFunction(
    context,
    effectBindings,
    node
  );
  if (generatorFunction === undefined) {
    return undefined;
  }
  for (const yielded of topLevelYields(generatorFunction)) {
    const longLived = knownLongLivedExpression(
      context,
      effectBindings,
      streamBindings,
      yielded
    );
    if (longLived !== undefined) {
      return longLived;
    }
  }
  return undefined;
};

export const noLongLivedLayerAcquisition = defineRule({
  meta: {
    docs: {
      description:
        "Fork provably long-lived work into the Layer scope instead of blocking acquisition.",
    },
    type: "suggestion",
  },
  createOnce(context) {
    let effectBindings: ReadonlyMap<number, EffectImportBinding> = new Map();
    let layerBindings: ReadonlyMap<number, ModuleImportBinding> = new Map();
    let streamBindings: ReadonlyMap<number, ModuleImportBinding> = new Map();

    return {
      before() {
        effectBindings = collectImportBindings(
          context.sourceCode.ast,
          EFFECT_IMPORT_BINDINGS
        );
        layerBindings = collectImportBindings(
          context.sourceCode.ast,
          LAYER_IMPORT_BINDINGS
        );
        streamBindings = collectImportBindings(
          context.sourceCode.ast,
          STREAM_IMPORT_BINDINGS
        );
      },
      CallExpression(node) {
        const acquisition = layerEffectArgument(context, layerBindings, node);
        if (acquisition === undefined) {
          return;
        }
        const longLived = knownLongLivedExpression(
          context,
          effectBindings,
          streamBindings,
          acquisition
        );
        if (longLived === undefined) {
          return;
        }
        context.report({
          message:
            "Fork this long-lived Effect with Effect.forkScoped during Layer acquisition so the Layer can finish building and own the fiber lifetime.",
          node: longLived,
        });
      },
    };
  },
});
