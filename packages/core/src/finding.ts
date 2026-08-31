import { Schema } from "effect";

const PositiveInt = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(1))
);

export const SeveritySchema = Schema.Literals(["error", "warning", "advice"]);
export type Severity = typeof SeveritySchema.Type;

export const CategorySchema = Schema.Literals([
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

export const ProjectRelativePathSchema = Schema.NonEmptyString.pipe(
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

const AnalyzerIdSchema = Schema.Literals([
  "effect-tsgo",
  "effect-oxlint",
  "effect-doctor",
]);

const ProvenanceSchema = Schema.Struct({
  engine: AnalyzerIdSchema,
  nativeRuleId: Schema.NonEmptyString,
});

export const FindingSchema = Schema.Struct({
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

export const AnalyzerRunSchema = Schema.Struct({
  analyzedFiles: Schema.Array(ProjectRelativePathSchema),
  complete: Schema.Boolean,
  engine: AnalyzerIdSchema,
  version: Schema.NonEmptyString,
});
export type AnalyzerRun = typeof AnalyzerRunSchema.Type;

export const FindingSummarySchema = Schema.Struct({
  advice: Schema.Natural,
  errors: Schema.Natural,
  warnings: Schema.Natural,
});
export type FindingSummary = typeof FindingSummarySchema.Type;
