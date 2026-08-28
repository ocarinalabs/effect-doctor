import { describe, expect, it } from "vitest";

import { analyzeDoctorRules, doctorEngineRun } from "../src/internal/doctor.js";
import type { AnalyzedSource } from "../src/internal/tsgo.js";

const source = (contents: string): AnalyzedSource => ({
  absolute: "/project/src/main.ts",
  relative: "src/main.ts",
  source: contents,
});

describe("Effect Doctor first-party rules", () => {
  it("inventories analyzer suppressions in comments", () => {
    const findings = analyzeDoctorRules([
      source(`
const program = Effect.void
// @effect-diagnostics-next-line floatingEffect:off
Effect.runPromise(program)
// @ts-expect-error intentional boundary fixture
const port: number = "8080"
/* oxlint-disable effect/noUnboundedRetry */
`),
    ]);

    expect(findings).toHaveLength(3);
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidence: "@effect-diagnostics-next-line floatingEffect:off",
          location: expect.objectContaining({
            file: "src/main.ts",
            start: { column: 4, line: 3 },
          }),
          provenance: {
            engine: "effect-doctor",
            nativeRuleId: "diagnostic-suppression",
          },
          ruleId: "effect-doctor/diagnostic-suppression",
          severity: "advice",
        }),
      ])
    );
  });

  it("does not mistake string contents or explanatory prose for directives", () => {
    const findings = analyzeDoctorRules([
      source(`
const example = "// @ts-ignore"
// The text @ts-ignore is sometimes used in fixtures.
`),
    ]);

    expect(findings).toEqual([]);
  });

  it("reports a complete run over the planned source inventory", () => {
    expect(doctorEngineRun([source("export {}")])).toEqual({
      analyzedFiles: ["src/main.ts"],
      complete: true,
      engine: "effect-doctor",
      version: "0.0.0",
    });
  });
});
