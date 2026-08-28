import { describe, expect, it } from "vitest";

import { effectOxlintRules, knownRules } from "../src/rules.js";

describe("the default Effect Oxlint profile", () => {
  it("includes narrow structural safety checks", () => {
    expect(effectOxlintRules).toHaveProperty(
      "effect/noRunCollectOnUnboundedStream",
      "warn"
    );
    expect(effectOxlintRules).toHaveProperty(
      "effect/noUnboundedConcurrency",
      "warn"
    );
    expect(effectOxlintRules).toHaveProperty("effect/noUnboundedRetry", "warn");
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
  it("includes first-party Effect Doctor rules", () => {
    expect(knownRules()).toContainEqual({
      defaultSeverity: "advice",
      id: "effect-doctor/diagnostic-suppression",
      nativeRuleId: "diagnostic-suppression",
      source: "effect-doctor",
      title: "Diagnostic Suppression",
    });
  });
});
