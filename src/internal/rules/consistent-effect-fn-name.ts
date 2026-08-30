import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";

import {
  bindingForReference,
  collectImportBindings,
  identifierHasBinding,
  namedMember,
  staticPropertyName,
  staticString,
  unwrapExpression,
} from "./ast.ts";

type ImportBinding = "effect-fn" | "effect-module" | "effect-package";

const IMPORT_BINDINGS: ReadonlyMap<string, ImportBinding> = new Map([
  ["effect:namespace", "effect-package"],
  ["effect:named:Effect", "effect-module"],
  ["effect/Effect:namespace", "effect-module"],
  ["effect/Effect:named:fn", "effect-fn"],
]);

type TransparentExpression = Extract<
  ESTree.Expression,
  { readonly expression: ESTree.Expression }
>;

const isTransparentExpression = (
  node: ESTree.Node
): node is TransparentExpression =>
  node.type === "ChainExpression" ||
  node.type === "ParenthesizedExpression" ||
  node.type === "TSAsExpression" ||
  node.type === "TSNonNullExpression" ||
  node.type === "TSSatisfiesExpression" ||
  node.type === "TSTypeAssertion";

const sameNode = (left: ESTree.Node, right: ESTree.Node): boolean =>
  left.range[0] === right.range[0] && left.range[1] === right.range[1];

const outermostTransparentExpression = (
  expression: ESTree.Expression
): ESTree.Expression => {
  let current = expression;
  while (
    isTransparentExpression(current.parent) &&
    sameNode(current.parent.expression, current)
  ) {
    current = current.parent;
  }
  return current;
};

const isObjectProperty = (node: ESTree.Node): node is ESTree.ObjectProperty =>
  node.type === "Property" && node.parent.type === "ObjectExpression";

const assignmentTargetName = (
  target: ESTree.AssignmentTarget
): string | undefined => {
  if (target.type === "Identifier") {
    return target.name;
  }
  if (
    target.type === "MemberExpression" &&
    !target.computed &&
    target.property.type === "Identifier"
  ) {
    return target.property.name;
  }
  return undefined;
};

const variableDeclaratorName = (
  parent: ESTree.Node,
  assigned: ESTree.Expression
): string | undefined => {
  if (
    parent.type !== "VariableDeclarator" ||
    parent.init === null ||
    !sameNode(parent.init, assigned) ||
    parent.id.type !== "Identifier"
  ) {
    return undefined;
  }
  return parent.id.name;
};

const objectPropertyName = (
  parent: ESTree.Node,
  assigned: ESTree.Expression
): string | undefined => {
  if (
    !isObjectProperty(parent) ||
    parent.kind !== "init" ||
    parent.method ||
    !sameNode(parent.value, assigned)
  ) {
    return undefined;
  }
  return staticPropertyName(parent);
};

const assignmentExpressionName = (
  parent: ESTree.Node,
  assigned: ESTree.Expression
): string | undefined => {
  if (
    parent.type !== "AssignmentExpression" ||
    parent.operator !== "=" ||
    !sameNode(parent.right, assigned)
  ) {
    return undefined;
  }
  return assignmentTargetName(parent.left);
};

const directlyAssignedName = (
  expression: ESTree.Expression
): string | undefined => {
  const assigned = outermostTransparentExpression(expression);
  const { parent } = assigned;
  return (
    variableDeclaratorName(parent, assigned) ??
    objectPropertyName(parent, assigned) ??
    assignmentExpressionName(parent, assigned)
  );
};

const isEffectFn = (
  context: Context,
  bindings: ReadonlyMap<number, ImportBinding>,
  expression: ESTree.Expression
): boolean => {
  const callee = unwrapExpression(expression);
  if (callee.type === "Identifier") {
    return bindingForReference(context, bindings, callee) === "effect-fn";
  }
  const fnMember = namedMember(callee, "fn");
  if (fnMember === undefined) {
    return false;
  }
  if (
    identifierHasBinding(context, bindings, fnMember.object, "effect-module")
  ) {
    return true;
  }
  const effectMember = namedMember(fnMember.object, "Effect");
  return (
    effectMember !== undefined &&
    identifierHasBinding(
      context,
      bindings,
      effectMember.object,
      "effect-package"
    )
  );
};

const inlineFunctionArgument = (
  argument: ESTree.Argument | undefined
): boolean => {
  if (argument === undefined || argument.type === "SpreadElement") {
    return false;
  }
  const expression = unwrapExpression(argument);
  return (
    expression.type === "ArrowFunctionExpression" ||
    expression.type === "FunctionExpression"
  );
};

const isPlainIdentifier = (value: string): boolean =>
  /^[A-Za-z$][A-Za-z0-9$]*$/u.test(value);

const spanNameMatches = (spanName: string, assignedName: string): boolean =>
  !isPlainIdentifier(spanName) ||
  !isPlainIdentifier(assignedName) ||
  spanName === assignedName;

export const consistentEffectFnName = defineRule({
  meta: {
    docs: {
      description:
        "Keep unqualified Effect.fn span names consistent with their assigned function names.",
    },
    type: "suggestion",
  },
  createOnce(context) {
    let bindings: ReadonlyMap<number, ImportBinding> = new Map();
    return {
      before() {
        bindings = collectImportBindings(
          context.sourceCode.ast,
          IMPORT_BINDINGS
        );
      },
      CallExpression(node) {
        if (!inlineFunctionArgument(node.arguments[0])) {
          return;
        }
        const factory = unwrapExpression(node.callee);
        if (
          factory.type !== "CallExpression" ||
          factory.callee.type === "Super" ||
          !isEffectFn(context, bindings, factory.callee)
        ) {
          return;
        }
        const spanName = staticString(factory.arguments[0]);
        const assignedName = directlyAssignedName(node);
        if (
          spanName === undefined ||
          assignedName === undefined ||
          spanNameMatches(spanName, assignedName)
        ) {
          return;
        }
        context.report({
          message: `Effect.fn span name ${JSON.stringify(spanName)} does not match assigned function ${JSON.stringify(assignedName)}; use ${JSON.stringify(assignedName)} or an explicitly qualified operation name.`,
          node: factory,
        });
      },
    };
  },
});
