import type {
  ApplicabilityReport,
  ComparisonReport,
  Finding,
  FindingSummary,
  ScanPolicy,
  ScanReport,
} from "@effect-doctor/api";

import { posixArgument } from "./internal/posix-argument.js";

export type OutputFormat = "pretty" | "json" | "agent";

const DELETE = 0x7f;
const LAST_CONTROL = 0x1f;
const LINE_SEPARATOR = 0x20_28;
const PARAGRAPH_SEPARATOR = 0x20_29;
const NAMED_ESCAPES = new Map([
  ["\n", "\\n"],
  ["\r", "\\r"],
  ["\t", "\\t"],
]);

const isControl = (code: number): boolean =>
  code <= LAST_CONTROL ||
  code === DELETE ||
  code === LINE_SEPARATOR ||
  code === PARAGRAPH_SEPARATOR;

const escapeCharacter = (character: string, code: number): string =>
  NAMED_ESCAPES.get(character) ?? `\\u${code.toString(16).padStart(4, "0")}`;

export const printable = (text: string): string => {
  let output = "";
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    output += isControl(code) ? escapeCharacter(character, code) : character;
  }
  return output;
};

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

type AgentHandoff = {
  readonly analyzerVersions: readonly string[];
  readonly applicability: ApplicabilityReport;
  readonly applicableFindingCount: number;
  readonly findingLabel: "Findings" | "Introduced findings";
  readonly findings: readonly Finding[];
  readonly policy: ScanPolicy;
  readonly project: string;
  readonly receiptLabel: "Candidate receipt" | "Scan receipt";
  readonly rerunArguments?: readonly string[];
  readonly rerunCommand: string;
};

const renderAgentHandoff = (handoff: AgentHandoff): string => {
  const {
    analyzerVersions,
    applicability,
    applicableFindingCount,
    findingLabel,
    findings,
    policy,
    project,
    receiptLabel,
    rerunArguments,
    rerunCommand,
  } = handoff;
  const lines = [
    "Effect Doctor agent handoff (Effect v4)",
    `Analyzer Runs complete: ${analyzerVersions.join(", ")}`,
    `Project: ${printable(project)}`,
    `${findingLabel}: ${findings.length}`,
    `Policy: ${policy.id}@${policy.revision} ${policy.digest}`,
    `${receiptLabel}: ${policy.activeRuleCount} active rules; ${applicableFindingCount} applicable findings; ${applicability.notApplicable.total} diagnostics not applicable`,
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
        `${printable(file)}:${start.line}:${start.column}`,
        `Message: ${printable(finding.message)}`,
        `Fingerprint: ${finding.fingerprint}`
      );
    }
  }

  lines.push("");
  if (rerunArguments !== undefined) {
    lines.push(`Rerun arguments (JSON): ${JSON.stringify(rerunArguments)}`);
  }
  lines.push(`Rerun (POSIX shell): ${rerunCommand}`);
  return lines.join("\n");
};

const findingLine = (finding: Finding): string => {
  const { file, start } = finding.location;
  return `${printable(file)}:${start.line}:${start.column} [${finding.severity}] ${finding.ruleId} ${printable(finding.message)}`;
};

const count = (value: number, noun: string): string =>
  `${value} ${noun}${value === 1 ? "" : "s"}`;

const summaryLine = (summary: FindingSummary): string =>
  `${count(summary.errors, "error")}, ${count(summary.warnings, "warning")}`;

const applicabilityLine = (report: ScanReport): string =>
  `${report.policy.activeRuleCount} active rules, ${report.findings.length} findings, ${report.applicability.notApplicable.total} diagnostics not applicable`;

export const renderScan = (
  report: ScanReport,
  format: OutputFormat,
  rerunCommand?: string,
  rerunArguments?: readonly string[]
): string => {
  if (format === "json") {
    return JSON.stringify(report, null, 2);
  }
  if (format === "agent") {
    return renderAgentHandoff({
      analyzerVersions: report.engines.map(
        (run) => `${run.engine}@${run.version}`
      ),
      applicability: report.applicability,
      applicableFindingCount: report.findings.length,
      findingLabel: "Findings",
      findings: report.findings,
      policy: report.policy,
      project: report.target.entry,
      receiptLabel: "Scan receipt",
      rerunArguments: rerunArguments ?? [
        "effect-doctor",
        ".",
        `--project=${report.target.entry}`,
        "--format",
        "agent",
      ],
      rerunCommand:
        rerunCommand ??
        `effect-doctor '.' --project=${posixArgument(report.target.entry)} --format agent`,
    });
  }

  const files = report.engines[0]?.analyzedFiles.length ?? 0;
  const details = report.findings.map(findingLine);
  return [
    `Effect Doctor analyzed ${count(files, "file")}: ${summaryLine(report.summary)}`,
    applicabilityLine(report),
    ...details,
  ].join("\n");
};

export const renderComparison = (
  report: ComparisonReport,
  format: OutputFormat,
  rerunCommand?: string,
  rerunArguments?: readonly string[]
): string => {
  if (format === "json") {
    return JSON.stringify(report, null, 2);
  }
  if (format === "agent") {
    return renderAgentHandoff({
      analyzerVersions: report.candidate.engines.map(
        (run) => `${run.engine}@${run.version}`
      ),
      applicability: report.candidate.applicability,
      applicableFindingCount: report.candidate.findings.length,
      findingLabel: "Introduced findings",
      findings: report.introduced,
      policy: report.candidate.policy,
      project: report.candidate.target.entry,
      receiptLabel: "Candidate receipt",
      rerunArguments: rerunArguments ?? [
        "effect-doctor",
        "compare",
        "baseline",
        "candidate",
        `--project=${report.candidate.target.entry}`,
        "--format",
        "agent",
      ],
      rerunCommand:
        rerunCommand ??
        `effect-doctor compare 'baseline' 'candidate' --project=${posixArgument(report.candidate.target.entry)} --format agent`,
    });
  }

  return [
    `Effect Doctor found ${count(report.introduced.length, "introduced finding")} and ${count(report.resolved.length, "resolved finding")}.`,
    applicabilityLine(report.candidate),
    ...report.introduced.map((finding) => `+ ${findingLine(finding)}`),
    ...report.resolved.map((finding) => `- ${findingLine(finding)}`),
  ].join("\n");
};
