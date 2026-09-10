import type { Context, ESTree, Variable } from "@oxlint/plugins";

export type FunctionBoundary = ESTree.ArrowFunctionExpression | ESTree.Function;

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

const moduleExportName = (node: ESTree.ModuleExportName): string | undefined =>
  node.type === "Identifier" ? node.name : node.value;

export const unwrapExpression = (
  initial: ESTree.Expression
): ESTree.Expression => {
  let node = initial;
  while (isTransparentExpression(node)) {
    node = node.expression;
  }
  return node;
};

export const containsNode = (
  container: ESTree.Node,
  node: ESTree.Node
): boolean =>
  container.range[0] <= node.range[0] && container.range[1] >= node.range[1];

export const isFunctionBoundary = (
  node: ESTree.Node
): node is FunctionBoundary =>
  node.type === "ArrowFunctionExpression" ||
  node.type === "FunctionExpression" ||
  node.type === "FunctionDeclaration";

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

type ResolvedReferences = ReadonlyMap<number, Variable | undefined>;

const resolvedReferencesByProgram = new WeakMap<
  ESTree.Program,
  ResolvedReferences
>();

const resolvedReferences = (context: Context): ResolvedReferences => {
  const program = context.sourceCode.ast;
  const cached = resolvedReferencesByProgram.get(program);
  if (cached !== undefined) {
    return cached;
  }
  const entries: (readonly [number, Variable | undefined])[] = [];
  for (const scope of context.sourceCode.scopeManager.scopes) {
    for (const reference of scope.references) {
      entries.push([
        reference.identifier.range[0],
        reference.resolved ?? undefined,
      ]);
    }
  }
  const index = new Map(entries);
  resolvedReferencesByProgram.set(program, index);
  return index;
};

export const variableForReference = (
  context: Context,
  identifier: ESTree.IdentifierReference
): Variable | undefined => resolvedReferences(context).get(identifier.range[0]);

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

export const staticPropertyName = (
  property: ESTree.ObjectProperty
): string | undefined => {
  if (property.key.type === "Identifier" && !property.computed) {
    return property.key.name;
  }
  return property.key.type === "Literal" &&
    typeof property.key.value === "string"
    ? property.key.value
    : undefined;
};

export const delegatedYield = (
  expression: ESTree.Expression | null
): ESTree.Expression | undefined => {
  if (expression === null) {
    return undefined;
  }
  const node = unwrapExpression(expression);
  return node.type === "YieldExpression" &&
    node.delegate &&
    node.argument !== null
    ? unwrapExpression(node.argument)
    : undefined;
};

export const isUnshadowedGlobal = (
  context: Context,
  identifier: ESTree.IdentifierReference,
  name: string
): boolean => {
  if (identifier.name !== name) {
    return false;
  }
  const variable = variableForReference(context, identifier);
  return variable === undefined || variable.defs.length === 0;
};
