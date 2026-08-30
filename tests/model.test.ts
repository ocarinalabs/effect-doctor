import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { ComparisonReportSchema, ScanReportSchema } from "../src/model.js";
import type { Finding, ScanReport } from "../src/model.js";
import { makeFinding } from "./support/make-finding.js";

const makeScanReport = (findings: readonly Finding[] = []): ScanReport => ({
  doctorVersion: "0.1.0",
  engines: [
    {
      analyzedFiles: ["src/main.ts"],
      complete: true,
      engine: "effect-doctor",
      version: "0.1.0",
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
  ],
  findings,
  kind: "scan",
  root: ".",
  schema: "effect-doctor/scan/v1",
  summary: {
    advice: findings.filter((finding) => finding.severity === "advice").length,
    errors: findings.filter((finding) => finding.severity === "error").length,
    warnings: findings.filter((finding) => finding.severity === "warning")
      .length,
  },
  toolchain: {
    effect: "4.0.0-rc.112",
    effectOxlint: "0.11.0",
    oxlint: "1.80.0",
    tsgo: "0.38.0",
    typescript: "7.0.2",
  },
});

describe("ScanReportSchema", () => {
  it("accepts a complete internally consistent report", () => {
    const report = makeScanReport([makeFinding()]);

    expect(Schema.decodeUnknownSync(ScanReportSchema)(report)).toEqual(report);
  });

  it("rejects a report without all three complete provider receipts", () => {
    const report = { ...makeScanReport(), engines: [] };

    expect(() => Schema.decodeUnknownSync(ScanReportSchema)(report)).toThrow();
  });

  it("rejects provider inventories that disagree", () => {
    const valid = makeScanReport();
    const report = {
      ...valid,
      engines: valid.engines.map((receipt, index) =>
        index === 1
          ? {
              ...receipt,
              analyzedFiles: [...receipt.analyzedFiles, "src/extra.ts"],
            }
          : receipt
      ),
    };

    expect(() => Schema.decodeUnknownSync(ScanReportSchema)(report)).toThrow();
  });

  it("rejects a summary that disagrees with findings", () => {
    const valid = makeScanReport([makeFinding()]);
    const report = { ...valid, summary: { ...valid.summary, errors: 0 } };

    expect(() => Schema.decodeUnknownSync(ScanReportSchema)(report)).toThrow();
  });
});

describe("ComparisonReportSchema", () => {
  it("accepts a coherent introduced finding", () => {
    const finding = makeFinding();
    const report = {
      baseline: makeScanReport(),
      candidate: makeScanReport([finding]),
      doctorVersion: "0.1.0",
      introduced: [finding],
      kind: "comparison",
      resolved: [],
      schema: "effect-doctor/comparison/v1",
      unchangedCount: 0,
    } as const;

    expect(Schema.decodeUnknownSync(ComparisonReportSchema)(report)).toEqual(
      report
    );
  });

  it("rejects an impossible delta count", () => {
    const finding = makeFinding();
    const report = {
      baseline: makeScanReport(),
      candidate: makeScanReport([finding]),
      doctorVersion: "0.1.0",
      introduced: [finding],
      kind: "comparison",
      resolved: [],
      schema: "effect-doctor/comparison/v1",
      unchangedCount: 1,
    } as const;

    expect(() =>
      Schema.decodeUnknownSync(ComparisonReportSchema)(report)
    ).toThrow();
  });
});
