export {
  AnalyzerFailure,
  ApplicabilityReportSchema,
  ComparisonReportSchema,
  InvalidAnalyzerOutput,
  ProjectFailure,
  SCAN_POLICY,
  ScanPolicySchema,
  ScanReportSchema,
  compareFindings,
  compareProjects,
  knownRules,
  scanProject,
} from "@effect-doctor/api";
export type {
  ApplicabilityReport,
  AnalyzerRun,
  CompareRequest,
  ComparisonReport,
  DoctorFailure,
  Finding,
  FindingDelta,
  FindingSummary,
  RuleMetadata,
  ScanPolicy,
  ScanReport,
  ScanRequest,
  ScanTarget,
} from "@effect-doctor/api";
export { isBlocked, renderComparison, renderScan } from "./render.js";
export type { BlockingThreshold, OutputFormat } from "./render.js";
