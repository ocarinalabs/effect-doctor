import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree, Variable } from "@oxlint/plugins";

import {
  collectImportBindings,
  containsNode,
  importedExportName,
  isFunctionBoundary,
  variableForReference,
} from "./ast.ts";
import type { FunctionBoundary } from "./ast.ts";

const ADAPTER_NAMES = [
  "decodeEffect",
  "decodeExit",
  "decodeOption",
  "decodePromise",
  "decodeResult",
  "decodeSync",
  "decodeUnknownEffect",
  "decodeUnknownExit",
  "decodeUnknownOption",
  "decodeUnknownPromise",
  "decodeUnknownResult",
  "decodeUnknownSync",
  "encodeEffect",
  "encodeExit",
  "encodeOption",
  "encodePromise",
  "encodeResult",
  "encodeSync",
  "encodeUnknownEffect",
  "encodeUnknownExit",
  "encodeUnknownOption",
  "encodeUnknownPromise",
  "encodeUnknownResult",
  "encodeUnknownSync",
  "is",
] as const;

const ADAPTER_NAME_SET: ReadonlySet<string> = new Set(ADAPTER_NAMES);

const directAdapterBindings = ADAPTER_NAMES.flatMap((name) => [
  [`effect/Schema:named:${name}`, name] as const,
  [`effect/SchemaParser:named:${name}`, name] as const,
]);

const ADAPTER_IMPORT_BINDINGS: ReadonlyMap<string, string> = new Map([
  ["effect:named:Schema", "*"],
  ["effect:named:SchemaParser", "*"],
  ["effect/Schema:namespace", "*"],
  ["effect/SchemaParser:namespace", "*"],
  ...directAdapterBindings,
]);

const SCHEMA_IMPORT_BINDINGS: ReadonlyMap<string, string> = new Map([
  ["effect:named:Schema", "*"],
  ["effect/Schema:namespace", "*"],
]);

const BUILTIN_SCHEMA_EXPORTS: ReadonlySet<string> = new Set([
  "Any",
  "BigDecimal",
  "BigDecimalFromString",
  "BigInt",
  "BigIntFromString",
  "Boolean",
  "BooleanFromBit",
  "Char",
  "Date",
  "DateFromMillis",
  "DateFromString",
  "DateTimeUtc",
  "DateTimeUtcFromDate",
  "DateTimeUtcFromMillis",
  "DateTimeUtcFromString",
  "DateTimeZoned",
  "DateTimeZonedFromString",
  "Duration",
  "DurationFromMillis",
  "DurationFromNanos",
  "DurationFromString",
  "File",
  "Finite",
  "FiniteFromString",
  "FormData",
  "Int",
  "Json",
  "JsonObject",
  "MutableJson",
  "Natural",
  "Never",
  "NonEmptyString",
  "Null",
  "Number",
  "NumberFromString",
  "ObjectKeyword",
  "PropertyKey",
  "RegExp",
  "StandardSchemaV1FailureResult",
  "String",
  "StringFromBase64",
  "StringFromBase64Url",
  "StringFromHex",
  "StringFromUriComponent",
  "Symbol",
  "TimeZone",
  "TimeZoneFromString",
  "TimeZoneNamed",
  "TimeZoneNamedFromString",
  "TimeZoneOffset",
  "Trim",
  "Trimmed",
  "Uint8Array",
  "Uint8ArrayFromBase64",
  "Uint8ArrayFromBase64Url",
  "Uint8ArrayFromHex",
  "Undefined",
  "Unknown",
  "UnknownFromJsonString",
  "URL",
  "URLFromString",
  "URLSearchParams",
  "Void",
]);

type TransparentExpression = Extract<
  ESTree.Expression,
  { readonly expression: ESTree.Expression }
>;

type AdapterMatch = {
  readonly factory: ESTree.CallExpression;
  readonly name: string;
  readonly schema: ESTree.Expression;
};

type ClosedSchemaContext = {
  readonly boundary: FunctionBoundary;
  readonly context: Context;
  readonly schemaBindings: ReadonlyMap<number, string>;
  readonly seen: ReadonlySet<Variable>;
};

type VariableDefinition = Variable["defs"][number];

type LiteralValue = Extract<
  ESTree.Expression,
  { readonly type: "Literal" }
>["value"];

type ConstructionProof = (
  state: ClosedSchemaContext,
  node: ESTree.CallExpression
) => boolean;

const LITERAL_VALUE_TYPES: ReadonlySet<string> = new Set([
  "bigint",
  "boolean",
  "number",
  "string",
]);

const SIGNED_LITERAL_OPERATORS: ReadonlySet<string> = new Set(["+", "-"]);

const isContractWrapper = (
  node: ESTree.Expression
): node is TransparentExpression =>
  node.type === "ParenthesizedExpression" ||
  node.type === "TSAsExpression" ||
  node.type === "TSNonNullExpression" ||
  node.type === "TSSatisfiesExpression" ||
  node.type === "TSTypeAssertion";

const unwrapContractExpression = (
  initial: ESTree.Expression
): ESTree.Expression => {
  let node = initial;
  while (isContractWrapper(node)) {
    node = node.expression;
  }
  return node;
};

const safeImportedExportName = (
  context: Context,
  bindings: ReadonlyMap<number, string>,
  expression: ESTree.Expression
): string | undefined => {
  const node = unwrapContractExpression(expression);
  if (node.type === "ChainExpression") {
    return undefined;
  }
  if (node.type === "MemberExpression" && (node.computed || node.optional)) {
    return undefined;
  }
  return importedExportName(context, bindings, node);
};

const enclosingFunction = (node: ESTree.Node): FunctionBoundary | undefined => {
  let ancestor: ESTree.Node | null = node.parent;
  while (ancestor !== null) {
    if (isFunctionBoundary(ancestor)) {
      return ancestor;
    }
    ancestor = ancestor.parent;
  }
  return undefined;
};

const exactlyOneExpression = (
  values: readonly ESTree.Argument[]
): ESTree.Expression | undefined => {
  if (values.length !== 1) {
    return undefined;
  }
  const [value] = values;
  return value === undefined || value.type === "SpreadElement"
    ? undefined
    : value;
};

const expressionAt = (
  values: readonly ESTree.Argument[],
  index: number
): ESTree.Expression | undefined => {
  const value = values[index];
  return value === undefined || value.type === "SpreadElement"
    ? undefined
    : value;
};

const matchAdapter = (
  context: Context,
  bindings: ReadonlyMap<number, string>,
  application: ESTree.CallExpression
): AdapterMatch | undefined => {
  if (application.optional) {
    return undefined;
  }
  const factory = unwrapContractExpression(application.callee);
  if (factory.type !== "CallExpression" || factory.optional) {
    return undefined;
  }
  const schema = exactlyOneExpression(factory.arguments);
  if (schema === undefined) {
    return undefined;
  }
  const name = safeImportedExportName(context, bindings, factory.callee);
  return name !== undefined && ADAPTER_NAME_SET.has(name)
    ? { factory, name, schema }
    : undefined;
};

const isSupportedLiteralValue = (value: LiteralValue): boolean =>
  value === null || LITERAL_VALUE_TYPES.has(typeof value);

const isSignedNumberLiteral = (node: ESTree.Expression): boolean => {
  if (
    node.type !== "UnaryExpression" ||
    !SIGNED_LITERAL_OPERATORS.has(node.operator)
  ) {
    return false;
  }
  const argument = unwrapContractExpression(node.argument);
  return argument.type === "Literal" && typeof argument.value === "number";
};

const isLiteralValue = (expression: ESTree.Expression): boolean => {
  const node = unwrapContractExpression(expression);
  if (node.type === "Literal") {
    return isSupportedLiteralValue(node.value);
  }
  return node.type === "TemplateLiteral"
    ? node.expressions.length === 0
    : isSignedNumberLiteral(node);
};

const isStaticStructProperty = (property: ESTree.ObjectProperty): boolean => {
  if (property.computed || property.kind !== "init" || property.method) {
    return false;
  }
  return (
    property.key.type === "Identifier" ||
    (property.key.type === "Literal" &&
      (typeof property.key.value === "number" ||
        typeof property.key.value === "string"))
  );
};

const hasWriteAfterInitialization = (variable: Variable): boolean =>
  variable.references.some(
    (reference) => reference.isWrite() && !reference.init
  );

const stableVariableForReference = (
  state: ClosedSchemaContext,
  identifier: ESTree.IdentifierReference
): Variable | undefined => {
  const variable = variableForReference(state.context, identifier);
  if (
    variable === undefined ||
    state.seen.has(variable) ||
    variable.defs.length !== 1 ||
    hasWriteAfterInitialization(variable)
  ) {
    return undefined;
  }
  return variable;
};

const variableDeclarator = (
  definition: VariableDefinition | undefined
): ESTree.VariableDeclarator | undefined => {
  if (
    definition?.type !== "Variable" ||
    definition.node.type !== "VariableDeclarator"
  ) {
    return undefined;
  }
  return definition.node;
};

const stableDeclaratorInitializer = (
  boundary: FunctionBoundary,
  declarator: ESTree.VariableDeclarator
): ESTree.Expression | undefined => {
  if (declarator.id.type !== "Identifier" || declarator.init === null) {
    return undefined;
  }
  const declaration = declarator.parent;
  if (
    declaration.type !== "VariableDeclaration" ||
    declaration.kind !== "const" ||
    containsNode(boundary, declarator)
  ) {
    return undefined;
  }
  return declarator.init;
};

const stableVariableInitializer = (
  state: ClosedSchemaContext,
  identifier: ESTree.IdentifierReference
): ESTree.Expression | undefined => {
  const variable = stableVariableForReference(state, identifier);
  if (variable === undefined) {
    return undefined;
  }
  const declarator = variableDeclarator(variable.defs[0]);
  return declarator === undefined
    ? undefined
    : stableDeclaratorInitializer(state.boundary, declarator);
};

const isBuiltinSchema = (
  state: ClosedSchemaContext,
  expression: ESTree.Expression
): boolean => {
  const name = safeImportedExportName(
    state.context,
    state.schemaBindings,
    expression
  );
  return name !== undefined && BUILTIN_SCHEMA_EXPORTS.has(name);
};

const withSeen = (
  state: ClosedSchemaContext,
  variable: Variable
): ClosedSchemaContext => ({
  ...state,
  seen: new Set([...state.seen, variable]),
});

const isClosedSchemaValue = (
  state: ClosedSchemaContext,
  expression: ESTree.Expression
): boolean => {
  const node = unwrapContractExpression(expression);
  if (isBuiltinSchema(state, node)) {
    return true;
  }
  if (node.type === "CallExpression") {
    return isFreshClosedConstruction(state, node);
  }
  if (node.type !== "Identifier") {
    return false;
  }
  const variable = variableForReference(state.context, node);
  const initializer = stableVariableInitializer(state, node);
  return (
    variable !== undefined &&
    initializer !== undefined &&
    isClosedSchemaValue(withSeen(state, variable), initializer)
  );
};

const isClosedStruct = (
  state: ClosedSchemaContext,
  node: ESTree.CallExpression
): boolean => {
  const argument = exactlyOneExpression(node.arguments);
  if (argument === undefined) {
    return false;
  }
  const fields = unwrapContractExpression(argument);
  return (
    fields.type === "ObjectExpression" &&
    fields.properties.every(
      (property) =>
        property.type === "Property" &&
        isStaticStructProperty(property) &&
        isClosedSchemaValue(state, property.value)
    )
  );
};

const isClosedSchemaArray = (
  state: ClosedSchemaContext,
  expression: ESTree.Expression
): boolean => {
  const values = unwrapContractExpression(expression);
  return (
    values.type === "ArrayExpression" &&
    values.elements.every(
      (element) =>
        element !== null &&
        element.type !== "SpreadElement" &&
        isClosedSchemaValue(state, element)
    )
  );
};

const isClosedLiteralArray = (expression: ESTree.Expression): boolean => {
  const values = unwrapContractExpression(expression);
  return (
    values.type === "ArrayExpression" &&
    values.elements.every(
      (element) =>
        element !== null &&
        element.type !== "SpreadElement" &&
        isLiteralValue(element)
    )
  );
};

const isClosedUnaryConstructor = (
  state: ClosedSchemaContext,
  node: ESTree.CallExpression
): boolean => {
  const argument = exactlyOneExpression(node.arguments);
  return argument !== undefined && isClosedSchemaValue(state, argument);
};

const isClosedRecord = (
  state: ClosedSchemaContext,
  node: ESTree.CallExpression
): boolean => {
  if (node.arguments.length !== 2) {
    return false;
  }
  const key = expressionAt(node.arguments, 0);
  const value = expressionAt(node.arguments, 1);
  return (
    key !== undefined &&
    value !== undefined &&
    isClosedSchemaValue(state, key) &&
    isClosedSchemaValue(state, value)
  );
};

const isClosedSchemaArrayConstructor = (
  state: ClosedSchemaContext,
  node: ESTree.CallExpression
): boolean => {
  const argument = exactlyOneExpression(node.arguments);
  return argument !== undefined && isClosedSchemaArray(state, argument);
};

const isClosedLiteralConstructor = (
  _state: ClosedSchemaContext,
  node: ESTree.CallExpression
): boolean => {
  const argument = exactlyOneExpression(node.arguments);
  return argument !== undefined && isLiteralValue(argument);
};

const isClosedLiteralsConstructor = (
  _state: ClosedSchemaContext,
  node: ESTree.CallExpression
): boolean => {
  const argument = exactlyOneExpression(node.arguments);
  return argument !== undefined && isClosedLiteralArray(argument);
};

const FRESH_CONSTRUCTION_PROOFS: ReadonlyMap<string, ConstructionProof> =
  new Map([
    ["Array", isClosedUnaryConstructor],
    ["Literal", isClosedLiteralConstructor],
    ["Literals", isClosedLiteralsConstructor],
    ["NonEmptyArray", isClosedUnaryConstructor],
    ["Record", isClosedRecord],
    ["Struct", isClosedStruct],
    ["Tuple", isClosedSchemaArrayConstructor],
    ["Union", isClosedSchemaArrayConstructor],
  ]);

const isFreshClosedConstruction = (
  state: ClosedSchemaContext,
  node: ESTree.CallExpression
): boolean => {
  if (node.optional) {
    return false;
  }
  const name = safeImportedExportName(
    state.context,
    state.schemaBindings,
    node.callee
  );
  const prove =
    name === undefined ? undefined : FRESH_CONSTRUCTION_PROOFS.get(name);
  return prove?.(state, node) ?? false;
};

const isFreshClosedSchema = (
  context: Context,
  schemaBindings: ReadonlyMap<number, string>,
  boundary: FunctionBoundary,
  expression: ESTree.Expression
): boolean => {
  const node = unwrapContractExpression(expression);
  return (
    node.type === "CallExpression" &&
    isFreshClosedConstruction(
      { boundary, context, schemaBindings, seen: new Set() },
      node
    )
  );
};

export const noInlineSchemaCompile = defineRule({
  meta: {
    docs: {
      description:
        "Reuse closed Effect v4 schemas and parser adapters outside repeated function execution.",
    },
    type: "suggestion",
  },
  createOnce(context) {
    let adapterBindings: ReadonlyMap<number, string> = new Map();
    let schemaBindings: ReadonlyMap<number, string> = new Map();
    return {
      before() {
        adapterBindings = collectImportBindings(
          context.sourceCode.ast,
          ADAPTER_IMPORT_BINDINGS
        );
        schemaBindings = collectImportBindings(
          context.sourceCode.ast,
          SCHEMA_IMPORT_BINDINGS
        );
      },
      CallExpression(node) {
        const match = matchAdapter(context, adapterBindings, node);
        if (match === undefined) {
          return;
        }
        const boundary = enclosingFunction(match.factory);
        if (
          boundary === undefined ||
          !isFreshClosedSchema(context, schemaBindings, boundary, match.schema)
        ) {
          return;
        }
        context.report({
          message: `Reuse a stable schema and ${match.name} adapter from an enclosing scope; rebuilding this schema gives it a new AST identity, preventing Effect from reusing the compiled parser.`,
          node: match.factory,
        });
      },
    };
  },
});
