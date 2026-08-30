import { Schema } from "effect";

const PositiveInt = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(1))
);

const OxlintSpanSchema = Schema.Struct({
  column: PositiveInt,
  length: Schema.Natural,
  line: PositiveInt,
  offset: Schema.Natural,
});

const OxlintLabelSchema = Schema.Struct({
  span: OxlintSpanSchema,
});

const OxlintDiagnosticSchema = Schema.Struct({
  code: Schema.NonEmptyString,
  filename: Schema.NonEmptyString,
  labels: Schema.NonEmptyArray(OxlintLabelSchema),
  message: Schema.NonEmptyString,
  severity: Schema.Literals(["error", "warning"]),
});

const OxlintOutputWire = Schema.Struct({
  diagnostics: Schema.Array(OxlintDiagnosticSchema),
  number_of_files: Schema.Natural,
  number_of_rules: Schema.Natural,
  start_time: Schema.Finite,
  threads_count: Schema.Natural,
});

const makeOxlintOutputSchema = (
  plannedFileCount: number,
  plannedRuleCount?: number
) =>
  OxlintOutputWire.check(
    Schema.makeFilter((output) => {
      const issues: Schema.FilterIssue[] = [];
      if (output.number_of_files !== plannedFileCount) {
        issues.push(
          `Oxlint number_of_files must equal planned file count ${plannedFileCount}`
        );
      }
      if (
        plannedRuleCount !== undefined &&
        output.number_of_rules !== plannedRuleCount
      ) {
        issues.push(
          `Oxlint number_of_rules must equal planned rule count ${plannedRuleCount}`
        );
      }
      return issues;
    })
  );

export type OxlintOutput = typeof OxlintOutputWire.Type;
export type OxlintDiagnostic = typeof OxlintDiagnosticSchema.Type;

export const decodeOxlintOutput = (
  input: string,
  plannedFileCount: number,
  plannedRuleCount?: number
): OxlintOutput => {
  const JsonSchema = Schema.fromJsonString(
    makeOxlintOutputSchema(plannedFileCount, plannedRuleCount)
  );

  return Schema.decodeSync(JsonSchema)(input);
};
