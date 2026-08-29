import { defineRule } from "@oxlint/plugins";
import type { Context, Definition, ESTree, Variable } from "@oxlint/plugins";

import {
  collectImportBindings,
  importedExportName,
  namedMember,
  unwrapExpression,
  variableForReference,
} from "./ast.ts";

type LayerImportBinding = "*" | string;

const COMPOSITION_OPERATIONS = new Set([
  "merge",
  "mergeAll",
  "provide",
  "provideMerge",
]);

const LAYER_OPERATIONS = new Set([...COMPOSITION_OPERATIONS, "fresh"]);

const LAYER_IMPORT_BINDINGS: ReadonlyMap<string, LayerImportBinding> = new Map([
  ["effect:named:Layer", "*"],
  ["effect/Layer:namespace", "*"],
  ...[...LAYER_OPERATIONS].map(
    (operation): readonly [string, LayerImportBinding] => [
      `effect/Layer:named:${operation}`,
      operation,
    ]
  ),
]);

const argumentExpressions = (
  node: ESTree.CallExpression
): readonly ESTree.Expression[] =>
  node.arguments.filter(
    (argument): argument is ESTree.Expression =>
      argument.type !== "SpreadElement"
  );

const directLayerOperation = (
  context: Context,
  bindings: ReadonlyMap<number, LayerImportBinding>,
  node: ESTree.CallExpression
): string | undefined =>
  node.callee.type === "Super"
    ? undefined
    : importedExportName(context, bindings, node.callee);

const directCompositionOperation = (
  context: Context,
  bindings: ReadonlyMap<number, LayerImportBinding>,
  node: ESTree.CallExpression
): string | undefined => {
  const operation = directLayerOperation(context, bindings, node);
  return operation !== undefined && COMPOSITION_OPERATIONS.has(operation)
    ? operation
    : undefined;
};

const curriedCompositionCall = (
  context: Context,
  bindings: ReadonlyMap<number, LayerImportBinding>,
  node: ESTree.CallExpression
): ESTree.CallExpression | undefined => {
  if (node.callee.type === "Super") {
    return undefined;
  }
  const callee = unwrapExpression(node.callee);
  return callee.type === "CallExpression" &&
    directCompositionOperation(context, bindings, callee) !== undefined
    ? callee
    : undefined;
};

const pipeSteps = (
  context: Context,
  bindings: ReadonlyMap<number, LayerImportBinding>,
  node: ESTree.CallExpression
): readonly ESTree.CallExpression[] => {
  if (node.callee.type === "Super") {
    return [];
  }
  const pipe = namedMember(node.callee, "pipe");
  if (pipe === undefined) {
    return [];
  }
  return argumentExpressions(node).flatMap((argument) => {
    const step = unwrapExpression(argument);
    return step.type === "CallExpression" &&
      directCompositionOperation(context, bindings, step) !== undefined
      ? [step]
      : [];
  });
};

const hasNonInitialWrite = (variable: Variable): boolean =>
  variable.references.some(
    (reference) => reference.isWrite() && !reference.init
  );

const isModuleOrFunctionBinding = (definition: Definition): boolean =>
  definition.type === "ImportBinding" || definition.type === "FunctionName";

const constIdentifierDeclaration = (
  definition: Definition
): ESTree.VariableDeclaration | undefined => {
  if (
    definition.type !== "Variable" ||
    definition.node.type !== "VariableDeclarator" ||
    definition.node.id.type !== "Identifier"
  ) {
    return undefined;
  }
  const { parent } = definition;
  return parent?.type === "VariableDeclaration" ? parent : undefined;
};

const isStableBinding = (definition: Definition): boolean =>
  isModuleOrFunctionBinding(definition) ||
  constIdentifierDeclaration(definition)?.kind === "const";

const hasStableDefinition = (variable: Variable): boolean => {
  if (variable.defs.length !== 1 || hasNonInitialWrite(variable)) {
    return false;
  }
  const [definition] = variable.defs;
  return definition !== undefined && isStableBinding(definition);
};

const factoryVariable = (
  context: Context,
  node: ESTree.CallExpression
): Variable | undefined => {
  if (node.arguments.length !== 0 || node.callee.type === "Super") {
    return undefined;
  }
  const callee = unwrapExpression(node.callee);
  if (callee.type !== "Identifier") {
    return undefined;
  }
  const variable = variableForReference(context, callee);
  return variable !== undefined && hasStableDefinition(variable)
    ? variable
    : undefined;
};

type GraphScan = {
  readonly context: Context;
  readonly imports: ReadonlyMap<number, LayerImportBinding>;
  readonly claimedComposers: Set<number>;
  readonly seenFactories: Set<Variable>;
  readonly reportedFactories: Set<Variable>;
};

const reportFactory = (
  scan: GraphScan,
  node: ESTree.CallExpression,
  variable: Variable
): void => {
  if (!scan.seenFactories.has(variable)) {
    scan.seenFactories.add(variable);
    return;
  }
  if (scan.reportedFactories.has(variable)) {
    return;
  }
  scan.reportedFactories.add(variable);
  scan.context.report({
    message:
      "Reuse one Layer value for this factory within the composition graph so Effect can memoize its identity. Use Layer.fresh only when a separate instance is intentional.",
    node,
  });
};

const scanArray = (scan: GraphScan, node: ESTree.ArrayExpression): void => {
  for (const element of node.elements) {
    if (element !== null && element.type !== "SpreadElement") {
      scanGraphExpression(scan, element);
    }
  }
};

const scanFresh = (scan: GraphScan, node: ESTree.CallExpression): void => {
  const arguments_ = argumentExpressions(node);
  if (arguments_.length !== 1) {
    return;
  }
  const [candidate] = arguments_;
  if (candidate === undefined) {
    return;
  }
  const argument = unwrapExpression(candidate);
  if (
    argument.type === "CallExpression" &&
    factoryVariable(scan.context, argument) !== undefined
  ) {
    return;
  }
  scanGraphExpression(scan, argument);
};

const scanPipe = (
  scan: GraphScan,
  node: ESTree.CallExpression,
  steps: readonly ESTree.CallExpression[]
): void => {
  scan.claimedComposers.add(node.range[0]);
  if (node.callee.type !== "Super") {
    const pipe = namedMember(node.callee, "pipe");
    if (pipe !== undefined && pipe.object.type !== "Super") {
      scanGraphExpression(scan, pipe.object);
    }
  }
  for (const step of steps) {
    scanGraphExpression(scan, step);
  }
};

const scanComposition = (
  scan: GraphScan,
  node: ESTree.CallExpression
): void => {
  scan.claimedComposers.add(node.range[0]);
  for (const argument of argumentExpressions(node)) {
    scanGraphExpression(scan, argument);
  }
};

const scanGraphCall = (scan: GraphScan, node: ESTree.CallExpression): void => {
  const pipe = pipeSteps(scan.context, scan.imports, node);
  if (pipe.length > 0) {
    scanPipe(scan, node, pipe);
    return;
  }

  const curried = curriedCompositionCall(scan.context, scan.imports, node);
  if (curried !== undefined) {
    scan.claimedComposers.add(node.range[0]);
    scanComposition(scan, curried);
    for (const argument of argumentExpressions(node)) {
      scanGraphExpression(scan, argument);
    }
    return;
  }

  const operation = directLayerOperation(scan.context, scan.imports, node);
  if (operation !== undefined && COMPOSITION_OPERATIONS.has(operation)) {
    scanComposition(scan, node);
    return;
  }
  if (operation === "fresh") {
    scanFresh(scan, node);
    return;
  }

  const variable = factoryVariable(scan.context, node);
  if (variable !== undefined) {
    reportFactory(scan, node, variable);
  }
};

const scanGraphExpression = (
  scan: GraphScan,
  expression: ESTree.Expression
): void => {
  const node = unwrapExpression(expression);
  if (node.type === "ArrayExpression") {
    scanArray(scan, node);
  } else if (node.type === "CallExpression") {
    scanGraphCall(scan, node);
  }
};

const isCompositionRoot = (
  context: Context,
  bindings: ReadonlyMap<number, LayerImportBinding>,
  node: ESTree.CallExpression
): boolean =>
  directCompositionOperation(context, bindings, node) !== undefined ||
  curriedCompositionCall(context, bindings, node) !== undefined ||
  pipeSteps(context, bindings, node).length > 0;

export const noDuplicateLayerFactoryCall = defineRule({
  meta: {
    docs: {
      description:
        "Reuse a zero-argument Layer factory result within one composition graph unless the duplicate is explicitly fresh.",
    },
    type: "suggestion",
  },
  createOnce(context) {
    const claimedComposers = new Set<number>();
    let imports: ReadonlyMap<number, LayerImportBinding> = new Map();

    return {
      before() {
        claimedComposers.clear();
        imports = collectImportBindings(
          context.sourceCode.ast,
          LAYER_IMPORT_BINDINGS
        );
      },
      CallExpression(node) {
        if (
          claimedComposers.has(node.range[0]) ||
          !isCompositionRoot(context, imports, node)
        ) {
          return;
        }
        scanGraphExpression(
          {
            claimedComposers,
            context,
            imports,
            reportedFactories: new Set(),
            seenFactories: new Set(),
          },
          node
        );
      },
    };
  },
});
