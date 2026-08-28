import { fileURLToPath } from "node:url";

import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  ComparisonReportSchema,
  ScanReportSchema,
  compareProjects,
  scanProject,
} from "../src/index.js";

const fixture = (name: "clean" | "invalid"): string =>
  fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));

describe("scanProject", () => {
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
          severity: "advice",
        }),
      ])
    );
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
