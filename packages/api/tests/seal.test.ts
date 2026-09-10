import { PINNED_TOOLCHAIN, SCAN_POLICY } from "@effect-doctor/core";
import type { ComparisonReport, ScanReport } from "@effect-doctor/core";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  sealComparisonReport,
  sealScanReport,
} from "../src/internal/report/seal.js";
import { DOCTOR_VERSION } from "../src/version.js";

const makeScanReport = (): ScanReport => ({
  applicability: {
    files: [{ directEffectModuleReference: true, file: "src/main.ts" }],
    normalizedDiagnosticCount: 0,
    notApplicable: { groups: [], total: 0 },
  },
  doctorVersion: DOCTOR_VERSION,
  engines: [
    {
      analyzedFiles: ["src/main.ts"],
      complete: true,
      engine: "effect-doctor",
      version: DOCTOR_VERSION,
    },
    {
      analyzedFiles: ["src/main.ts"],
      complete: true,
      engine: "effect-tsgo",
      version: PINNED_TOOLCHAIN.tsgo,
    },
  ],
  findings: [],
  kind: "scan",
  policy: SCAN_POLICY,
  root: ".",
  schema: "effect-doctor/scan/v1",
  summary: { errors: 0, warnings: 0 },
  target: { entry: "tsconfig.json", projects: ["tsconfig.json"] },
  toolchain: {
    effect: PINNED_TOOLCHAIN.effect,
    oxlint: PINNED_TOOLCHAIN.oxlint,
    tsgo: PINNED_TOOLCHAIN.tsgo,
    typescript: PINNED_TOOLCHAIN.typescript,
  },
});

const makeComparisonReport = (unchangedCount: number): ComparisonReport => ({
  baseline: makeScanReport(),
  candidate: makeScanReport(),
  doctorVersion: DOCTOR_VERSION,
  introduced: [],
  kind: "comparison",
  resolved: [],
  schema: "effect-doctor/comparison/v1",
  unchangedCount,
});

describe("report sealing", () => {
  it("accepts a report that satisfies the Scan Report contract", async () => {
    const report = makeScanReport();

    await expect(Effect.runPromise(sealScanReport(report))).resolves.toEqual(
      report
    );
  });

  it("fails the scan when a report breaks its own contract", async () => {
    const valid = makeScanReport();
    const report = { ...valid, summary: { ...valid.summary, errors: 1 } };

    await expect(
      Effect.runPromise(sealScanReport(report))
    ).rejects.toMatchObject({
      _tag: "InvalidAnalyzerOutput",
      engine: "effect-doctor",
      message: expect.stringContaining("Scan Report failed its own contract"),
    });
  });

  it("fails a comparison whose delta does not partition its scans", async () => {
    await expect(
      Effect.runPromise(sealComparisonReport(makeComparisonReport(1)))
    ).rejects.toMatchObject({
      _tag: "InvalidAnalyzerOutput",
      engine: "effect-doctor",
      message: expect.stringContaining(
        "Comparison Report failed its own contract"
      ),
    });
    await expect(
      Effect.runPromise(sealComparisonReport(makeComparisonReport(0)))
    ).resolves.toMatchObject({ unchangedCount: 0 });
  });
});
