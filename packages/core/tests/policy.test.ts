import { describe, expect, it } from "vitest";

import {
  applyRuleApplicability,
  decideRuleApplicability,
  digestScanPolicy,
  fingerprintFinding,
  knownRules,
  SCAN_POLICY,
} from "../src/index.js";
import type {
  Finding,
  RuleMetadata,
  ScanPolicyRule,
  SourceApplicability,
} from "../src/index.js";

const knownRule = (id: string): RuleMetadata => {
  const rule = knownRules().find((candidate) => candidate.id === id);
  if (rule === undefined) {
    throw new Error(`Unknown rule in test: ${id}`);
  }
  return rule;
};

const source = (directEffectModuleReference: boolean): SourceApplicability => ({
  directEffectModuleReference,
  file: "src/main.ts",
});

const digestRule = {
  applicability: "always",
  defaultSeverity: "error",
  description: "Original explanation.",
  id: "effect/example",
  providerRuleId: "example",
  source: "effect-tsgo",
  status: "blocking",
  title: "Example",
} satisfies ScanPolicyRule;

const finding = (
  ruleId: "effect/floating-effect" | "effect/no-nullish",
  line: number
): Finding => {
  const withoutFingerprint = {
    category: "correctness",
    evidence: `line ${line}`,
    location: {
      end: { column: 2, line },
      file: "src/main.ts",
      start: { column: 1, line },
    },
    message: `Finding for ${ruleId}`,
    provenance: {
      engine: "effect-tsgo",
      nativeRuleId:
        ruleId === "effect/floating-effect" ? "floatingEffect" : "noNullish",
    },
    ruleId,
    severity: ruleId === "effect/floating-effect" ? "error" : "advice",
    title: ruleId,
  } satisfies Omit<Finding, "fingerprint">;
  return {
    ...withoutFingerprint,
    fingerprint: fingerprintFinding(withoutFingerprint),
  };
};

describe("the fixed Effect v4 scan policy", () => {
  it("keeps all 150 rules active with the fixed applicability split", () => {
    const rules = knownRules();

    expect(rules).toHaveLength(150);
    expect(
      rules.filter((rule) => rule.applicability === "always")
    ).toHaveLength(114);
    expect(
      rules.filter((rule) => rule.applicability === "direct-effect-module")
    ).toHaveLength(36);
    expect(rules.filter((rule) => rule.status === "blocking")).toHaveLength(19);
    expect(
      rules
        .filter((rule) => rule.status === "blocking")
        .every((rule) => rule.applicability === "always")
    ).toBe(true);
    expect(SCAN_POLICY).toMatchObject({
      activeRuleCount: 150,
      id: "effect-v4/default",
      revision: 1,
    });
    expect(SCAN_POLICY.digest).toBe(
      "4f6f047d4fb5b1c85f623439f0836bf1c2268bcd1377afbfb75eae74b15f91bb"
    );
  });

  it("does not apply broad conventions without a direct Effect module reference", () => {
    const noNullish = knownRule("effect/no-nullish");

    expect(decideRuleApplicability(noNullish, source(false))).toEqual({
      applicable: false,
      reason: "missing-direct-effect-module-reference",
    });
    expect(decideRuleApplicability(noNullish, source(true))).toEqual({
      applicable: true,
    });
  });

  it("keeps always rules applicable in every selected source", () => {
    const floatingEffect = knownRule("effect/floating-effect");

    expect(decideRuleApplicability(floatingEffect, source(false))).toEqual({
      applicable: true,
    });
  });

  it("retains applicable findings and accounts for rejected diagnostics", () => {
    const always = finding("effect/floating-effect", 1);
    const broad = finding("effect/no-nullish", 2);

    expect(applyRuleApplicability([always, broad], [source(false)])).toEqual({
      applicability: {
        files: [source(false)],
        normalizedDiagnosticCount: 2,
        notApplicable: {
          groups: [
            {
              count: 1,
              reason: "missing-direct-effect-module-reference",
              ruleId: "effect/no-nullish",
            },
          ],
          total: 1,
        },
      },
      findings: [always],
    });
  });

  it("excludes prose from the policy digest", () => {
    const revisedProse = {
      ...digestRule,
      description: "Rewritten explanation.",
      title: "Rewritten title",
    } satisfies ScanPolicyRule;

    expect(digestScanPolicy([digestRule])).toBe(
      digestScanPolicy([revisedProse])
    );
  });

  it("changes the digest when policy semantics change", () => {
    const revisedApplicability = {
      ...digestRule,
      applicability: "direct-effect-module",
    } satisfies ScanPolicyRule;

    expect(digestScanPolicy([digestRule])).not.toBe(
      digestScanPolicy([revisedApplicability])
    );
  });

  it("uses canonical rule order for the digest", () => {
    const second = {
      ...digestRule,
      id: "effect/another-example",
      providerRuleId: "anotherExample",
    } satisfies ScanPolicyRule;

    expect(digestScanPolicy([digestRule, second])).toBe(
      digestScanPolicy([second, digestRule])
    );
  });
});
