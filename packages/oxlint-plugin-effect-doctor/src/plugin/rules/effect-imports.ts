import type { Context, ESTree } from "@oxlint/plugins";

import { importedExportName } from "./ast.ts";

export type EffectImportBinding = "*" | string;

const EFFECT_MODULES = ["effect", "effect/Effect"] as const;

const EFFECT_EXPORTS = [
  "annotateCurrentSpan",
  "annotateLogs",
  "annotateLogsScoped",
  "annotateSpans",
  "forever",
  "forkScoped",
  "gen",
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
): string | undefined => importedExportName(context, bindings, expression);
