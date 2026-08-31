export {
  ComparisonReportSchema,
  ScanReportSchema,
  compareFindings,
  knownRules,
} from "@effect-doctor/core";
export type {
  AnalyzerRun,
  ComparisonReport,
  Finding,
  FindingDelta,
  FindingSummary,
  RuleMetadata,
  ScanReport,
  ScanTarget,
} from "@effect-doctor/core";
export { compareProjects } from "./compare.js";
export type { CompareRequest } from "./compare.js";
export {
  AnalyzerFailure,
  InvalidAnalyzerOutput,
  ProjectFailure,
} from "./errors.js";
export type { DoctorFailure } from "./errors.js";
export { scanProject } from "./scan.js";
export type { ScanRequest } from "./scan.js";
