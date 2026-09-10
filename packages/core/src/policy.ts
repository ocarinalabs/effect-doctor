import { Schema } from "effect";

import type { Severity } from "./finding.js";
import { GENERATED_RULE_CATALOG } from "./generated/rule-catalog.js";
import { sha256 } from "./internal/hash.js";
import { compareCodeUnits } from "./internal/order.js";
import type { RuleApplicability, RuleSource } from "./rules.js";

const ACTIVE_RULE_COUNT = 118;
const V4_COMPATIBILITY_REVISION = 1;

const PolicyDigestSchema = Schema.NonEmptyString.pipe(
  Schema.check(
    Schema.makeFilter((digest) =>
      /^[0-9a-f]{64}$/u.test(digest)
        ? []
        : ["Scan policy digest must be lowercase SHA-256"]
    )
  )
);

export type ScanPolicyRule = {
  readonly applicability: RuleApplicability;
  readonly defaultSeverity: Severity;
  readonly description?: string;
  readonly id: string;
  readonly providerRuleId: string;
  readonly source: RuleSource;
  readonly title?: string;
};

export const ScanPolicySchema = Schema.Struct({
  activeRuleCount: Schema.Literal(118),
  digest: PolicyDigestSchema,
  id: Schema.Literal("effect-v4/default"),
  revision: Schema.Literal(7),
});
export type ScanPolicy = typeof ScanPolicySchema.Type;

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

export const digestScanPolicy = (rules: readonly ScanPolicyRule[]): string => {
  const ids = rules.map((rule) => rule.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Scan policy rule IDs must be unique");
  }
  const semanticRules = rules
    .map((rule) => ({
      applicability: rule.applicability,
      defaultSeverity: rule.defaultSeverity,
      id: rule.id,
      providerRuleId: rule.providerRuleId,
      source: rule.source,
      v4CompatibilityRevision: V4_COMPATIBILITY_REVISION,
    }))
    .sort((left, right) => compareCodeUnits(left.id, right.id));
  return sha256(encodeJson(semanticRules));
};

if (GENERATED_RULE_CATALOG.length !== ACTIVE_RULE_COUNT) {
  throw new Error(`Expected ${ACTIVE_RULE_COUNT} active rules`);
}

export const SCAN_POLICY: ScanPolicy = Object.freeze({
  activeRuleCount: ACTIVE_RULE_COUNT,
  digest: digestScanPolicy(GENERATED_RULE_CATALOG),
  id: "effect-v4/default",
  revision: 7,
});
