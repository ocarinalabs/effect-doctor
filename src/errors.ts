import { Schema } from "effect";

export class ProjectFailure extends Schema.TaggedError<ProjectFailure>()(
  "ProjectFailure",
  {
    message: Schema.String,
    root: Schema.String,
  }
) {}

export class AnalyzerFailure extends Schema.TaggedError<AnalyzerFailure>()(
  "AnalyzerFailure",
  {
    engine: Schema.Literals(["effect-tsgo", "effect-oxlint", "effect-doctor"]),
    exitCode: Schema.NullOr(Schema.Int),
    message: Schema.String,
    stderr: Schema.String,
  }
) {}

export class InvalidAnalyzerOutput extends Schema.TaggedError<InvalidAnalyzerOutput>()(
  "InvalidAnalyzerOutput",
  {
    engine: Schema.Literals(["effect-tsgo", "effect-oxlint", "effect-doctor"]),
    message: Schema.String,
  }
) {}

export type DoctorFailure =
  | ProjectFailure
  | AnalyzerFailure
  | InvalidAnalyzerOutput;
