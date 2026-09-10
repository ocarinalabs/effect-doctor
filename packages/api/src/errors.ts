import { Schema } from "effect";

export class ProjectFailure extends Schema.TaggedError<ProjectFailure>()(
  "ProjectFailure",
  {
    code: Schema.Literals([
      "coverage-mismatch",
      "duplicate-source",
      "effect-unsupported",
      "empty-project",
      "outside-root",
      "project-changed",
      "project-invalid",
      "project-not-found",
      "reference-cycle",
      "reference-invalid",
      "root-unavailable",
      "source-invalid",
      "workspace-unavailable",
    ]),
    message: Schema.String,
    root: Schema.String,
  }
) {}

export class AnalyzerFailure extends Schema.TaggedError<AnalyzerFailure>()(
  "AnalyzerFailure",
  {
    engine: Schema.Literals(["effect-tsgo", "effect-doctor"]),
    exitCode: Schema.NullOr(Schema.Int),
    message: Schema.String,
    reason: Schema.Literals([
      "exit",
      "output-limit",
      "process",
      "timeout",
      "toolchain",
    ]),
    stderr: Schema.String,
  }
) {}

export class InvalidAnalyzerOutput extends Schema.TaggedError<InvalidAnalyzerOutput>()(
  "InvalidAnalyzerOutput",
  {
    engine: Schema.Literals(["effect-tsgo", "effect-doctor"]),
    message: Schema.String,
  }
) {}

export type DoctorFailure =
  | ProjectFailure
  | AnalyzerFailure
  | InvalidAnalyzerOutput;
