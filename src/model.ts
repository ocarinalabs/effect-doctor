import { Schema } from "effect";

import { compareFindings } from "./delta.js";
import { fingerprintFinding } from "./fingerprint.js";
import { compareFindingOrder } from "./internal/finding-order.js";
import { compareCodeUnits } from "./internal/order.js";

const PositiveInt = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(1))
);

const SeveritySchema = Schema.Literals(["error", "warning", "advice"]);
export type Severity = typeof SeveritySchema.Type;

const CategorySchema = Schema.Literals([
  "correctness",
  "antipattern",
  "effect-native",
  "style",
  "security",
  "resource-safety",
]);
export type Category = typeof CategorySchema.Type;

const PositionSchema = Schema.Struct({
  column: PositiveInt,
  line: PositiveInt,
});

const isProjectRelativePath = (file: string): boolean =>
  !file.startsWith("/") &&
  !file.startsWith("\\") &&
  !/^[A-Za-z]:/u.test(file) &&
  !file.includes("\\") &&
  file
    .split("/")
    .every((segment) => segment !== "" && segment !== "." && segment !== "..");

const ProjectRelativePathSchema = Schema.NonEmptyString.pipe(
  Schema.check(
    Schema.makeFilter((file) =>
      isProjectRelativePath(file)
        ? []
        : ["File paths must be normalized project-relative POSIX paths"]
    )
  )
);

const SourceSpanWire = Schema.Struct({
  end: PositionSchema,
  file: ProjectRelativePathSchema,
  start: PositionSchema,
});
const SourceSpanSchema = SourceSpanWire.check(
  Schema.makeFilter((span) => {
    if (
      span.end.line > span.start.line ||
      (span.end.line === span.start.line &&
        span.end.column >= span.start.column)
    ) {
      return [];
    }
    return ["Finding end position must not precede its start position"];
  })
);
const ProvenanceSchema = Schema.Struct({
  engine: Schema.Literals(["effect-tsgo", "effect-oxlint", "effect-doctor"]),
  nativeRuleId: Schema.NonEmptyString,
});
const FindingSchema = Schema.Struct({
  category: CategorySchema,
  evidence: Schema.String,
  fingerprint: Schema.NonEmptyString,
  location: SourceSpanSchema,
  message: Schema.NonEmptyString,
  provenance: ProvenanceSchema,
  ruleId: Schema.NonEmptyString,
  severity: SeveritySchema,
  title: Schema.NonEmptyString,
});
export type Finding = typeof FindingSchema.Type;

export type FindingWithoutFingerprint = Omit<Finding, "fingerprint">;

const ProviderReceiptSchema = Schema.Struct({
  analyzedFiles: Schema.Array(ProjectRelativePathSchema),
  complete: Schema.Boolean,
  engine: ProvenanceSchema.fields.engine,
  version: Schema.NonEmptyString,
});
export type ProviderReceipt = typeof ProviderReceiptSchema.Type;
export type EngineRun = ProviderReceipt;

const FindingSummarySchema = Schema.Struct({
  advice: Schema.Natural,
  errors: Schema.Natural,
  warnings: Schema.Natural,
});
export type FindingSummary = typeof FindingSummarySchema.Type;

const ScanReportWire = Schema.Struct({
  doctorVersion: Schema.NonEmptyString,
  engines: Schema.Array(ProviderReceiptSchema),
  findings: Schema.Array(FindingSchema),
  kind: Schema.Literal("scan"),
  root: Schema.Literal("."),
  schema: Schema.Literal("effect-doctor/scan/v1"),
  summary: FindingSummarySchema,
  toolchain: Schema.Struct({
    effect: Schema.NonEmptyString,
    tsgo: Schema.NonEmptyString,
    typescript: Schema.NonEmptyString,
    oxlint: Schema.NonEmptyString,
    effectOxlint: Schema.NonEmptyString,
  }),
});

type ScanReportWire = typeof ScanReportWire.Type;

const sameStrings = (
  left: readonly string[],
  right: readonly string[]
): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const isOrdered = <A>(
  values: readonly A[],
  compare: (left: A, right: A) => number
): boolean =>
  values.every((value, index) => {
    if (index === 0) {
      return true;
    }
    const previous = values[index - 1];
    return previous !== undefined && compare(previous, value) <= 0;
  });

const receiptIssues = (report: ScanReportWire): Schema.FilterIssue[] => {
  const issues: Schema.FilterIssue[] = [];
  const engines = report.engines.map((receipt) => receipt.engine);
  if (
    !sameStrings(engines, ["effect-doctor", "effect-oxlint", "effect-tsgo"])
  ) {
    issues.push("Scan report must contain each provider receipt exactly once");
  }
  if (report.engines.some((receipt) => !receipt.complete)) {
    issues.push("Every provider receipt must be complete");
  }
  const inventory = report.engines.at(0)?.analyzedFiles;
  if (
    inventory === undefined ||
    inventory.length === 0 ||
    new Set(inventory).size !== inventory.length ||
    !isOrdered(inventory, compareCodeUnits) ||
    report.engines.some(
      (receipt) => !sameStrings(receipt.analyzedFiles, inventory)
    )
  ) {
    issues.push("Provider receipts must prove one identical file inventory");
  }
  return issues;
};

const findingIssues = (report: ScanReportWire): Schema.FilterIssue[] => {
  const issues: Schema.FilterIssue[] = [];
  const inventory = new Set(report.engines.at(0)?.analyzedFiles);
  if (
    report.findings.some((finding) => !inventory.has(finding.location.file))
  ) {
    issues.push("Every finding must belong to the analyzed file inventory");
  }
  if (
    report.findings.some((finding) => {
      const { fingerprint: _fingerprint, ...withoutFingerprint } = finding;
      return fingerprintFinding(withoutFingerprint) !== finding.fingerprint;
    })
  ) {
    issues.push("Every finding fingerprint must match its canonical content");
  }
  if (!isOrdered(report.findings, compareFindingOrder)) {
    issues.push("Scan findings must use canonical order");
  }
  return issues;
};

const versionIssues = (report: ScanReportWire): Schema.FilterIssue[] => {
  const versions = new Map(
    report.engines.map((receipt) => [receipt.engine, receipt.version])
  );
  if (
    versions.get("effect-doctor") !== report.doctorVersion ||
    versions.get("effect-oxlint") !== report.toolchain.effectOxlint ||
    versions.get("effect-tsgo") !== report.toolchain.tsgo
  ) {
    return ["Provider receipt versions must match the report toolchain"];
  }
  return [];
};

const summaryIssues = (report: ScanReportWire): Schema.FilterIssue[] => {
  const count = (severity: Severity): number =>
    report.findings.filter((finding) => finding.severity === severity).length;
  if (
    report.summary.advice === count("advice") &&
    report.summary.errors === count("error") &&
    report.summary.warnings === count("warning")
  ) {
    return [];
  }
  return ["Scan summary must match emitted findings"];
};

export const ScanReportSchema = ScanReportWire.check(
  Schema.makeFilter((report) => [
    ...receiptIssues(report),
    ...findingIssues(report),
    ...versionIssues(report),
    ...summaryIssues(report),
  ])
);
export type ScanReport = typeof ScanReportSchema.Type;

export type FindingPair = {
  readonly baseline: Finding;
  readonly candidate: Finding;
};

export type FindingDelta = {
  readonly introduced: readonly Finding[];
  readonly resolved: readonly Finding[];
  readonly unchanged: readonly FindingPair[];
};

const ComparisonReportWire = Schema.Struct({
  baseline: ScanReportSchema,
  candidate: ScanReportSchema,
  doctorVersion: Schema.NonEmptyString,
  introduced: Schema.Array(FindingSchema),
  kind: Schema.Literal("comparison"),
  resolved: Schema.Array(FindingSchema),
  schema: Schema.Literal("effect-doctor/comparison/v1"),
  unchangedCount: Schema.Natural,
});

type ComparisonReportWire = typeof ComparisonReportWire.Type;

const sameFindingIdentity = (left: Finding, right: Finding): boolean =>
  left.fingerprint === right.fingerprint &&
  left.location.file === right.location.file &&
  left.location.start.line === right.location.start.line &&
  left.location.start.column === right.location.start.column &&
  left.location.end.line === right.location.end.line &&
  left.location.end.column === right.location.end.column;

const sameFinding = (left: Finding, right: Finding): boolean =>
  sameFindingIdentity(left, right) &&
  left.category === right.category &&
  left.evidence === right.evidence &&
  left.message === right.message &&
  left.provenance.engine === right.provenance.engine &&
  left.provenance.nativeRuleId === right.provenance.nativeRuleId &&
  left.ruleId === right.ruleId &&
  left.severity === right.severity &&
  left.title === right.title;

const sameFindings = (
  left: readonly Finding[],
  right: readonly Finding[]
): boolean =>
  left.length === right.length &&
  left.every((finding, index) => {
    const candidate = right[index];
    return candidate !== undefined && sameFinding(finding, candidate);
  });

const comparisonVersionIssues = (
  report: ComparisonReportWire
): Schema.FilterIssue[] => {
  if (
    report.doctorVersion === report.baseline.doctorVersion &&
    report.doctorVersion === report.candidate.doctorVersion
  ) {
    return [];
  }
  return ["Comparison and scan doctor versions must agree"];
};

const comparisonDeltaIssues = (
  report: ComparisonReportWire
): Schema.FilterIssue[] => {
  const expected = compareFindings(
    report.baseline.findings,
    report.candidate.findings
  );
  if (
    report.unchangedCount !== expected.unchanged.length ||
    !sameFindings(report.introduced, expected.introduced) ||
    !sameFindings(report.resolved, expected.resolved)
  ) {
    return ["Comparison delta must partition baseline and candidate findings"];
  }
  return [];
};

export const ComparisonReportSchema = ComparisonReportWire.check(
  Schema.makeFilter((report) => [
    ...comparisonVersionIssues(report),
    ...comparisonDeltaIssues(report),
  ])
);
export type ComparisonReport = typeof ComparisonReportSchema.Type;
