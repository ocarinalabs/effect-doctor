import { Schema } from "effect";

const OxlintSpanSchema = Schema.Struct({
  column: Schema.Natural,
  length: Schema.Natural,
  line: Schema.Natural,
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

const makeOxlintOutputSchema = (plannedFileCount: number) =>
  OxlintOutputWire.check(
    Schema.makeFilter((output) => {
      if (output.number_of_files === plannedFileCount) {
        return undefined;
      }
      return `Oxlint number_of_files must equal planned file count ${plannedFileCount}`;
    })
  );

export type OxlintOutput = typeof OxlintOutputWire.Type;
export type OxlintDiagnostic = typeof OxlintDiagnosticSchema.Type;

export const decodeOxlintOutput = (
  input: string,
  plannedFileCount: number
): OxlintOutput => {
  const JsonSchema = Schema.fromJsonString(
    makeOxlintOutputSchema(plannedFileCount)
  );

  return Schema.decodeSync(JsonSchema)(input);
};
