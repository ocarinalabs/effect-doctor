import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree, Variable } from "@oxlint/plugins";

import {
  containsNode,
  isFunctionBoundary,
  variableForReference,
} from "../internal/ast.ts";
import type { FunctionBoundary } from "../internal/ast.ts";
import {
  collectModuleBindings,
  defineEffectModule,
  moduleExportName,
} from "../internal/effect-module.ts";
import type {
  EffectModule,
  ModuleBindings,
} from "../internal/effect-module.ts";

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

const SCHEMA_NAMED_IMPORTS = [
  "Array",
  "Class",
  "Enum",
  "Literal",
  "Literals",
  "Map",
  "NonEmptyArray",
  "NullOr",
  "NullishOr",
  "Option",
  "OptionFromNullOr",
  "Record",
  "Redacted",
  "Result",
  "Set",
  "Struct",
  "TaggedStruct",
  "Tuple",
  "UndefinedOr",
  "Union",
  "annotate",
  "brand",
  "check",
  "flip",
  "fromJsonString",
  "isFinite",
  "isGreaterThan",
  "isGreaterThanOrEqualTo",
  "isInt",
  "isLessThan",
  "isLessThanOrEqualTo",
  "isMaxLength",
  "isMinLength",
  "isPattern",
  "makeFilter",
  "mutable",
  "mutableKey",
  "optional",
  "optionalKey",
  "toType",
  "withConstructorDefault",
  "withDecodingDefault",
] as const;

const SCHEMA_INSTANCE_METHODS: ReadonlySet<string> = new Set([
  "annotate",
  "annotateKey",
  "check",
  "pipe",
]);

const SCHEMA_MODULE = defineEffectModule("effect", "Schema", [
  ...ADAPTER_NAMES,
  ...BUILTIN_SCHEMA_EXPORTS,
  ...SCHEMA_NAMED_IMPORTS,
]);

const SCHEMA_PARSER_MODULE = defineEffectModule(
  "effect",
  "SchemaParser",
  ADAPTER_NAMES
);

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
  readonly schemaBindings: ModuleBindings;
  readonly seen: ReadonlySet<Variable>;
};

type VariableDefinition = Variable["defs"][number];

type LiteralValue = Extract<
  ESTree.Expression,
  { readonly type: "Literal" }
>["value"];

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

const nonOptionalModuleExportName = (
  context: Context,
  bindings: ModuleBindings,
  module: EffectModule,
  expression: ESTree.Expression | ESTree.Super
): string | undefined => {
  if (expression.type === "Super") {
    return undefined;
  }
  const node = unwrapContractExpression(expression);
  if (node.type === "ChainExpression") {
    return undefined;
  }
  if (node.type === "MemberExpression" && (node.computed || node.optional)) {
    return undefined;
  }
  return moduleExportName(context, bindings, module, node);
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

type AdapterBindings = {
  readonly parser: ModuleBindings;
  readonly schema: ModuleBindings;
};

const adapterName = (
  context: Context,
  bindings: AdapterBindings,
  callee: ESTree.Expression | ESTree.Super
): string | undefined =>
  nonOptionalModuleExportName(
    context,
    bindings.schema,
    SCHEMA_MODULE,
    callee
  ) ??
  nonOptionalModuleExportName(
    context,
    bindings.parser,
    SCHEMA_PARSER_MODULE,
    callee
  );

const matchAdapter = (
  context: Context,
  bindings: AdapterBindings,
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
  const name = adapterName(context, bindings, factory.callee);
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

const isLiteralValue = (node: ESTree.Expression): boolean => {
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

const schemaExportName = (
  state: ClosedSchemaContext,
  expression: ESTree.Expression | ESTree.Super
): string | undefined =>
  nonOptionalModuleExportName(
    state.context,
    state.schemaBindings,
    SCHEMA_MODULE,
    expression
  );

const isBuiltinSchema = (
  state: ClosedSchemaContext,
  expression: ESTree.Expression
): boolean => {
  const name = schemaExportName(state, expression);
  return name !== undefined && BUILTIN_SCHEMA_EXPORTS.has(name);
};

const withSeen = (
  state: ClosedSchemaContext,
  variable: Variable
): ClosedSchemaContext => ({
  ...state,
  seen: new Set([...state.seen, variable]),
});

const isClosedStableReference = (
  state: ClosedSchemaContext,
  identifier: ESTree.IdentifierReference
): boolean => {
  const variable = stableVariableForReference(state, identifier);
  if (variable === undefined) {
    return false;
  }
  const declarator = variableDeclarator(variable.defs[0]);
  const initializer =
    declarator === undefined
      ? undefined
      : stableDeclaratorInitializer(state.boundary, declarator);
  return (
    initializer !== undefined &&
    isClosedValue(withSeen(state, variable), initializer)
  );
};

const isClosedArray = (
  state: ClosedSchemaContext,
  node: ESTree.ArrayExpression
): boolean =>
  node.elements.every(
    (element) =>
      element !== null &&
      element.type !== "SpreadElement" &&
      isClosedValue(state, element)
  );

const isClosedObject = (
  state: ClosedSchemaContext,
  node: ESTree.ObjectExpression
): boolean =>
  node.properties.every(
    (property) =>
      property.type === "Property" &&
      isStaticStructProperty(property) &&
      isClosedValue(state, property.value)
  );

const isClosedInstanceMethodCall = (
  state: ClosedSchemaContext,
  node: ESTree.CallExpression
): boolean => {
  if (node.callee.type === "Super") {
    return false;
  }
  const callee = unwrapContractExpression(node.callee);
  return (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    !callee.optional &&
    callee.property.type === "Identifier" &&
    SCHEMA_INSTANCE_METHODS.has(callee.property.name) &&
    callee.object.type !== "Super" &&
    isClosedValue(state, callee.object)
  );
};

const isClosedConstruction = (
  state: ClosedSchemaContext,
  node: ESTree.CallExpression
): boolean => {
  if (node.optional) {
    return false;
  }
  const closedArguments = node.arguments.every(
    (argument) =>
      argument.type !== "SpreadElement" && isClosedValue(state, argument)
  );
  if (!closedArguments) {
    return false;
  }
  return (
    schemaExportName(state, node.callee) !== undefined ||
    isClosedInstanceMethodCall(state, node)
  );
};

const isClosedValue = (
  state: ClosedSchemaContext,
  expression: ESTree.Expression
): boolean => {
  const node = unwrapContractExpression(expression);
  if (isLiteralValue(node) || isBuiltinSchema(state, node)) {
    return true;
  }
  switch (node.type) {
    case "ArrayExpression": {
      return isClosedArray(state, node);
    }
    case "CallExpression": {
      return isClosedConstruction(state, node);
    }
    case "Identifier": {
      return isClosedStableReference(state, node);
    }
    case "ObjectExpression": {
      return isClosedObject(state, node);
    }
    default: {
      return false;
    }
  }
};

const isFreshClosedSchema = (
  context: Context,
  schemaBindings: ModuleBindings,
  boundary: FunctionBoundary,
  expression: ESTree.Expression
): boolean => {
  const node = unwrapContractExpression(expression);
  return (
    node.type === "CallExpression" &&
    isClosedConstruction(
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
    let bindings: AdapterBindings = { parser: new Map(), schema: new Map() };
    return {
      before() {
        bindings = {
          parser: collectModuleBindings(context, SCHEMA_PARSER_MODULE),
          schema: collectModuleBindings(context, SCHEMA_MODULE),
        };
      },
      CallExpression(node) {
        const match = matchAdapter(context, bindings, node);
        if (match === undefined) {
          return;
        }
        const boundary = enclosingFunction(match.factory);
        if (
          boundary === undefined ||
          !isFreshClosedSchema(context, bindings.schema, boundary, match.schema)
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
