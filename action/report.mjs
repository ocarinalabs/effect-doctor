import { createHash } from "node:crypto";
import path from "node:path";

const targetPath = (directory, targetEntry) =>
  directory === "." ? targetEntry : `${directory}/${targetEntry}`;

const identity = (directory, targetEntry) =>
  createHash("sha256")
    .update(`${directory}\0${targetEntry}`)
    .digest("hex")
    .slice(0, 12);

export const commentMarker = (directory, targetEntry) =>
  `<!-- effect-doctor-action:${identity(directory, targetEntry)} -->`;
export const reviewMarker = (directory, targetEntry) =>
  `<!-- effect-doctor-review:${identity(directory, targetEntry)} -->`;
export const statusContext = (directory, targetEntry) =>
  `Effect Doctor (${targetPath(directory, targetEntry)} · ${identity(directory, targetEntry)})`;

const severities = ["error", "warning"];
const categories = new Set([
  "correctness",
  "antipattern",
  "effect-native",
  "style",
  "security",
  "resource-safety",
]);
const analyzerIds = ["effect-doctor", "effect-tsgo"];

const isNonEmptyString = (value) =>
  typeof value === "string" && value.length > 0;

const isNatural = (value) => Number.isInteger(value) && value >= 0;

const isPositiveInteger = (value) => Number.isInteger(value) && value >= 1;

const sameValues = (left, right) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const isUnique = (values) => new Set(values).size === values.length;

const isRecord = (value) => typeof value === "object" && value !== null;

const isProjectPath = (value) =>
  isNonEmptyString(value) &&
  !value.startsWith("/") &&
  !value.startsWith("\\") &&
  !/^[A-Za-z]:/u.test(value) &&
  !value.includes("\\") &&
  value
    .split("/")
    .every((segment) => segment !== "" && segment !== "." && segment !== "..");

const invalidScanReport = () =>
  new Error("Effect Doctor returned an invalid Scan Report");

const invalidComparisonReport = () =>
  new Error("Effect Doctor returned an invalid Comparison Report");

const parseTarget = (target) => {
  if (
    !isProjectPath(target?.entry) ||
    !Array.isArray(target.projects) ||
    !target.projects.every(isProjectPath) ||
    !target.projects.includes(target.entry) ||
    !isUnique(target.projects)
  ) {
    throw new Error("Effect Doctor returned an invalid project target");
  }
  return target;
};

const parsePolicy = (policy) => {
  if (
    !isPositiveInteger(policy?.activeRuleCount) ||
    !isNonEmptyString(policy.id) ||
    !isPositiveInteger(policy.revision) ||
    typeof policy.digest !== "string" ||
    !/^[0-9a-f]{64}$/u.test(policy.digest)
  ) {
    throw new Error("Effect Doctor returned an invalid scan policy");
  }
  return policy;
};

const samePolicy = (left, right) =>
  left.activeRuleCount === right.activeRuleCount &&
  left.digest === right.digest &&
  left.id === right.id &&
  left.revision === right.revision;

const areSourceProfilesValid = (files) =>
  Array.isArray(files) &&
  files.length > 0 &&
  files.every(
    (profile) =>
      isProjectPath(profile?.file) &&
      typeof profile.directEffectModuleReference === "boolean"
  ) &&
  isUnique(files.map((profile) => profile.file));

const areNotApplicableGroupsValid = (groups) =>
  Array.isArray(groups) &&
  groups.every(
    (group) =>
      isPositiveInteger(group?.count) &&
      group.reason === "missing-direct-effect-module-reference" &&
      isNonEmptyString(group.ruleId)
  ) &&
  isUnique(groups.map((group) => group.ruleId));

const isApplicabilityShape = (applicability) =>
  isRecord(applicability) &&
  areSourceProfilesValid(applicability.files) &&
  isRecord(applicability.notApplicable) &&
  areNotApplicableGroupsValid(applicability.notApplicable.groups) &&
  isNatural(applicability.notApplicable.total) &&
  isNatural(applicability.normalizedDiagnosticCount);

const isApplicabilityConsistent = (applicability, findings) => {
  const { files, normalizedDiagnosticCount, notApplicable } = applicability;
  const groupedTotal = notApplicable.groups.reduce(
    (sum, group) => sum + group.count,
    0
  );
  const sourceFiles = new Set(files.map((profile) => profile.file));
  return (
    groupedTotal === notApplicable.total &&
    normalizedDiagnosticCount === findings.length + notApplicable.total &&
    findings.every((finding) => sourceFiles.has(finding.location.file))
  );
};

const parseApplicability = (applicability, findings) => {
  if (
    !isApplicabilityShape(applicability) ||
    !isApplicabilityConsistent(applicability, findings)
  ) {
    throw new Error("Effect Doctor returned an invalid applicability receipt");
  }
  return applicability;
};

const isPosition = (position) =>
  isPositiveInteger(position?.column) && isPositiveInteger(position?.line);

const isValidSpan = (location) =>
  isProjectPath(location?.file) &&
  isPosition(location?.start) &&
  isPosition(location?.end) &&
  (location.end.line > location.start.line ||
    (location.end.line === location.start.line &&
      location.end.column >= location.start.column));

const FINDING_CHECKS = [
  (finding) => categories.has(finding.category),
  (finding) => typeof finding.evidence === "string",
  (finding) => isNonEmptyString(finding.fingerprint),
  (finding) => isValidSpan(finding.location),
  (finding) => isNonEmptyString(finding.message),
  (finding) => analyzerIds.includes(finding.provenance?.engine),
  (finding) => isNonEmptyString(finding.provenance?.nativeRuleId),
  (finding) => isNonEmptyString(finding.ruleId),
  (finding) => severities.includes(finding.severity),
  (finding) => isNonEmptyString(finding.title),
];

const assertFinding = (finding) => {
  if (!isRecord(finding) || !FINDING_CHECKS.every((check) => check(finding))) {
    throw invalidScanReport();
  }
};

const parseAnalyzerRuns = (runs) => {
  if (
    !Array.isArray(runs) ||
    !sameValues(
      runs.map((run) => run?.engine),
      analyzerIds
    )
  ) {
    throw invalidScanReport();
  }
  const inventory = runs[0]?.analyzedFiles;
  if (
    !Array.isArray(inventory) ||
    inventory.length === 0 ||
    !inventory.every(isProjectPath) ||
    !isUnique(inventory) ||
    runs.some(
      (run) =>
        run?.complete !== true ||
        !isNonEmptyString(run.version) ||
        !Array.isArray(run.analyzedFiles) ||
        !sameValues(run.analyzedFiles, inventory)
    )
  ) {
    throw invalidScanReport();
  }
  return inventory;
};

const parseToolchain = (toolchain) => {
  if (
    !isNonEmptyString(toolchain?.effect) ||
    !isNonEmptyString(toolchain?.oxlint) ||
    !isNonEmptyString(toolchain?.tsgo) ||
    !isNonEmptyString(toolchain?.typescript)
  ) {
    throw invalidScanReport();
  }
  return toolchain;
};

const parseSummary = (summary, findings) => {
  const count = (severity) =>
    findings.filter((finding) => finding.severity === severity).length;
  if (
    !isNatural(summary?.errors) ||
    !isNatural(summary?.warnings) ||
    summary.errors !== count("error") ||
    summary.warnings !== count("warning")
  ) {
    throw invalidScanReport();
  }
};

const SCAN_HEADER_CHECKS = [
  (report) => report.schema === "effect-doctor/scan/v1",
  (report) => report.kind === "scan",
  (report) => report.root === ".",
  (report) => isNonEmptyString(report.doctorVersion),
  (report) => Array.isArray(report.findings),
];

const assertScanVersions = (report, toolchain) => {
  const versions = Object.fromEntries(
    report.engines.map((run) => [run.engine, run.version])
  );
  if (
    versions["effect-doctor"] !== report.doctorVersion ||
    versions["effect-tsgo"] !== toolchain.tsgo
  ) {
    throw invalidScanReport();
  }
};

const parseScanReport = (report) => {
  if (
    !isRecord(report) ||
    !SCAN_HEADER_CHECKS.every((check) => check(report))
  ) {
    throw invalidScanReport();
  }
  const target = parseTarget(report.target);
  const policy = parsePolicy(report.policy);
  const inventory = parseAnalyzerRuns(report.engines);
  for (const finding of report.findings) {
    assertFinding(finding);
  }
  if (
    report.findings.some(
      (finding) => !inventory.includes(finding.location.file)
    )
  ) {
    throw invalidScanReport();
  }
  const applicability = parseApplicability(
    report.applicability,
    report.findings
  );
  if (
    !sameValues(
      applicability.files.map((profile) => profile.file),
      inventory
    )
  ) {
    throw invalidScanReport();
  }
  const toolchain = parseToolchain(report.toolchain);
  assertScanVersions(report, toolchain);
  parseSummary(report.summary, report.findings);
  return { applicability, policy, report, target, toolchain };
};

const COMPARISON_HEADER_CHECKS = [
  (report) => report.schema === "effect-doctor/comparison/v1",
  (report) => report.kind === "comparison",
  (report) => isNonEmptyString(report.doctorVersion),
  (report) => Array.isArray(report.introduced),
  (report) => Array.isArray(report.resolved),
  (report) => isNatural(report.unchangedCount),
];

const assertComparableScans = (report, baseline, candidate) => {
  if (
    report.doctorVersion !== baseline.report.doctorVersion ||
    report.doctorVersion !== candidate.report.doctorVersion
  ) {
    throw invalidComparisonReport();
  }
  if (!samePolicy(baseline.policy, candidate.policy)) {
    throw new Error("Effect Doctor compared different scan policies");
  }
  if (baseline.target.entry !== candidate.target.entry) {
    throw new Error("Effect Doctor compared different project targets");
  }
};

const parseComparisonReport = (report) => {
  if (
    !isRecord(report) ||
    !COMPARISON_HEADER_CHECKS.every((check) => check(report))
  ) {
    throw invalidComparisonReport();
  }
  const baseline = parseScanReport(report.baseline);
  const candidate = parseScanReport(report.candidate);
  assertComparableScans(report, baseline, candidate);
  for (const finding of [...report.introduced, ...report.resolved]) {
    assertFinding(finding);
  }
  if (
    report.introduced.length > candidate.report.findings.length ||
    report.resolved.length > baseline.report.findings.length
  ) {
    throw invalidComparisonReport();
  }
  return { baseline, candidate, report };
};

export const parseReportShape = (source) => {
  const report = JSON.parse(source);
  if (report?.schema === "effect-doctor/scan/v1") {
    const scan = parseScanReport(report);
    return {
      applicability: scan.applicability,
      engines: report.engines,
      findings: report.findings,
      policy: scan.policy,
      report,
      resolved: [],
      target: scan.target,
      toolchain: scan.toolchain,
    };
  }
  if (report?.schema === "effect-doctor/comparison/v1") {
    const comparison = parseComparisonReport(report);
    return {
      applicability: comparison.candidate.applicability,
      engines: comparison.candidate.report.engines,
      findings: report.introduced,
      policy: comparison.candidate.policy,
      report,
      resolved: report.resolved,
      target: comparison.candidate.target,
      toolchain: comparison.candidate.toolchain,
    };
  }
  throw new Error("Effect Doctor returned an unsupported report schema");
};

export const metricsFor = (findings, resolved = []) => {
  const counts = Object.fromEntries(
    severities.map((severity) => [
      severity,
      findings.filter((finding) => finding.severity === severity).length,
    ])
  );
  return {
    affectedFiles: new Set(findings.map((finding) => finding.location.file))
      .size,
    errorCount: counts.error,
    resolvedCount: resolved.length,
    totalCount: findings.length,
    warningCount: counts.warning,
  };
};

const escapeTableCell = (value) =>
  String(value).replaceAll("|", "\\|").replaceAll("\n", " ");

const findingRows = (findings, maximum = 50) =>
  findings.slice(0, maximum).map((finding) => {
    const location = `${finding.location.file}:${finding.location.start.line}`;
    return `| ${escapeTableCell(finding.severity)} | \`${escapeTableCell(
      finding.ruleId
    )}\` | ${escapeTableCell(location)} | ${escapeTableCell(
      finding.message
    )} |`;
  });

const summaryState = (result) => {
  let state = "Incomplete";
  if (result.completed) {
    state = result.blocked ? "Failed" : "Passed";
  }
  return state;
};

const summaryHeadline = (result) => {
  if (!result.completed) {
    return "The analyzers did not complete, so no result was accepted.";
  }
  const findingSuffix = result.metrics.totalCount === 1 ? "" : "s";
  const fileSuffix = result.metrics.affectedFiles === 1 ? "" : "s";
  return `${result.metrics.totalCount} finding${findingSuffix} across ${result.metrics.affectedFiles} file${fileSuffix}.`;
};

const failureLines = (result) => {
  if (result.completed) {
    return [];
  }
  if (result.errorMessage === undefined) {
    return ["", "**Failure:** Effect Doctor did not provide an error message."];
  }
  const message = String(result.errorMessage)
    .replaceAll("\n", " ")
    .slice(0, 500);
  return ["", `**Failure:** ${message}`];
};

const findingLines = (findings) => {
  if (findings.length === 0) {
    return [];
  }
  const lines = [
    "",
    "<details>",
    `<summary>Findings (${findings.length})</summary>`,
    "",
    "| Severity | Rule | Location | Message |",
    "| --- | --- | --- | --- |",
    ...findingRows(findings),
  ];
  if (findings.length > 50) {
    lines.push(
      "",
      `${findings.length - 50} additional Findings are available in the workflow log.`
    );
  }
  lines.push("", "</details>");
  return lines;
};

const receiptLines = (result) => {
  if (
    !(
      result.completed &&
      result.policy &&
      result.applicability &&
      result.engines
    )
  ) {
    return [];
  }
  const applicable =
    result.applicability.normalizedDiagnosticCount -
    result.applicability.notApplicable.total;
  return [
    "",
    `Policy: \`${result.policy.id}@${result.policy.revision}\` · digest \`${result.policy.digest}\``,
    `Analyzers: ${result.engines.map((run) => `${run.engine}@${run.version}`).join(", ")}`,
    `Target: \`${result.target.entry}\` · ${result.target.projects.length} project configuration(s)`,
    `Applicability: ${result.policy.activeRuleCount} active rules · ${applicable} findings · ${result.applicability.notApplicable.total} diagnostics not applicable.`,
  ];
};

export const renderSummary = (result) => {
  const directory = result.repositoryPrefix ?? result.directory;
  const lines = [
    commentMarker(directory, result.target.entry),
    "## Effect Doctor",
    "",
    `**${summaryState(result)}.** ${summaryHeadline(result)}`,
    "",
    "| Errors | Warnings | Resolved |",
    "| ---: | ---: | ---: |",
    `| ${result.metrics.errorCount} | ${result.metrics.warningCount} | ${result.metrics.resolvedCount} |`,
    ...receiptLines(result),
    ...failureLines(result),
    ...findingLines(result.findings),
    "",
    `_Effect Doctor ${result.doctorVersion ?? "unknown"} · ${result.scope} scope · ${targetPath(directory, result.target.entry)}_`,
  ];
  return lines.join("\n");
};

const escapeCommandData = (value) =>
  String(value)
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");

const escapeCommandProperty = (value) =>
  escapeCommandData(value).replaceAll(":", "%3A").replaceAll(",", "%2C");

export const messageCommand = (level, message) =>
  `::${level}::${escapeCommandData(message)}`;

const repositoryPath = (directory, file, workspace) => {
  const absolute = path.resolve(workspace, directory, file);
  const relative = path.relative(workspace, absolute);
  if (relative === "" || relative.startsWith(`..${path.sep}`)) {
    return file.replaceAll(path.sep, "/");
  }
  return relative.replaceAll(path.sep, "/");
};

export const annotationCommand = (finding, directory, workspace) => {
  let level = "notice";
  if (finding.severity === "error") {
    level = "error";
  } else if (finding.severity === "warning") {
    level = "warning";
  }
  const { start } = finding.location;
  const end = finding.location.end ?? start;
  const properties = [
    `file=${escapeCommandProperty(repositoryPath(directory, finding.location.file, workspace))}`,
    `line=${start.line}`,
    `col=${start.column ?? 1}`,
    `endLine=${end.line ?? start.line}`,
    `endColumn=${end.column ?? start.column ?? 1}`,
    `title=${escapeCommandProperty(`Effect Doctor: ${finding.ruleId}`)}`,
  ].join(",");
  return `::${level} ${properties}::${escapeCommandData(finding.message)}`;
};

export const statusDescription = ({ completed, metrics, scope }) => {
  if (!completed) {
    return "Analysis incomplete";
  }
  const prefix = scope === "changed" ? "Introduced" : "Found";
  return `${prefix} ${metrics.errorCount} errors, ${metrics.warningCount} warnings`;
};

export const outputValues = (result) => ({
  "affected-files": result.metrics.affectedFiles,
  "error-count": result.metrics.errorCount,
  "resolved-findings": result.metrics.resolvedCount,
  "total-findings": result.metrics.totalCount,
  "warning-count": result.metrics.warningCount,
});
