import { ComparisonReportSchema, ScanReportSchema } from "@effect-doctor/core";
import type { ComparisonReport, ScanReport } from "@effect-doctor/core";
import { Effect, Schema } from "effect";

import { InvalidAnalyzerOutput } from "../../errors.js";

const MAX_DETAIL_LENGTH = 400;

const decodeScanReport = Schema.decodeUnknownSync(ScanReportSchema);
const decodeComparisonReport = Schema.decodeUnknownSync(ComparisonReportSchema);

const contractFailureDetail = (message: string): string => {
  const detail = message.replaceAll(/\s+/gu, " ").trim();
  if (detail.length === 0) {
    return "unknown contract failure";
  }
  return detail.length <= MAX_DETAIL_LENGTH
    ? detail
    : `${detail.slice(0, MAX_DETAIL_LENGTH)}…`;
};

const contractFailure = (
  kind: "Scan Report" | "Comparison Report",
  message: string
): InvalidAnalyzerOutput =>
  new InvalidAnalyzerOutput({
    engine: "effect-doctor",
    message: `${kind} failed its own contract: ${contractFailureDetail(message)}`,
  });

export const sealScanReport = (
  report: ScanReport
): Effect.Effect<ScanReport, InvalidAnalyzerOutput> =>
  Effect.try({
    catch: (error) =>
      contractFailure(
        "Scan Report",
        error instanceof Error ? error.message : String(error)
      ),
    try: () => decodeScanReport(report),
  });

export const sealComparisonReport = (
  report: ComparisonReport
): Effect.Effect<ComparisonReport, InvalidAnalyzerOutput> =>
  Effect.try({
    catch: (error) =>
      contractFailure(
        "Comparison Report",
        error instanceof Error ? error.message : String(error)
      ),
    try: () => decodeComparisonReport(report),
  });
