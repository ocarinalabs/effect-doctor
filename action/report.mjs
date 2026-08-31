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

const severities = ["error", "warning", "advice"];

const isProjectPath = (value) =>
  typeof value === "string" &&
  value !== "." &&
  !value.includes("\\") &&
  !/^[A-Za-z]:/u.test(value) &&
  !path.posix.isAbsolute(value) &&
  !value.startsWith("../") &&
  path.posix.normalize(value) === value;

const parseTarget = (target) => {
  if (
    !isProjectPath(target?.entry) ||
    !Array.isArray(target.projects) ||
    !target.projects.every(isProjectPath) ||
    !target.projects.includes(target.entry) ||
    new Set(target.projects).size !== target.projects.length ||
    target.projects.some(
      (project, index) => index > 0 && target.projects[index - 1] >= project
    )
  ) {
    throw new Error("Effect Doctor returned an invalid project target");
  }
  return target;
};

const targetFor = (report, isComparison) => {
  const target = parseTarget(
    isComparison ? report.candidate?.target : report.target
  );
  if (
    isComparison &&
    parseTarget(report.baseline?.target).entry !== target.entry
  ) {
    throw new Error("Effect Doctor compared different project targets");
  }
  return target;
};

const assertFinding = (finding) => {
  if (
    typeof finding !== "object" ||
    finding === null ||
    !severities.includes(finding.severity) ||
    typeof finding.ruleId !== "string" ||
    typeof finding.message !== "string" ||
    typeof finding.location?.file !== "string" ||
    !Number.isInteger(finding.location?.start?.line)
  ) {
    throw new Error("Effect Doctor returned an invalid finding");
  }
};

export const parseDoctorReport = (source) => {
  const report = JSON.parse(source);
  const isScan = report?.schema === "effect-doctor/scan/v1";
  const isComparison = report?.schema === "effect-doctor/comparison/v1";
  if (!(isScan || isComparison)) {
    throw new Error("Effect Doctor returned an unsupported report schema");
  }

  const findings = isComparison ? report.introduced : report.findings;
  const resolved = isComparison ? report.resolved : [];
  const target = targetFor(report, isComparison);
  if (!(Array.isArray(findings) && Array.isArray(resolved))) {
    throw new Error("Effect Doctor returned an invalid report");
  }
  for (const finding of [...findings, ...resolved]) {
    assertFinding(finding);
  }
  return { findings, report, resolved, target };
};

export const metricsFor = (findings, resolved = []) => {
  const counts = Object.fromEntries(
    severities.map((severity) => [
      severity,
      findings.filter((finding) => finding.severity === severity).length,
    ])
  );
  return {
    adviceCount: counts.advice,
    affectedFiles: new Set(findings.map((finding) => finding.location.file))
      .size,
    errorCount: counts.error,
    resolvedCount: resolved.length,
    totalCount: findings.length,
    warningCount: counts.warning,
  };
};

export const blocks = (metrics, blocking) => {
  if (blocking === "none" || blocking === "never") {
    return false;
  }
  if (blocking === "warning") {
    return metrics.errorCount + metrics.warningCount > 0;
  }
  if (blocking === "error") {
    return metrics.errorCount > 0;
  }
  throw new Error(`Unsupported blocking threshold: ${blocking}`);
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

export const renderSummary = (result) => {
  const directory = result.repositoryPrefix ?? result.directory;
  const lines = [
    commentMarker(directory, result.target.entry),
    "## Effect Doctor",
    "",
    `**${summaryState(result)}.** ${summaryHeadline(result)}`,
    "",
    "| Errors | Warnings | Advice | Resolved |",
    "| ---: | ---: | ---: | ---: |",
    `| ${result.metrics.errorCount} | ${result.metrics.warningCount} | ${result.metrics.adviceCount} | ${result.metrics.resolvedCount} |`,
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
  return `${prefix} ${metrics.errorCount} errors, ${metrics.warningCount} warnings, ${metrics.adviceCount} advice`;
};

export const outputValues = (result) => ({
  "advice-count": result.metrics.adviceCount,
  "affected-files": result.metrics.affectedFiles,
  "error-count": result.metrics.errorCount,
  "resolved-findings": result.metrics.resolvedCount,
  "total-findings": result.metrics.totalCount,
  "warning-count": result.metrics.warningCount,
});
