import type {
  ComparisonReport,
  Finding,
  FindingSummary,
  ScanReport,
} from "@effect-doctor/api";

import { posixArgument } from "./internal/posix-argument.js";

export type OutputFormat = "pretty" | "json" | "agent";
export type BlockingThreshold = "error" | "warning" | "never";

const groupFindingsByRule = (
  findings: readonly Finding[]
): readonly (readonly [string, readonly Finding[]])[] => {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    const group = groups.get(finding.ruleId) ?? [];
    group.push(finding);
    groups.set(finding.ruleId, group);
  }
  return [...groups.entries()];
};

const renderAgentHandoff = (
  findings: readonly Finding[],
  analyzerVersions: readonly string[],
  rerunCommand: string
): string => {
  const lines = [
    "Effect Doctor agent handoff (Effect v4)",
    `Analyzer Runs complete: ${analyzerVersions.join(", ")}`,
    `Findings: ${findings.length}`,
    "",
    "Fix each root cause while preserving project behavior.",
    "Do not suppress rules or weaken the analyzer configuration.",
  ];

  for (const [ruleId, group] of groupFindingsByRule(findings)) {
    const [first] = group;
    if (first === undefined) {
      continue;
    }
    lines.push("", `## ${ruleId} [${first.severity}]`, first.title);
    for (const finding of group) {
      const { file, start } = finding.location;
      lines.push(
        "",
        `${file}:${start.line}:${start.column}`,
        `Message: ${finding.message}`,
        `Fingerprint: ${finding.fingerprint}`
      );
    }
  }

  lines.push("", `Rerun: ${rerunCommand}`);
  return lines.join("\n");
};

const findingLine = (finding: Finding): string => {
  const { file, start } = finding.location;
  return `${file}:${start.line}:${start.column} [${finding.severity}] ${finding.ruleId} ${finding.message}`;
};

const summaryLine = (summary: FindingSummary): string =>
  `${summary.errors} error(s), ${summary.warnings} warning(s), ${summary.advice} advice finding(s)`;

export const renderScan = (
  report: ScanReport,
  format: OutputFormat,
  rerunCommand?: string
): string => {
  if (format === "json") {
    return JSON.stringify(report, null, 2);
  }
  if (format === "agent") {
    return renderAgentHandoff(
      report.findings,
      report.engines.map((run) => `${run.engine}@${run.version}`),
      rerunCommand ??
        `effect-doctor '.' --project=${posixArgument(report.target.entry)} --format agent --blocking never`
    );
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
  format: OutputFormat,
  rerunCommand?: string
): string => {
  if (format === "json") {
    return JSON.stringify(report, null, 2);
  }
  if (format === "agent") {
    return renderAgentHandoff(
      report.introduced,
      report.candidate.engines.map((run) => `${run.engine}@${run.version}`),
      rerunCommand ??
        `effect-doctor compare 'baseline' 'candidate' --project=${posixArgument(report.candidate.target.entry)} --format agent --blocking never`
    );
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
