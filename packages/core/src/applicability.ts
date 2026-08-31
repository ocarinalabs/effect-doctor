import { Schema } from "effect";

import type { Finding } from "./finding.js";
import { ProjectRelativePathSchema } from "./finding.js";
import { compareCodeUnits } from "./internal/order.js";
import { knownRules } from "./rules.js";
import type { RuleMetadata } from "./rules.js";

const PositiveInt = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(1))
);

export const SourceApplicabilitySchema = Schema.Struct({
  directEffectModuleReference: Schema.Boolean,
  file: ProjectRelativePathSchema,
});
export type SourceApplicability = typeof SourceApplicabilitySchema.Type;

export const NotApplicableGroupSchema = Schema.Struct({
  count: PositiveInt,
  reason: Schema.Literal("missing-direct-effect-module-reference"),
  ruleId: Schema.NonEmptyString,
});
export type NotApplicableGroup = typeof NotApplicableGroupSchema.Type;

export const ApplicabilityReportSchema = Schema.Struct({
  files: Schema.Array(SourceApplicabilitySchema),
  normalizedDiagnosticCount: Schema.Natural,
  notApplicable: Schema.Struct({
    groups: Schema.Array(NotApplicableGroupSchema),
    total: Schema.Natural,
  }),
});
export type ApplicabilityReport = typeof ApplicabilityReportSchema.Type;

export type ApplicabilityDecision =
  | { readonly applicable: true }
  | {
      readonly applicable: false;
      readonly reason: "missing-direct-effect-module-reference";
    };

export const decideRuleApplicability = (
  rule: Pick<RuleMetadata, "applicability">,
  source: SourceApplicability
): ApplicabilityDecision => {
  if (rule.applicability === "always" || source.directEffectModuleReference) {
    return { applicable: true };
  }
  return {
    applicable: false,
    reason: "missing-direct-effect-module-reference",
  };
};

export type AppliedRuleApplicability = {
  readonly applicability: ApplicabilityReport;
  readonly findings: readonly Finding[];
};

const ruleById = new Map(knownRules().map((rule) => [rule.id, rule]));

export const applyRuleApplicability = (
  findings: readonly Finding[],
  sources: readonly SourceApplicability[]
): AppliedRuleApplicability => {
  const files = sources.toSorted((left, right) =>
    compareCodeUnits(left.file, right.file)
  );
  const sourceByFile = new Map(files.map((source) => [source.file, source]));
  if (sourceByFile.size !== files.length) {
    throw new Error("Source applicability profiles must be unique");
  }

  const applicable: Finding[] = [];
  const rejectedByRule = new Map<string, number>();
  for (const finding of findings) {
    const rule = ruleById.get(finding.ruleId);
    if (rule === undefined) {
      throw new Error(`Unknown canonical rule: ${finding.ruleId}`);
    }
    const source = sourceByFile.get(finding.location.file);
    if (source === undefined) {
      throw new Error(
        `Missing source applicability profile: ${finding.location.file}`
      );
    }
    const decision = decideRuleApplicability(rule, source);
    if (decision.applicable) {
      applicable.push(finding);
      continue;
    }
    rejectedByRule.set(
      finding.ruleId,
      (rejectedByRule.get(finding.ruleId) ?? 0) + 1
    );
  }

  const groups = [...rejectedByRule]
    .sort(([left], [right]) => compareCodeUnits(left, right))
    .map(([ruleId, count]): NotApplicableGroup => ({
      count,
      reason: "missing-direct-effect-module-reference",
      ruleId,
    }));
  const total = findings.length - applicable.length;

  return {
    applicability: {
      files,
      normalizedDiagnosticCount: findings.length,
      notApplicable: { groups, total },
    },
    findings: applicable,
  };
};
