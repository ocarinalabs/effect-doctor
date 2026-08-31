import { describe, expect, it } from "vitest";

import {
  effectOxlintRules,
  integrityOxlintRules,
  knownRules,
  tsgoDiagnosticSeverity,
} from "../src/rules.js";

describe("knownRules", () => {
  it("publishes only the 150 Effect v4 rules", () => {
    const rules = knownRules();
    const sourceCounts: Record<string, number> = {};
    for (const rule of rules) {
      sourceCounts[rule.source] = (sourceCounts[rule.source] ?? 0) + 1;
    }

    expect(rules).toHaveLength(150);
    expect(sourceCounts).toEqual({
      "effect-doctor": 16,
      "effect-oxlint": 40,
      "effect-tsgo": 94,
    });
    expect(rules.map((rule) => rule.id)).not.toEqual(
      expect.arrayContaining([
        "effect/generic-effect-services",
        "effect/missing-effect-service-dependency",
        "effect/non-object-effect-service-type",
        "effect/schema-union-of-literals",
        "effect/scope-in-layer-effect",
      ])
    );
  });

  it("activates every cataloged provider rule", () => {
    expect(Object.keys(effectOxlintRules)).toHaveLength(40);
    expect(Object.keys(integrityOxlintRules)).toHaveLength(1);
    expect(Object.keys(tsgoDiagnosticSeverity)).toHaveLength(94);
    expect(Object.values(tsgoDiagnosticSeverity)).not.toContain("off");
    expect(
      knownRules().every(
        (rule) => rule.status === "blocking" || rule.status === "advisory"
      )
    ).toBe(true);
  });

  it("does not expose obsolete activation or Effect-version switches", () => {
    for (const rule of knownRules()) {
      expect(rule).not.toHaveProperty("defaultEnabled");
      expect(rule).not.toHaveProperty("selection");
      expect(rule).not.toHaveProperty("supportedEffectVersions");
    }
  });
});
