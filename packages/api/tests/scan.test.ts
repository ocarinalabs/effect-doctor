import { fileURLToPath } from "node:url";

import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { compareProjects, scanProject } from "../src/index.js";

const fixture = (name: "clean" | "doctor" | "invalid"): string =>
  fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));

describe("scanProject", () => {
  it("includes project-local declaration files in every Analyzer Run", async () => {
    const report = await Effect.runPromise(
      scanProject({ root: fixture("clean") })
    );

    expect(report.engines.map((engine) => engine.engine)).toEqual([
      "effect-doctor",
      "effect-oxlint",
      "effect-tsgo",
    ]);
    expect(report.engines.every((engine) => engine.complete)).toBe(true);
    expect(
      report.engines.every((engine) =>
        engine.analyzedFiles.includes("src/environment.d.ts")
      )
    ).toBe(true);
    expect(
      new Set(
        report.engines.map((engine) => JSON.stringify(engine.analyzedFiles))
      ).size
    ).toBe(1);
  }, 30_000);

  it("combines type-aware and structural Effect diagnostics", async () => {
    const report = await Effect.runPromise(
      scanProject({ root: fixture("invalid") })
    );

    expect(report.schema).toBe("effect-doctor/scan/v1");
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          location: expect.objectContaining({ file: "src/main.ts" }),
          provenance: {
            engine: "effect-tsgo",
            nativeRuleId: "floatingEffect",
          },
          ruleId: "effect/floating-effect",
          severity: "error",
        }),
        expect.objectContaining({
          location: expect.objectContaining({ file: "src/main.ts" }),
          provenance: {
            engine: "effect-oxlint",
            nativeRuleId: "effect(noUnboundedRetry)",
          },
          ruleId: "effect/no-unbounded-retry",
          severity: "error",
        }),
      ])
    );
  }, 30_000);

  it("runs every first-party rule without exposing the Oxlint canary", async () => {
    const report = await Effect.runPromise(
      scanProject({ root: fixture("doctor") })
    );
    const configFindings = report.findings.filter(
      (finding) => finding.ruleId === "effect-doctor/prefer-config-redacted"
    );

    const suppressionFindings = report.findings.filter(
      (finding) => finding.ruleId === "effect-doctor/diagnostic-suppression"
    );
    expect(suppressionFindings.map((finding) => finding.evidence)).toContain(
      "oxlint-disable effect-doctor/diagnostic-suppression"
    );
    expect(suppressionFindings.map((finding) => finding.evidence)).toContain(
      "oxlint-disable-line effect-doctor/diagnostic-suppression"
    );
    expect(
      suppressionFindings.some((finding) =>
        finding.evidence.includes("imaginary/lookalike")
      )
    ).toBe(false);
    expect(
      report.findings.some((finding) => finding.ruleId.includes("canary"))
    ).toBe(false);
    expect(
      configFindings.some((finding) =>
        finding.evidence.includes("PUBLIC_API_KEY")
      )
    ).toBe(false);
    expect(
      configFindings.some((finding) => finding.evidence.includes("CLIENT_ID"))
    ).toBe(false);
    expect(
      configFindings.some((finding) =>
        finding.evidence.includes("LOCAL_SECRET")
      )
    ).toBe(false);
  }, 30_000);
});

describe("scan report stability", () => {
  it("produces byte-stable report data for identical source", async () => {
    const first = await Effect.runPromise(
      scanProject({ root: fixture("clean") })
    );
    const second = await Effect.runPromise(
      scanProject({ root: fixture("clean") })
    );

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  }, 30_000);
});

describe("compareProjects", () => {
  it("reports only findings introduced by the candidate", async () => {
    const report = await Effect.runPromise(
      compareProjects({
        baselineRoot: fixture("clean"),
        candidateRoot: fixture("invalid"),
      })
    );

    expect(report.introduced.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining([
        "effect/floating-effect",
        "effect/no-unbounded-retry",
      ])
    );
    expect(report.resolved).toEqual([]);
  }, 30_000);
});
