import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";

import { staticString } from "../internal/ast.ts";
import {
  collectModuleBindings,
  defineEffectModule,
  moduleExportName,
} from "../internal/effect-module.ts";
import type { ModuleBindings } from "../internal/effect-module.ts";

const CONFIG_MODULE = defineEffectModule("effect", "Config", [
  "schema",
  "String",
]);

const PLAIN_STRING_SCHEMAS: ReadonlySet<string> = new Set([
  "NonEmptyString",
  "String",
]);

const SCHEMA_MODULE = defineEffectModule("effect", "Schema", [
  ...PLAIN_STRING_SCHEMAS,
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

const configOperation = (
  context: Context,
  bindings: ModuleBindings,
  call: ESTree.CallExpression
): string | undefined =>
  moduleExportName(context, bindings, CONFIG_MODULE, call.callee);

const isPlainStringSchema = (
  context: Context,
  bindings: ModuleBindings,
  argument: ESTree.Argument | undefined
): boolean => {
  if (argument === undefined || argument.type === "SpreadElement") {
    return false;
  }
  const name = moduleExportName(context, bindings, SCHEMA_MODULE, argument);
  return name !== undefined && PLAIN_STRING_SCHEMAS.has(name);
};

const matchesTokenPattern = (
  tokens: ReadonlySet<string>,
  pattern: readonly string[]
): boolean => pattern.every((token) => tokens.has(token));

const NON_SECRET_SUFFIXES: ReadonlySet<string> = new Set([
  "COUNT",
  "ENABLED",
  "LENGTH",
  "MS",
  "PATH",
  "SECONDS",
  "TIMEOUT",
  "TTL",
  "URL",
]);

const normalizeName = (name: string): string =>
  name
    .replaceAll(/(?<lower>[a-z0-9])(?<upper>[A-Z])/gu, "$<lower>_$<upper>")
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]+/gu, "_");

const isSecretName = (name: string): boolean => {
  const normalized = normalizeName(name);
  if (normalized === "DATABASE_URL" || normalized.endsWith("_DATABASE_URL")) {
    return true;
  }
  const tokens = normalized.split("_").filter(Boolean);
  const last = tokens.at(-1);
  if (last !== undefined && NON_SECRET_SUFFIXES.has(last)) {
    return false;
  }
  const tokenSet = new Set(tokens);
  if (
    PUBLIC_SECRET_PATTERNS.some((pattern) =>
      matchesTokenPattern(tokenSet, pattern)
    )
  ) {
    return false;
  }
  return PRIVATE_SECRET_PATTERNS.some((pattern) =>
    matchesTokenPattern(tokenSet, pattern)
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
    let configBindings: ModuleBindings = new Map();
    let schemaBindings: ModuleBindings = new Map();
    return {
      before() {
        configBindings = collectModuleBindings(context, CONFIG_MODULE);
        schemaBindings = collectModuleBindings(context, SCHEMA_MODULE);
      },
      CallExpression(node) {
        const operation = configOperation(context, configBindings, node);
        if (operation === "String") {
          const stringName = staticString(node.arguments[0]);
          if (stringName !== undefined && isSecretName(stringName)) {
            context.report({
              message: `Use Config.Redacted for secret configuration ${stringName}.`,
              node,
            });
          }
          return;
        }
        if (operation !== "schema") {
          return;
        }
        const schemaName = staticString(node.arguments[1]);
        if (
          schemaName === undefined ||
          !isSecretName(schemaName) ||
          !isPlainStringSchema(context, schemaBindings, node.arguments[0])
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
