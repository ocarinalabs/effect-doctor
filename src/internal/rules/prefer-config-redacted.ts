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

type ImportBinding = "config-namespace" | "config-string" | "effect-namespace";

const IMPORT_BINDINGS: ReadonlyMap<string, ImportBinding> = new Map([
  ["effect:namespace", "effect-namespace"],
  ["effect:named:Config", "config-namespace"],
  ["effect/Config:namespace", "config-namespace"],
  ["effect/Config:named:string", "config-string"],
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

const isNamespaceConfigString = (
  context: Context,
  bindings: ReadonlyMap<number, ImportBinding>,
  callee: ESTree.Expression
): boolean => {
  const stringMember = namedMember(callee, "string");
  if (stringMember === undefined) {
    return false;
  }
  if (
    identifierHasBinding(
      context,
      bindings,
      stringMember.object,
      "config-namespace"
    )
  ) {
    return true;
  }
  const configMember = namedMember(stringMember.object, "Config");
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
    isNamespaceConfigString(context, bindings, callee)
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
        "Prefer Config.redacted for statically named secret configuration values.",
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
        const name = staticString(node.arguments[0]);
        if (
          name === undefined ||
          !isSecretName(name) ||
          !isConfigStringCall(context, bindings, node)
        ) {
          return;
        }
        context.report({
          message: `Use Config.redacted for secret configuration ${name}.`,
          node,
        });
      },
    };
  },
});
