import type { Context, ESTree } from "@oxlint/plugins";

import { bindingForReference, unwrapExpression } from "./ast.ts";

export type EffectImportBinding = "*" | string;

const EFFECT_MODULES = ["effect", "effect/Effect"] as const;

const EFFECT_EXPORTS = [
  "callback",
  "log",
  "logDebug",
  "logError",
  "logFatal",
  "logInfo",
  "logTrace",
  "logWarning",
  "never",
  "promise",
  "runSync",
  "runSyncExit",
  "sleep",
  "tryPromise",
  "yieldNow",
] as const;

export const EFFECT_IMPORT_BINDINGS: ReadonlyMap<string, EffectImportBinding> =
  new Map(
    EFFECT_MODULES.flatMap((source) => [
      [`${source}:namespace`, "*" as const] as const,
      ...(source === "effect"
        ? [[`${source}:named:Effect`, "*" as const] as const]
        : []),
      ...EFFECT_EXPORTS.map(
        (name) => [`${source}:named:${name}`, name] as const
      ),
    ])
  );

export const effectExportName = (
  context: Context,
  bindings: ReadonlyMap<number, EffectImportBinding>,
  expression: ESTree.Expression
): string | undefined => {
  const node = unwrapExpression(expression);
  if (node.type === "Identifier") {
    const binding = bindingForReference(context, bindings, node);
    return binding === "*" ? undefined : binding;
  }
  if (
    node.type !== "MemberExpression" ||
    node.computed ||
    node.property.type !== "Identifier"
  ) {
    return undefined;
  }
  const owner = unwrapExpression(node.object);
  return owner.type === "Identifier" &&
    bindingForReference(context, bindings, owner) === "*"
    ? node.property.name
    : undefined;
};
