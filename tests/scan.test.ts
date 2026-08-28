import { fileURLToPath } from "node:url";

import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  ComparisonReportSchema,
  ScanReportSchema,
  compareProjects,
  scanProject,
} from "../src/index.js";

const fixture = (name: "clean" | "doctor" | "invalid"): string =>
  fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));

describe("scanProject", () => {
  it("includes project-local declaration files in every provider receipt", async () => {
    const report = await Effect.runPromise(
      scanProject({ root: fixture("clean") })
    );

    expect(report.engines).toEqual([
      {
        analyzedFiles: [
          "src/Z.ts",
          "src/a.ts",
          "src/environment.d.ts",
          "src/main.ts",
        ],
        complete: true,
        engine: "effect-doctor",
        version: "0.0.0",
      },
      {
        analyzedFiles: [
          "src/Z.ts",
          "src/a.ts",
          "src/environment.d.ts",
          "src/main.ts",
        ],
        complete: true,
        engine: "effect-oxlint",
        version: "0.11.0",
      },
      {
        analyzedFiles: [
          "src/Z.ts",
          "src/a.ts",
          "src/environment.d.ts",
          "src/main.ts",
        ],
        complete: true,
        engine: "effect-tsgo",
        version: "0.38.0",
      },
    ]);
  }, 30_000);

  it("combines type-aware and structural Effect diagnostics", async () => {
    const report = await Effect.runPromise(
      scanProject({ root: fixture("invalid") })
    );

    expect(report.schema).toBe("effect-doctor/scan/v1");
    expect(Schema.decodeSync(ScanReportSchema)(report)).toEqual(report);
    expect(report.engines).toEqual([
      {
        analyzedFiles: ["src/main.ts"],
        complete: true,
        engine: "effect-doctor",
        version: "0.0.0",
      },
      {
        analyzedFiles: ["src/main.ts"],
        complete: true,
        engine: "effect-oxlint",
        version: "0.11.0",
      },
      {
        analyzedFiles: ["src/main.ts"],
        complete: true,
        engine: "effect-tsgo",
        version: "0.38.0",
      },
    ]);
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

    expect(configFindings.map((finding) => finding.evidence)).toEqual([
      'Config.string("DATABASE_PASSWORD")',
      'AppConfig.string("SERVICE_TOKEN")',
      'EffectNamespace.Config.string("SIGNING_KEY")',
      'ConfigModule.string("PRIVATE_KEY")',
      'configString("API_SECRET")',
      'Config.string(("PARENTHESIZED_SECRET"))',
      'Config.string("ASSERTED_SECRET" as string)',
      'Config.string("NON_NULL_SECRET"!)',
      'Config.string(\n  "SATISFIES_SECRET" satisfies string\n)',
      'Config.string(\n  <string>"TYPE_ASSERTION_SECRET"\n)',
      "Config.string(`TEMPLATE_SECRET`)",
      '((Config.string))("WRAPPED_CALLEE_SECRET")',
    ]);
    const suppressionFindings = report.findings.filter(
      (finding) => finding.ruleId === "effect-doctor/diagnostic-suppression"
    );
    expect(suppressionFindings).toHaveLength(3);
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
    expect(Schema.decodeSync(ComparisonReportSchema)(report)).toEqual(report);
  }, 30_000);
});
