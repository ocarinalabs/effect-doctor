import type { Rule } from "@oxlint/plugins";

import {
  noManagedRuntimeInEffect,
  noModuleMocks,
  noSequentialEffectAll,
  noUnboundedConcurrency,
  preferCatchTag,
  preferEffectFn,
  preferMatchTagsExhaustive,
  preferPredicateIsTagged,
  requireNamedEffectFn,
} from "../../vendor/cevr-effect-oxlint/rules/index.js";
import type { EffectDoctorRuleId } from "../rules.ts";
import { consistentEffectFnName } from "./rules/consistent-effect-fn-name.ts";
import { noDuplicateLayerFactoryCall } from "./rules/no-duplicate-layer-factory-call.ts";
import { noInlineSchemaCompile } from "./rules/no-inline-schema-compile.ts";
import { noLongLivedLayerAcquisition } from "./rules/no-long-lived-layer-acquisition.ts";
import { noManualSqlTransaction } from "./rules/no-manual-sql-transaction.ts";
import { noMultipleCallbackResume } from "./rules/no-multiple-callback-resume.ts";
import { noMutationAfterUnsafeChunkWrap } from "./rules/no-mutation-after-unsafe-chunk-wrap.ts";
import { noNetworkInSqlTransaction } from "./rules/no-network-in-sql-transaction.ts";
import { noRunSyncOnSuspendingEffect } from "./rules/no-run-sync-on-suspending-effect.ts";
import { noThrowInEffectGenerator } from "./rules/no-throw-in-effect-generator.ts";
import { noUnredactedValueInDiagnostic } from "./rules/no-unredacted-value-in-diagnostic.ts";
import { preferAbortSignalPassthrough } from "./rules/prefer-abort-signal-passthrough.ts";
import { preferConfigRedacted } from "./rules/prefer-config-redacted.ts";
import { preferHttpJsonResponse } from "./rules/prefer-http-json-response.ts";
import { preferStructuredLogData } from "./rules/prefer-structured-log-data.ts";

const authoredRules = {
  "consistent-effect-fn-name": consistentEffectFnName,
  "no-duplicate-layer-factory-call": noDuplicateLayerFactoryCall,
  "no-inline-schema-compile": noInlineSchemaCompile,
  "no-long-lived-layer-acquisition": noLongLivedLayerAcquisition,
  "no-manual-sql-transaction": noManualSqlTransaction,
  "no-multiple-callback-resume": noMultipleCallbackResume,
  "no-mutation-after-unsafe-chunk-wrap": noMutationAfterUnsafeChunkWrap,
  "no-network-in-sql-transaction": noNetworkInSqlTransaction,
  "no-run-sync-on-suspending-effect": noRunSyncOnSuspendingEffect,
  "no-throw-in-effect-generator": noThrowInEffectGenerator,
  "no-unredacted-value-in-diagnostic": noUnredactedValueInDiagnostic,
  "prefer-abort-signal-passthrough": preferAbortSignalPassthrough,
  "prefer-config-redacted": preferConfigRedacted,
  "prefer-http-json-response": preferHttpJsonResponse,
  "prefer-structured-log-data": preferStructuredLogData,
} satisfies Readonly<Record<string, Rule>>;

const adoptedRules = {
  "no-managed-runtime-in-effect": noManagedRuntimeInEffect,
  "no-module-mocks": noModuleMocks,
  "no-sequential-effect-all": noSequentialEffectAll,
  "no-unbounded-concurrency": noUnboundedConcurrency,
  "prefer-catch-tag": preferCatchTag,
  "prefer-effect-fn": preferEffectFn,
  "prefer-match-tags-exhaustive": preferMatchTagsExhaustive,
  "prefer-predicate-is-tagged": preferPredicateIsTagged,
  "require-named-effect-fn": requireNamedEffectFn,
} satisfies Readonly<Record<string, Rule>>;

export const ruleRegistry = {
  ...adoptedRules,
  ...authoredRules,
} satisfies Readonly<Record<EffectDoctorRuleId, Rule>>;

export type AuthoredRuleId = keyof typeof authoredRules;
export type AdoptedRuleId = keyof typeof adoptedRules;
