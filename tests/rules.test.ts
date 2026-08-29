import { describe, expect, it } from "vitest";

import {
  doctorOxlintRules,
  effectOxlintRules,
  integrityOxlintRules,
  knownRules,
  tsgoDiagnosticSeverity,
} from "../src/rules.js";

describe("the default Effect Oxlint profile", () => {
  it("includes narrow structural safety checks", () => {
    expect(effectOxlintRules).toHaveProperty(
      "effect/noRunCollectOnUnboundedStream",
      "error"
    );
    expect(effectOxlintRules).toHaveProperty(
      "effect/noUnboundedConcurrency",
      "error"
    );
    expect(effectOxlintRules).toHaveProperty(
      "effect/noUnboundedRetry",
      "error"
    );
    expect(effectOxlintRules).toHaveProperty("effect/preferCatchTag", "warn");
    expect(Object.keys(effectOxlintRules)).toHaveLength(15);
  });

  it("does not treat team-style preferences as default quality findings", () => {
    expect(effectOxlintRules).not.toHaveProperty("effect/noAsyncFunction");
    expect(effectOxlintRules).not.toHaveProperty("effect/noGlobals");
    expect(effectOxlintRules).not.toHaveProperty("effect/noNullish");
    expect(effectOxlintRules).not.toHaveProperty("effect/noTernary");
    expect(effectOxlintRules).not.toHaveProperty("effect/noTryCatch");
  });
});

describe("the public rule inventory", () => {
  it("exposes the exhaustive pinned provider catalog", () => {
    const rules = knownRules();

    expect(rules).toHaveLength(148);
    expect(rules.filter((rule) => rule.source === "effect-tsgo")).toHaveLength(
      99
    );
    expect(
      rules.filter((rule) => rule.source === "effect-oxlint")
    ).toHaveLength(40);
    expect(
      rules.filter((rule) => rule.source === "effect-doctor")
    ).toHaveLength(9);
    expect(new Set(rules.map((rule) => rule.id)).size).toBe(148);
    expect(rules.filter((rule) => rule.defaultEnabled)).toHaveLength(52);
  });

  it("preserves the pinned TSGo metadata distribution", () => {
    const tsgoRules = knownRules().filter(
      (rule) => rule.source === "effect-tsgo"
    );

    expect(
      Object.fromEntries(
        Object.entries(Object.groupBy(tsgoRules, (rule) => rule.category)).map(
          ([category, rules]) => [category, rules?.length ?? 0]
        )
      )
    ).toEqual({
      antipattern: 20,
      correctness: 18,
      "effect-native": 22,
      style: 39,
    });
    expect(tsgoRules.filter((rule) => rule.status === "blocking")).toHaveLength(
      13
    );
    expect(tsgoRules.filter((rule) => rule.status === "advisory")).toHaveLength(
      15
    );
    expect(tsgoRules.filter((rule) => rule.status === "preview")).toHaveLength(
      36
    );
    expect(tsgoRules.filter((rule) => rule.status === "disabled")).toHaveLength(
      35
    );
    expect(tsgoRules.filter((rule) => rule.fixable)).toHaveLength(43);
  });

  it("is the sole source for every provider configuration", () => {
    expect(Object.keys(tsgoDiagnosticSeverity)).toHaveLength(99);
    expect(
      Object.values(tsgoDiagnosticSeverity).filter(
        (severity) => severity !== "off"
      )
    ).toHaveLength(28);
    expect(Object.keys(effectOxlintRules)).toHaveLength(15);
    expect(Object.keys(doctorOxlintRules)).toHaveLength(8);
    expect(Object.keys(integrityOxlintRules)).toHaveLength(1);
  });

  it("includes first-party Effect Doctor rules", () => {
    expect(knownRules()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "antipattern",
          defaultEnabled: true,
          defaultSeverity: "advice",
          id: "effect-doctor/diagnostic-suppression",
          nativeRuleId: "diagnostic-suppression",
          source: "effect-doctor",
          status: "advisory",
          title: "Diagnostic Suppression",
        }),
        expect.objectContaining({
          category: "security",
          defaultEnabled: true,
          defaultSeverity: "advice",
          id: "effect-doctor/prefer-config-redacted",
          nativeRuleId: "prefer-config-redacted",
          source: "effect-doctor",
          status: "advisory",
          title: "Prefer Config Redacted",
        }),
      ])
    );
  });

  it("preserves disabled and preview rules as visible policy", () => {
    expect(knownRules()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          defaultEnabled: false,
          id: "effect/no-known-value-widening",
          source: "effect-oxlint",
          status: "preview",
        }),
        expect.objectContaining({
          defaultEnabled: false,
          id: "effect/no-ternary",
          source: "effect-oxlint",
          status: "disabled",
        }),
      ])
    );
  });
});
