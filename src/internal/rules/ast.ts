import type { Context, ESTree, Variable } from "@oxlint/plugins";

type TransparentExpression = Extract<
  ESTree.Expression,
  { readonly expression: ESTree.Expression }
>;

type ImportDeclaration = Extract<
  ESTree.Program["body"][number],
  { readonly type: "ImportDeclaration" }
>;

const TRANSPARENT_EXPRESSION_TYPES: ReadonlySet<string> = new Set([
  "ChainExpression",
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
]);

const isTransparentExpression = (
  node: ESTree.Expression
): node is TransparentExpression => TRANSPARENT_EXPRESSION_TYPES.has(node.type);

const isImportDeclaration = (
  statement: ESTree.Program["body"][number]
): statement is ImportDeclaration => statement.type === "ImportDeclaration";

export const moduleExportName = (
  node: ESTree.ModuleExportName
): string | undefined => (node.type === "Identifier" ? node.name : node.value);

export const unwrapExpression = (
  initial: ESTree.Expression
): ESTree.Expression => {
  let node = initial;
  while (isTransparentExpression(node)) {
    node = node.expression;
  }
  return node;
};

export const staticString = (
  node: ESTree.Argument | undefined
): string | undefined => {
  if (node === undefined || node.type === "SpreadElement") {
    return undefined;
  }
  const expression = unwrapExpression(node);
  if (expression.type === "Literal" && typeof expression.value === "string") {
    return expression.value;
  }
  if (
    expression.type === "TemplateLiteral" &&
    expression.expressions.length === 0 &&
    expression.quasis.length === 1
  ) {
    return expression.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
};

export const variableForReference = (
  context: Context,
  identifier: ESTree.IdentifierReference
): Variable | undefined => {
  const reference = context.sourceCode.scopeManager.scopes
    .flatMap((scope) => scope.references)
    .find((candidate) => candidate.identifier.range[0] === identifier.range[0]);
  return reference?.resolved ?? undefined;
};

export const bindingForReference = <Binding>(
  context: Context,
  bindings: ReadonlyMap<number, Binding>,
  identifier: ESTree.IdentifierReference
): Binding | undefined => {
  const variable = variableForReference(context, identifier);
  const definition = variable?.defs.find(
    (candidate) => candidate.type === "ImportBinding"
  );
  return definition === undefined
    ? undefined
    : bindings.get(definition.name.range[0]);
};

const importBindingKey = (
  source: string,
  specifier: ImportDeclaration["specifiers"][number]
): string => {
  if (specifier.type === "ImportNamespaceSpecifier") {
    return `${source}:namespace`;
  }
  if (specifier.type === "ImportSpecifier") {
    return `${source}:named:${moduleExportName(specifier.imported)}`;
  }
  return `${source}:default`;
};

export const collectImportBindings = <Binding>(
  program: ESTree.Program,
  definitions: ReadonlyMap<string, Binding>
): ReadonlyMap<number, Binding> => {
  const entries: (readonly [number, Binding])[] = [];
  for (const statement of program.body.filter(isImportDeclaration)) {
    for (const specifier of statement.specifiers) {
      const binding = definitions.get(
        importBindingKey(statement.source.value, specifier)
      );
      if (binding !== undefined) {
        entries.push([specifier.local.range[0], binding]);
      }
    }
  }
  return new Map(entries);
};

export const identifierHasBinding = <Binding>(
  context: Context,
  bindings: ReadonlyMap<number, Binding>,
  expression: ESTree.Expression,
  expected: Binding
): boolean => {
  const node = unwrapExpression(expression);
  return (
    node.type === "Identifier" &&
    bindingForReference(context, bindings, node) === expected
  );
};

export const namedMember = (
  expression: ESTree.Expression,
  name: string
): ESTree.MemberExpression | undefined => {
  const node = unwrapExpression(expression);
  if (
    node.type !== "MemberExpression" ||
    node.computed ||
    node.property.name !== name
  ) {
    return undefined;
  }
  return node;
};

export const isUnshadowedGlobal = (
  context: Context,
  identifier: ESTree.IdentifierReference,
  name: string
): boolean =>
  identifier.name === name &&
  variableForReference(context, identifier) === undefined;
