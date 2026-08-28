import type {
  ComparisonReport,
  Finding,
  FindingSummary,
  ScanReport,
} from "./model.js";

export type OutputFormat = "pretty" | "json";
export type BlockingThreshold = "error" | "warning" | "never";

const findingLine = (finding: Finding): string => {
  const { file, start } = finding.location;
  return `${file}:${start.line}:${start.column} [${finding.severity}] ${finding.ruleId} ${finding.message}`;
};

const summaryLine = (summary: FindingSummary): string =>
  `${summary.errors} error(s), ${summary.warnings} warning(s), ${summary.advice} advice finding(s)`;

export const renderScan = (
  report: ScanReport,
  format: OutputFormat
): string => {
  if (format === "json") {
    return JSON.stringify(report, null, 2);
  }

  const files = report.engines[0]?.analyzedFiles.length ?? 0;
  const details = report.findings.map(findingLine);
  return [
    `Effect Doctor analyzed ${files} file(s): ${summaryLine(report.summary)}`,
    ...details,
  ].join("\n");
};

export const renderComparison = (
  report: ComparisonReport,
  format: OutputFormat
): string => {
  if (format === "json") {
    return JSON.stringify(report, null, 2);
  }

  return [
    `Effect Doctor found ${report.introduced.length} introduced and ${report.resolved.length} resolved finding(s).`,
    ...report.introduced.map((finding) => `+ ${findingLine(finding)}`),
    ...report.resolved.map((finding) => `- ${findingLine(finding)}`),
  ].join("\n");
};

export const isBlocked = (
  findings: readonly Finding[],
  threshold: BlockingThreshold
): boolean => {
  if (threshold === "never") {
    return false;
  }
  if (threshold === "warning") {
    return findings.some(
      (finding) =>
        finding.severity === "error" || finding.severity === "warning"
    );
  }
  return findings.some((finding) => finding.severity === "error");
};
