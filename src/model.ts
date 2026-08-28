import { Schema } from "effect";

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
const SourceSpanSchema = Schema.Struct({
  end: PositionSchema,
  file: Schema.NonEmptyString,
  start: PositionSchema,
});
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
  analyzedFiles: Schema.Array(Schema.NonEmptyString),
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

export const ScanReportSchema = Schema.Struct({
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

export const ComparisonReportSchema = Schema.Struct({
  baseline: ScanReportSchema,
  candidate: ScanReportSchema,
  doctorVersion: Schema.NonEmptyString,
  introduced: Schema.Array(FindingSchema),
  kind: Schema.Literal("comparison"),
  resolved: Schema.Array(FindingSchema),
  schema: Schema.Literal("effect-doctor/comparison/v1"),
  unchangedCount: Schema.Natural,
});
export type ComparisonReport = typeof ComparisonReportSchema.Type;
