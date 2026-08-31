export {
  AnalyzerFailure,
  ComparisonReportSchema,
  InvalidAnalyzerOutput,
  ProjectFailure,
  ScanReportSchema,
  compareFindings,
  compareProjects,
  knownRules,
  scanProject,
} from "@effect-doctor/api";
export type {
  AnalyzerRun,
  CompareRequest,
  ComparisonReport,
  DoctorFailure,
  Finding,
  FindingDelta,
  FindingSummary,
  RuleMetadata,
  ScanReport,
  ScanRequest,
  ScanTarget,
} from "@effect-doctor/api";
export { isBlocked, renderComparison, renderScan } from "./render.js";
export type { BlockingThreshold, OutputFormat } from "./render.js";
