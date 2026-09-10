import type { Category, Severity } from "./finding.js";
import {
  GENERATED_DISABLED_TSGO_RULES,
  GENERATED_RULE_CATALOG,
} from "./generated/rule-catalog.js";

export type RuleSource = "effect-tsgo" | "effect-doctor";
export type RuleApplicability = "always" | "direct-effect-module";

export type RuleMetadata = {
  readonly applicability: RuleApplicability;
  readonly id: string;
  readonly nativeRuleId: string;
  readonly title: string;
  readonly source: RuleSource;
  readonly category: Category;
  readonly description: string;
  readonly defaultSeverity: Severity;
  readonly fixable: boolean;
};

export type RuleCatalogEntry = RuleMetadata & {
  readonly execution: "tsgo" | "oxlint" | "oxlint-integrity";
  readonly providerDefaultSeverity: "error" | "warning" | "suggestion" | "off";
  readonly providerRuleId: string;
  readonly diagnosticCodes: readonly number[];
  readonly diagnosticRuleIds: readonly string[];
};

const RULE_CATALOG: readonly RuleCatalogEntry[] = GENERATED_RULE_CATALOG;

export const ruleForDiagnostic = (
  nativeRuleId: string
): RuleCatalogEntry | undefined =>
  RULE_CATALOG.find((rule) => rule.diagnosticRuleIds.includes(nativeRuleId));

export const ruleForTsgoDiagnostic = (
  nativeRuleId: string,
  code: number
): RuleCatalogEntry | undefined =>
  RULE_CATALOG.find(
    (rule) =>
      rule.diagnosticRuleIds.includes(nativeRuleId) &&
      rule.diagnosticCodes.includes(code)
  );

const oxlintSeverity = (severity: Severity): "error" | "warn" =>
  severity === "error" ? "error" : "warn";

export const doctorOxlintRules: Readonly<Record<string, "error" | "warn">> =
  Object.fromEntries(
    RULE_CATALOG.filter(
      (rule) => rule.source === "effect-doctor" && rule.execution === "oxlint"
    ).map((rule) => [rule.providerRuleId, oxlintSeverity(rule.defaultSeverity)])
  );

export const integrityOxlintRules: Readonly<Record<string, "error" | "warn">> =
  Object.fromEntries(
    RULE_CATALOG.filter(
      (rule) =>
        rule.source === "effect-doctor" && rule.execution === "oxlint-integrity"
    ).map((rule) => [rule.providerRuleId, oxlintSeverity(rule.defaultSeverity)])
  );

export const tsgoDiagnosticSeverity: Readonly<
  Record<string, "error" | "warning" | "off">
> = Object.fromEntries([
  ...GENERATED_DISABLED_TSGO_RULES.map((name) => [name, "off"] as const),
  ...RULE_CATALOG.filter((rule) => rule.source === "effect-tsgo").map(
    (rule) =>
      [
        rule.providerRuleId,
        rule.defaultSeverity === "error" ? "error" : "warning",
      ] as const
  ),
]);

export const knownRules = (): readonly RuleMetadata[] =>
  RULE_CATALOG.map((rule): RuleMetadata => ({
    applicability: rule.applicability,
    category: rule.category,
    defaultSeverity: rule.defaultSeverity,
    description: rule.description,
    fixable: rule.fixable,
    id: rule.id,
    nativeRuleId: rule.nativeRuleId,
    source: rule.source,
    title: rule.title,
  }));
