import { Schema } from "effect";

import {
  ApplicabilityReportSchema,
  decideRuleApplicability,
} from "./applicability.js";
import { compareFindings } from "./delta.js";
import {
  AnalyzerRunSchema,
  FindingSchema,
  FindingSummarySchema,
  ProjectRelativePathSchema,
} from "./finding.js";
import type { Finding, Severity } from "./finding.js";
import { fingerprintFinding } from "./fingerprint.js";
import { compareFindingOrder } from "./internal/finding-order.js";
import { compareCodeUnits } from "./internal/order.js";
import { ScanPolicySchema } from "./policy.js";
import type { ScanPolicy } from "./policy.js";
import { knownRules } from "./rules.js";
import type { RuleMetadata } from "./rules.js";

const ScanTargetWire = Schema.Struct({
  entry: ProjectRelativePathSchema,
  projects: Schema.Array(ProjectRelativePathSchema),
});

const ScanTargetSchema = ScanTargetWire.check(
  Schema.makeFilter((target) => {
    if (
      target.projects.length > 0 &&
      new Set(target.projects).size === target.projects.length &&
      isOrdered(target.projects, compareCodeUnits) &&
      target.projects.includes(target.entry)
    ) {
      return [];
    }
    return [
      "Scan target projects must be non-empty, unique, ordered, and contain the entry",
    ];
  })
);

export type ScanTarget = typeof ScanTargetSchema.Type;

const ScanReportWire = Schema.Struct({
  applicability: ApplicabilityReportSchema,
  doctorVersion: Schema.NonEmptyString,
  engines: Schema.Array(AnalyzerRunSchema),
  findings: Schema.Array(FindingSchema),
  kind: Schema.Literal("scan"),
  policy: ScanPolicySchema,
  root: Schema.Literal("."),
  schema: Schema.Literal("effect-doctor/scan/v1"),
  summary: FindingSummarySchema,
  target: ScanTargetSchema,
  toolchain: Schema.Struct({
    effect: Schema.NonEmptyString,
    oxlint: Schema.NonEmptyString,
    tsgo: Schema.NonEmptyString,
    typescript: Schema.NonEmptyString,
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

const analyzerRunIssues = (report: ScanReportWire): Schema.FilterIssue[] => {
  const issues: Schema.FilterIssue[] = [];
  const analyzers = report.engines.map((run) => run.engine);
  if (!sameStrings(analyzers, ["effect-doctor", "effect-tsgo"])) {
    issues.push("Scan report must contain each Analyzer Run exactly once");
  }
  if (report.engines.some((run) => !run.complete)) {
    issues.push("Every Analyzer Run must be complete");
  }
  const inventory = report.engines.at(0)?.analyzedFiles;
  if (
    inventory === undefined ||
    inventory.length === 0 ||
    new Set(inventory).size !== inventory.length ||
    !isOrdered(inventory, compareCodeUnits) ||
    report.engines.some((run) => !sameStrings(run.analyzedFiles, inventory))
  ) {
    issues.push("Analyzer Runs must prove one identical file inventory");
  }
  return issues;
};

const findingIssues = (report: ScanReportWire): Schema.FilterIssue[] => {
  const issues: Schema.FilterIssue[] = [];
  const inventory = new Set(report.engines.at(0)?.analyzedFiles);
  if (
    report.findings.some((finding) => !inventory.has(finding.location.file))
  ) {
    issues.push("Every Finding must belong to the analyzed file inventory");
  }
  if (
    report.findings.some((finding) => {
      const { fingerprint: _fingerprint, ...withoutFingerprint } = finding;
      return fingerprintFinding(withoutFingerprint) !== finding.fingerprint;
    })
  ) {
    issues.push("Every Finding fingerprint must match its canonical content");
  }
  if (!isOrdered(report.findings, compareFindingOrder)) {
    issues.push("Scan Findings must use canonical order");
  }
  return issues;
};

const versionIssues = (report: ScanReportWire): Schema.FilterIssue[] => {
  const versions = new Map(
    report.engines.map((run) => [run.engine, run.version])
  );
  if (
    versions.get("effect-doctor") !== report.doctorVersion ||
    versions.get("effect-tsgo") !== report.toolchain.tsgo
  ) {
    return ["Analyzer Run versions must match the report toolchain"];
  }
  return [];
};

const summaryIssues = (report: ScanReportWire): Schema.FilterIssue[] => {
  const count = (severity: Severity): number =>
    report.findings.filter((finding) => finding.severity === severity).length;
  if (
    report.summary.errors === count("error") &&
    report.summary.warnings === count("warning")
  ) {
    return [];
  }
  return ["Scan summary must match emitted Findings"];
};

const ruleIndex = (): ReadonlyMap<string, RuleMetadata> =>
  new Map(
    knownRules().map((rule): readonly [string, RuleMetadata] => [rule.id, rule])
  );

const inventoryIssues = (report: ScanReportWire): Schema.FilterIssue[] => {
  const inventory = report.engines.at(0)?.analyzedFiles ?? [];
  const profileFiles = report.applicability.files.map(
    (profile) => profile.file
  );
  return sameStrings(inventory, profileFiles)
    ? []
    : ["Applicability profiles must match the Analyzer Run inventory exactly"];
};

const notApplicableIssues = (report: ScanReportWire): Schema.FilterIssue[] => {
  const issues: Schema.FilterIssue[] = [];
  const { groups, total } = report.applicability.notApplicable;
  const groupRuleIds = groups.map((group) => group.ruleId);
  if (
    new Set(groupRuleIds).size !== groupRuleIds.length ||
    !isOrdered(groupRuleIds, compareCodeUnits)
  ) {
    issues.push("Not-applicable groups must be unique and canonically ordered");
  }
  if (groups.reduce((sum, group) => sum + group.count, 0) !== total) {
    issues.push("Not-applicable group counts must equal their total");
  }
  if (
    report.findings.length + total !==
    report.applicability.normalizedDiagnosticCount
  ) {
    issues.push(
      "Applicable and not-applicable diagnostics must equal the normalized diagnostic count"
    );
  }
  const rules = ruleIndex();
  if (
    groups.some(
      (group) =>
        rules.get(group.ruleId)?.applicability !== "direct-effect-module"
    )
  ) {
    issues.push("Not-applicable groups must name direct-Effect-module rules");
  }
  if (
    groups.length > 0 &&
    report.applicability.files.every(
      (profile) => profile.directEffectModuleReference
    )
  ) {
    issues.push(
      "Not-applicable diagnostics require a source without a direct Effect module reference"
    );
  }
  return issues;
};

const findingApplicabilityIssues = (
  report: ScanReportWire
): Schema.FilterIssue[] => {
  const rules = ruleIndex();
  const sourceByFile = new Map(
    report.applicability.files.map((profile) => [profile.file, profile])
  );
  const outsidePolicy = report.findings.some((finding) => {
    const rule = rules.get(finding.ruleId);
    const source = sourceByFile.get(finding.location.file);
    return (
      rule === undefined ||
      source === undefined ||
      !decideRuleApplicability(rule, source).applicable
    );
  });
  return outsidePolicy
    ? ["Every emitted Finding must satisfy its rule applicability"]
    : [];
};

const applicabilityIssues = (report: ScanReportWire): Schema.FilterIssue[] => [
  ...inventoryIssues(report),
  ...notApplicableIssues(report),
  ...findingApplicabilityIssues(report),
];

export const ScanReportSchema = ScanReportWire.check(
  Schema.makeFilter((report) => [
    ...analyzerRunIssues(report),
    ...findingIssues(report),
    ...applicabilityIssues(report),
    ...versionIssues(report),
    ...summaryIssues(report),
  ])
);
export type ScanReport = typeof ScanReportSchema.Type;

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

const comparisonTargetIssues = (
  report: ComparisonReportWire
): Schema.FilterIssue[] =>
  report.baseline.target.entry === report.candidate.target.entry
    ? []
    : ["Comparison scan targets must use the same entry project"];

const samePolicy = (left: ScanPolicy, right: ScanPolicy): boolean =>
  left.activeRuleCount === right.activeRuleCount &&
  left.digest === right.digest &&
  left.id === right.id &&
  left.revision === right.revision;

const comparisonPolicyIssues = (
  report: ComparisonReportWire
): Schema.FilterIssue[] =>
  samePolicy(report.baseline.policy, report.candidate.policy)
    ? []
    : ["Comparison scan policies must agree"];

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
    return ["Comparison delta must partition baseline and candidate Findings"];
  }
  return [];
};

export const ComparisonReportSchema = ComparisonReportWire.check(
  Schema.makeFilter((report) => [
    ...comparisonVersionIssues(report),
    ...comparisonPolicyIssues(report),
    ...comparisonTargetIssues(report),
    ...comparisonDeltaIssues(report),
  ])
);
export type ComparisonReport = typeof ComparisonReportSchema.Type;
