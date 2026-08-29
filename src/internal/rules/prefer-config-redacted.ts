import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";

import {
  bindingForReference,
  collectImportBindings,
  identifierHasBinding,
  namedMember,
  staticString,
  unwrapExpression,
} from "./ast.ts";

type ImportBinding =
  | "config-namespace"
  | "config-schema"
  | "config-string"
  | "effect-namespace"
  | "schema-namespace"
  | "schema-string";

const IMPORT_BINDINGS: ReadonlyMap<string, ImportBinding> = new Map([
  ["effect:namespace", "effect-namespace"],
  ["effect:named:Config", "config-namespace"],
  ["effect:named:Schema", "schema-namespace"],
  ["effect/Config:namespace", "config-namespace"],
  ["effect/Config:named:schema", "config-schema"],
  ["effect/Config:named:string", "config-string"],
  ["effect/Schema:namespace", "schema-namespace"],
  ["effect/Schema:named:NonEmptyString", "schema-string"],
  ["effect/Schema:named:String", "schema-string"],
]);

const PUBLIC_SECRET_PATTERNS = [
  ["PUBLIC"],
  ["PUBLISHABLE"],
  ["CLIENT", "ID"],
] as const;

const PRIVATE_SECRET_PATTERNS = [
  ["SECRET"],
  ["PASSWORD"],
  ["PASSWD"],
  ["PASSPHRASE"],
  ["TOKEN"],
  ["KEY", "API"],
  ["KEY", "ACCESS"],
  ["KEY", "PRIVATE"],
  ["KEY", "SIGNING"],
  ["KEY", "ENCRYPTION"],
] as const;

const isImportedConfigString = (
  context: Context,
  bindings: ReadonlyMap<number, ImportBinding>,
  callee: ESTree.Expression
): boolean =>
  callee.type === "Identifier" &&
  bindingForReference(context, bindings, callee) === "config-string";

const isImportedConfigSchema = (
  context: Context,
  bindings: ReadonlyMap<number, ImportBinding>,
  callee: ESTree.Expression
): boolean =>
  callee.type === "Identifier" &&
  bindingForReference(context, bindings, callee) === "config-schema";

const isNamespaceConfigMember = (
  context: Context,
  bindings: ReadonlyMap<number, ImportBinding>,
  callee: ESTree.Expression,
  name: string
): boolean => {
  const member = namedMember(callee, name);
  if (member === undefined) {
    return false;
  }
  if (
    identifierHasBinding(context, bindings, member.object, "config-namespace")
  ) {
    return true;
  }
  const configMember = namedMember(member.object, "Config");
  return (
    configMember !== undefined &&
    identifierHasBinding(
      context,
      bindings,
      configMember.object,
      "effect-namespace"
    )
  );
};

const isConfigStringCall = (
  context: Context,
  bindings: ReadonlyMap<number, ImportBinding>,
  call: ESTree.CallExpression
): boolean => {
  const callee = unwrapExpression(call.callee);
  return (
    isImportedConfigString(context, bindings, callee) ||
    isNamespaceConfigMember(context, bindings, callee, "string")
  );
};

const isConfigSchemaCall = (
  context: Context,
  bindings: ReadonlyMap<number, ImportBinding>,
  call: ESTree.CallExpression
): boolean => {
  const callee = unwrapExpression(call.callee);
  return (
    isImportedConfigSchema(context, bindings, callee) ||
    isNamespaceConfigMember(context, bindings, callee, "schema")
  );
};

const isPlainStringSchema = (
  context: Context,
  bindings: ReadonlyMap<number, ImportBinding>,
  argument: ESTree.Argument | undefined
): boolean => {
  if (argument === undefined || argument.type === "SpreadElement") {
    return false;
  }
  const schema = unwrapExpression(argument);
  if (schema.type === "Identifier") {
    return bindingForReference(context, bindings, schema) === "schema-string";
  }
  const member =
    namedMember(schema, "String") ?? namedMember(schema, "NonEmptyString");
  if (member === undefined) {
    return false;
  }
  if (
    identifierHasBinding(context, bindings, member.object, "schema-namespace")
  ) {
    return true;
  }
  const schemaMember = namedMember(member.object, "Schema");
  return (
    schemaMember !== undefined &&
    identifierHasBinding(
      context,
      bindings,
      schemaMember.object,
      "effect-namespace"
    )
  );
};

const matchesTokenPattern = (
  tokens: ReadonlySet<string>,
  pattern: readonly string[]
): boolean => pattern.every((token) => tokens.has(token));

const isSecretName = (name: string): boolean => {
  const normalized = name.toUpperCase().replaceAll(/[^A-Z0-9]+/gu, "_");
  const tokens = new Set(normalized.split("_").filter(Boolean));
  if (
    PUBLIC_SECRET_PATTERNS.some((pattern) =>
      matchesTokenPattern(tokens, pattern)
    )
  ) {
    return false;
  }
  return (
    PRIVATE_SECRET_PATTERNS.some((pattern) =>
      matchesTokenPattern(tokens, pattern)
    ) ||
    normalized === "DATABASE_URL" ||
    normalized.endsWith("_DATABASE_URL")
  );
};

export const preferConfigRedacted = defineRule({
  meta: {
    docs: {
      description:
        "Redact statically named secret configuration values at construction.",
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
        const stringName = staticString(node.arguments[0]);
        if (
          stringName !== undefined &&
          isSecretName(stringName) &&
          isConfigStringCall(context, bindings, node)
        ) {
          context.report({
            message: `Use Config.redacted for secret configuration ${stringName}.`,
            node,
          });
          return;
        }
        const schemaName = staticString(node.arguments[1]);
        if (
          schemaName === undefined ||
          !isSecretName(schemaName) ||
          !isConfigSchemaCall(context, bindings, node) ||
          !isPlainStringSchema(context, bindings, node.arguments[0])
        ) {
          return;
        }
        context.report({
          message: `Wrap the schema with Schema.Redacted for secret configuration ${schemaName}.`,
          node,
        });
      },
    };
  },
});
