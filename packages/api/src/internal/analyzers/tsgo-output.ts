import { Schema } from "effect";

const PositiveInt = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(1))
);

const TsgoDiagnosticSchema = Schema.Struct({
  code: Schema.Int,
  column: PositiveInt,
  endColumn: PositiveInt,
  endLine: PositiveInt,
  file: Schema.NonEmptyString,
  length: Schema.Natural,
  line: PositiveInt,
  message: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  severity: Schema.Literals(["error", "warning", "message"]),
  start: Schema.Natural,
});

const TsgoFileSchema = Schema.Struct({
  detectedEffect: Schema.Literals(["v3", "v4", "unknown"]),
  file: Schema.NonEmptyString,
  supportedEffect: Schema.Literals(["v3", "v4"]),
});

const TsgoSummarySchema = Schema.Struct({
  errors: Schema.Natural,
  filesChecked: Schema.Natural,
  messages: Schema.Natural,
  totalFiles: Schema.Natural,
  warnings: Schema.Natural,
});

const TsgoOutputWire = Schema.Struct({
  diagnostics: Schema.Array(TsgoDiagnosticSchema),
  files: Schema.Array(TsgoFileSchema),
  summary: TsgoSummarySchema,
});

type TsgoOutputWire = typeof TsgoOutputWire.Type;

const coverageIssues = (output: TsgoOutputWire): Schema.FilterIssue[] => {
  const issues: Schema.FilterIssue[] = [];
  if (output.summary.totalFiles === 0) {
    issues.push("Effect TSGo must analyze at least one file");
  }
  if (output.summary.filesChecked !== output.summary.totalFiles) {
    issues.push("Effect TSGo filesChecked must equal totalFiles");
  }
  if (output.files.length !== output.summary.filesChecked) {
    issues.push("Effect TSGo file inventory must equal filesChecked");
  }
  return issues;
};

const summaryIssues = (output: TsgoOutputWire): Schema.FilterIssue[] => {
  const count = (severity: "error" | "warning" | "message"): number =>
    output.diagnostics.filter((diagnostic) => diagnostic.severity === severity)
      .length;
  if (
    count("error") === output.summary.errors &&
    count("warning") === output.summary.warnings &&
    count("message") === output.summary.messages
  ) {
    return [];
  }
  return ["Effect TSGo summary counts must match emitted diagnostics"];
};

const inventoryIssues = (output: TsgoOutputWire): Schema.FilterIssue[] => {
  const issues: Schema.FilterIssue[] = [];
  const inventory = new Set(output.files.map((file) => file.file));
  if (inventory.size !== output.files.length) {
    issues.push("Effect TSGo file inventory must not contain duplicates");
  }
  if (
    output.diagnostics.some((diagnostic) => !inventory.has(diagnostic.file))
  ) {
    issues.push(
      "Every Effect TSGo diagnostic file must appear in the file inventory"
    );
  }
  return issues;
};

const TsgoOutputSchema = TsgoOutputWire.check(
  Schema.makeFilter((output) => [
    ...coverageIssues(output),
    ...summaryIssues(output),
    ...inventoryIssues(output),
  ])
);

const TsgoOutputJsonSchema = Schema.fromJsonString(TsgoOutputSchema);

export type TsgoOutput = typeof TsgoOutputSchema.Type;
export type TsgoDiagnostic = typeof TsgoDiagnosticSchema.Type;

export const decodeTsgoOutput = Schema.decodeSync(TsgoOutputJsonSchema);
