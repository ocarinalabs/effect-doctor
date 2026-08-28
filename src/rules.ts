import type { recommended as effectRecommended } from "oxlint-plugin-effect/presets/recommended";

import type { Category, Severity } from "./model.js";

const TSGO_DEFAULT_ERRORS = new Set([
  "classSelfMismatch",
  "effectFnImplicitAny",
  "floatingEffect",
  "floatingEffectInVitest",
  "missingEffectContext",
  "missingEffectError",
  "missingLayerContext",
  "missingReturnYieldStar",
  "missingStarInYieldEffectGen",
  "nonObjectEffectServiceType",
  "overriddenSchemaConstructor",
  "schemaLiteralNonFinite",
  "schemaOpaqueInstanceMember",
]);

const TSGO_DEFAULT_WARNINGS = new Set([
  "duplicatePackage",
  "genericEffectServices",
  "outdatedApi",
  "promiseInEffectSuccess",
  "effectFnIife",
  "effectGenUsesAdapter",
  "effectInFailure",
  "effectInVoidSuccess",
  "globalErrorInEffectCatch",
  "globalErrorInEffectFailure",
  "layerMergeAllWithDependencies",
  "lazyPromiseInEffectSync",
  "multipleEffectProvide",
  "scopeInLayerEffect",
  "unknownInEffectCatch",
]);

const toKebabCase = (value: string): string =>
  value
    .replaceAll(/(?<lower>[a-z\d])(?<upper>[A-Z])/gu, "$<lower>-$<upper>")
    .replaceAll(/[\s_]+/gu, "-")
    .toLowerCase();

export const canonicalRuleId = (nativeRuleId: string): string => {
  let nativeName = nativeRuleId;
  const prefix = "effect(";
  if (nativeRuleId.startsWith(prefix) && nativeRuleId.endsWith(")")) {
    nativeName = nativeRuleId.slice(prefix.length, -1);
  }
  return `effect/${toKebabCase(nativeName)}`;
};

export const ruleTitle = (nativeRuleId: string): string =>
  canonicalRuleId(nativeRuleId)
    .slice("effect/".length)
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");

export const tsgoSeverity = (
  nativeRuleId: string,
  emittedSeverity: "error" | "warning" | "message"
): Severity => {
  if (TSGO_DEFAULT_ERRORS.has(nativeRuleId)) {
    return "error";
  }
  if (TSGO_DEFAULT_WARNINGS.has(nativeRuleId)) {
    return "warning";
  }
  if (emittedSeverity === "error") {
    return "error";
  }
  if (emittedSeverity === "warning") {
    return "warning";
  }
  return "advice";
};

export const tsgoCategory = (nativeRuleId: string): Category => {
  if (TSGO_DEFAULT_ERRORS.has(nativeRuleId)) {
    return "correctness";
  }
  if (TSGO_DEFAULT_WARNINGS.has(nativeRuleId)) {
    return "antipattern";
  }
  return "effect-native";
};

type EffectOxlintRuleId = keyof typeof effectRecommended;

const DEFAULT_EFFECT_OXLINT_RULE_IDS: readonly EffectOxlintRuleId[] = [
  "effect/noManagedRuntimeInEffect",
  "effect/noPerCallCacheConstruction",
  "effect/noRunCollectOnUnboundedStream",
  "effect/noSilentCatchAll",
  "effect/noUnboundedConcurrency",
  "effect/noUnboundedRetry",
  "effect/preferMatchTagsExhaustive",
];

export const effectOxlintRules = Object.fromEntries(
  DEFAULT_EFFECT_OXLINT_RULE_IDS.map((ruleId) => [ruleId, "warn"])
);

export type RuleMetadata = {
  readonly id: string;
  readonly nativeRuleId: string;
  readonly title: string;
  readonly source: "effect-tsgo" | "effect-oxlint" | "effect-doctor";
  readonly defaultSeverity: Severity;
};

export const knownRules = (): readonly RuleMetadata[] => {
  const doctorRules: readonly RuleMetadata[] = [
    {
      defaultSeverity: "advice",
      id: "effect-doctor/diagnostic-suppression",
      nativeRuleId: "diagnostic-suppression",
      source: "effect-doctor",
      title: "Diagnostic Suppression",
    },
  ];
  const tsgoRules = [...TSGO_DEFAULT_ERRORS, ...TSGO_DEFAULT_WARNINGS].map(
    (nativeRuleId): RuleMetadata => ({
      defaultSeverity: tsgoSeverity(nativeRuleId, "message"),
      id: canonicalRuleId(nativeRuleId),
      nativeRuleId,
      source: "effect-tsgo",
      title: ruleTitle(nativeRuleId),
    })
  );
  const oxlintRules = Object.keys(effectOxlintRules).map(
    (nativeRuleId): RuleMetadata => ({
      defaultSeverity: "advice",
      id: canonicalRuleId(nativeRuleId.replace("effect/", "")),
      nativeRuleId,
      source: "effect-oxlint",
      title: ruleTitle(nativeRuleId.replace("effect/", "")),
    })
  );

  return [...doctorRules, ...tsgoRules, ...oxlintRules].sort(
    (left, right) =>
      left.id.localeCompare(right.id) || left.source.localeCompare(right.source)
  );
};
