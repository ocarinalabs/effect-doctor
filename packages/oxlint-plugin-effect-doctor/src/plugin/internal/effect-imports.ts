import type { Context, ESTree } from "@oxlint/plugins";

import {
  defineEffectModule,
  moduleExportName,
  moduleImportBindings,
} from "./effect-module.ts";
import type { ModuleBinding } from "./effect-module.ts";

export type EffectImportBinding = ModuleBinding;

const EFFECT_EXPORTS = [
  "annotateCurrentSpan",
  "annotateLogs",
  "annotateLogsScoped",
  "annotateSpans",
  "callback",
  "fn",
  "fnUntraced",
  "fnUntracedEager",
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

const EFFECT_MODULE = defineEffectModule("effect", "Effect", EFFECT_EXPORTS);

export const EFFECT_IMPORT_BINDINGS: ReadonlyMap<string, EffectImportBinding> =
  moduleImportBindings(EFFECT_MODULE);

export const effectExportName = (
  context: Context,
  bindings: ReadonlyMap<number, EffectImportBinding>,
  expression: ESTree.Expression | ESTree.Super
): string | undefined =>
  moduleExportName(context, bindings, EFFECT_MODULE, expression);
