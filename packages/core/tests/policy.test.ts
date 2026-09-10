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
  title: "Example",
} satisfies ScanPolicyRule;

const finding = (
  ruleId: "effect/floating-effect" | "effect-doctor/no-module-mocks",
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
        ruleId === "effect/floating-effect"
          ? "floatingEffect"
          : "no-module-mocks",
    },
    ruleId,
    severity: ruleId === "effect/floating-effect" ? "error" : "warning",
    title: ruleId,
  } satisfies Omit<Finding, "fingerprint">;
  return {
    ...withoutFingerprint,
    fingerprint: fingerprintFinding(withoutFingerprint),
  };
};

describe("the fixed Effect v4 scan policy", () => {
  it("keeps all 118 rules active with the fixed applicability split", () => {
    const rules = knownRules();

    expect(rules).toHaveLength(118);
    expect(
      rules.filter((rule) => rule.applicability === "always")
    ).toHaveLength(107);
    expect(
      rules.filter((rule) => rule.applicability === "direct-effect-module")
    ).toHaveLength(11);
    expect(
      rules.filter((rule) => rule.defaultSeverity === "error")
    ).toHaveLength(23);
    expect(
      rules
        .filter((rule) => rule.defaultSeverity === "error")
        .every((rule) => rule.applicability === "always")
    ).toBe(true);
    expect(SCAN_POLICY).toMatchObject({
      activeRuleCount: 118,
      id: "effect-v4/default",
      revision: 7,
    });
    expect(SCAN_POLICY.digest).toBe(
      "ebd7658237b642c1e0495ff54e437337d66654a806a7d6b76d65be0181f623ed"
    );
  });

  it("does not apply broad conventions without a direct Effect module reference", () => {
    const noModuleMocks = knownRule("effect-doctor/no-module-mocks");

    expect(decideRuleApplicability(noModuleMocks, source(false))).toEqual({
      applicable: false,
      reason: "missing-direct-effect-module-reference",
    });
    expect(decideRuleApplicability(noModuleMocks, source(true))).toEqual({
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
    const broad = finding("effect-doctor/no-module-mocks", 2);

    expect(applyRuleApplicability([always, broad], [source(false)])).toEqual({
      applicability: {
        files: [source(false)],
        normalizedDiagnosticCount: 2,
        notApplicable: {
          groups: [
            {
              count: 1,
              reason: "missing-direct-effect-module-reference",
              ruleId: "effect-doctor/no-module-mocks",
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
