export { compareFindings } from "./delta.js";
export { compareProjects, type CompareRequest } from "./compare.js";
export {
  AnalyzerFailure,
  InvalidAnalyzerOutput,
  ProjectFailure,
  type DoctorFailure,
} from "./errors.js";
export type {
  ComparisonReport,
  EngineRun,
  Finding,
  FindingDelta,
  FindingSummary,
  ProviderReceipt,
  ScanReport,
} from "./model.js";
export { ComparisonReportSchema, ScanReportSchema } from "./model.js";
export { knownRules, type RuleMetadata } from "./rules.js";
export {
  isBlocked,
  renderComparison,
  renderScan,
  type BlockingThreshold,
  type OutputFormat,
} from "./render.js";
export { scanProject, type ScanRequest } from "./scan.js";
