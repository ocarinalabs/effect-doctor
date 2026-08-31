import type { Category, Severity } from "./finding.js";
import { GENERATED_RULE_CATALOG } from "./generated/rule-catalog.js";

export type RuleSource = "effect-tsgo" | "effect-oxlint" | "effect-doctor";
export type RuleStatus = "blocking" | "advisory";

export type RuleMetadata = {
  readonly id: string;
  readonly nativeRuleId: string;
  readonly title: string;
  readonly source: RuleSource;
  readonly category: Category;
  readonly description: string;
  readonly defaultSeverity: Severity;
  readonly fixable: boolean;
  readonly status: RuleStatus;
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

export const effectOxlintRules: Readonly<Record<string, "error" | "warn">> =
  Object.fromEntries(
    RULE_CATALOG.filter((rule) => rule.source === "effect-oxlint").map(
      (rule) => [rule.providerRuleId, oxlintSeverity(rule.defaultSeverity)]
    )
  );

export const integrityOxlintRules: Readonly<Record<string, "error" | "warn">> =
  Object.fromEntries(
    RULE_CATALOG.filter(
      (rule) =>
        rule.source === "effect-doctor" && rule.execution === "oxlint-integrity"
    ).map((rule) => [rule.providerRuleId, oxlintSeverity(rule.defaultSeverity)])
  );

export const tsgoDiagnosticSeverity: Readonly<
  Record<string, "error" | "warning">
> = Object.fromEntries(
  RULE_CATALOG.filter((rule) => rule.source === "effect-tsgo").map((rule) => [
    rule.providerRuleId,
    rule.defaultSeverity === "error" ? "error" : "warning",
  ])
);

export const knownRules = (): readonly RuleMetadata[] =>
  RULE_CATALOG.map((rule): RuleMetadata => ({
    category: rule.category,
    defaultSeverity: rule.defaultSeverity,
    description: rule.description,
    fixable: rule.fixable,
    id: rule.id,
    nativeRuleId: rule.nativeRuleId,
    source: rule.source,
    status: rule.status,
    title: rule.title,
  }));
