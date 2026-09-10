import { compareProjects, knownRules, scanProject } from "@effect-doctor/api";
import type { DoctorFailure, RuleMetadata } from "@effect-doctor/api";
import { Console, Effect, Option, Schema } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { setExitCode } from "./internal/exit-code.js";
import { posixArgument } from "./internal/posix-argument.js";
import { renderComparison, renderScan } from "./render.js";
import type { OutputFormat } from "./render.js";

const DEFAULT_ANALYZER_TIMEOUT = "2 minutes";

const decodeAnalyzerTimeoutOption = Schema.decodeUnknownOption(
  Schema.DurationFromString
);
const decodeAnalyzerTimeout = Schema.decodeUnknownSync(
  Schema.DurationFromString
);

const AnalyzerTimeoutSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) =>
      Option.isSome(decodeAnalyzerTimeoutOption(value))
        ? []
        : ['Expected an Effect duration such as "5 minutes"']
    )
  )
);

const formatFlag = Flag.Literals("format", ["pretty", "json", "agent"]).pipe(
  Flag.withDescription("Output format"),
  Flag.withDefault("pretty")
);

const analyzerTimeoutFlag = Flag.String("analyzer-timeout").pipe(
  Flag.withSchema(AnalyzerTimeoutSchema),
  Flag.withDescription(
    'Longest time one analyzer process may run, as an Effect duration such as "5 minutes"'
  ),
  Flag.withDefault(DEFAULT_ANALYZER_TIMEOUT)
);

const analyzerTimeoutArguments = (
  analyzerTimeout: string
): readonly string[] =>
  analyzerTimeout === DEFAULT_ANALYZER_TIMEOUT
    ? []
    : [`--analyzer-timeout=${analyzerTimeout}`];

const analyzerTimeoutCommand = (analyzerTimeout: string): string =>
  analyzerTimeoutArguments(analyzerTimeout)
    .map((argument) => ` ${posixArgument(argument)}`)
    .join("");

const projectFlag = Flag.String("project").pipe(
  Flag.withDescription("Root-relative TypeScript project configuration"),
  Flag.withDefault("tsconfig.json")
);

const safeFailure = (failure: DoctorFailure) => {
  if (failure._tag === "ProjectFailure") {
    return {
      code: failure.code,
      message: failure.message,
      tag: failure._tag,
    };
  }
  if (failure._tag === "AnalyzerFailure") {
    return {
      engine: failure.engine,
      exitCode: failure.exitCode,
      message: failure.message,
      reason: failure.reason,
      tag: failure._tag,
    };
  }
  return {
    engine: failure.engine,
    message: failure.message,
    tag: failure._tag,
  };
};

const providerFix = (rule: RuleMetadata): string => {
  if (!rule.fixable) {
    return "none";
  }
  return rule.source === "effect-tsgo"
    ? "may offer an Effect language-service code action"
    : "may offer an Oxlint autofix";
};

const analyzerOutputLines = (failure: DoctorFailure): readonly string[] =>
  failure._tag === "AnalyzerFailure" && failure.stderr.length > 0
    ? [
        "Analyzer output:",
        ...failure.stderr.split("\n").map((line) => `  ${line}`),
      ]
    : [];

const renderFailure = (
  failure: DoctorFailure,
  format: OutputFormat
): string => {
  const error = safeFailure(failure);
  if (format === "json") {
    return JSON.stringify(
      {
        error,
        schema: "effect-doctor/error/v1",
        status: "failed",
      },
      null,
      2
    );
  }
  return [
    `Effect Doctor failed: ${failure.message}`,
    ...analyzerOutputLines(failure),
  ].join("\n");
};

const scan = Command.make(
  "effect-doctor",
  {
    analyzerTimeout: analyzerTimeoutFlag,
    directory: Argument.Directory("directory").pipe(
      Argument.withDescription("Effect TypeScript project root"),
      Argument.withDefault(".")
    ),
    format: formatFlag,
    project: projectFlag,
  },
  Effect.fn("effectDoctor.scan")(function* ({
    analyzerTimeout,
    directory,
    format,
    project,
  }) {
    const report = yield* scanProject({
      analyzerTimeout: decodeAnalyzerTimeout(analyzerTimeout),
      project,
      root: directory,
    }).pipe(
      Effect.catch((error) =>
        Effect.gen(function* () {
          yield* Console.log(renderFailure(error, format));
          yield* setExitCode(2);
          return undefined;
        })
      )
    );
    if (report === undefined) {
      return;
    }

    const rerunArguments = [
      "effect-doctor",
      directory,
      `--project=${report.target.entry}`,
      "--format",
      "agent",
      ...analyzerTimeoutArguments(analyzerTimeout),
    ];
    const rerunCommand = `effect-doctor ${posixArgument(directory)} --project=${posixArgument(report.target.entry)} --format agent${analyzerTimeoutCommand(analyzerTimeout)}`;
    yield* Console.log(
      renderScan(report, format, rerunCommand, rerunArguments)
    );
    if (report.findings.length > 0) {
      yield* setExitCode(1);
    }
  })
).pipe(Command.withDescription("Analyze an Effect TypeScript project"));

const compare = Command.make(
  "compare",
  {
    analyzerTimeout: analyzerTimeoutFlag,
    baseline: Argument.Directory("baseline"),
    candidate: Argument.Directory("candidate"),
    format: formatFlag,
    project: projectFlag,
  },
  Effect.fn("effectDoctor.compare")(function* ({
    analyzerTimeout,
    baseline,
    candidate,
    format,
    project,
  }) {
    const report = yield* compareProjects({
      analyzerTimeout: decodeAnalyzerTimeout(analyzerTimeout),
      baselineRoot: baseline,
      candidateRoot: candidate,
      project,
    }).pipe(
      Effect.catch((error) =>
        Effect.gen(function* () {
          yield* Console.log(renderFailure(error, format));
          yield* setExitCode(2);
          return undefined;
        })
      )
    );
    if (report === undefined) {
      return;
    }

    const rerunArguments = [
      "effect-doctor",
      "compare",
      baseline,
      candidate,
      `--project=${report.candidate.target.entry}`,
      "--format",
      "agent",
      ...analyzerTimeoutArguments(analyzerTimeout),
    ];
    const rerunCommand = `effect-doctor compare ${posixArgument(baseline)} ${posixArgument(candidate)} --project=${posixArgument(report.candidate.target.entry)} --format agent${analyzerTimeoutCommand(analyzerTimeout)}`;
    yield* Console.log(
      renderComparison(report, format, rerunCommand, rerunArguments)
    );
    if (report.introduced.length > 0) {
      yield* setExitCode(1);
    }
  })
).pipe(
  Command.withDescription(
    "Compare diagnostics from baseline and candidate projects"
  )
);

const explain = Command.make(
  "explain",
  { rule: Argument.String("rule") },
  Effect.fn("effectDoctor.rules.explain")(function* ({ rule }) {
    const metadata = knownRules().find((candidate) => candidate.id === rule);
    if (metadata === undefined) {
      yield* Console.error(
        `Unknown rule ${rule}. Run "effect-doctor rules list" to see every rule id.`
      );
      yield* setExitCode(2);
      return;
    }
    yield* Console.log(
      [
        metadata.id,
        `Title: ${metadata.title}`,
        `Source: ${metadata.source}`,
        `Native rule: ${metadata.nativeRuleId}`,
        `Severity: ${metadata.defaultSeverity}`,
        `Category: ${metadata.category}`,
        `Applicability: ${metadata.applicability}`,
        `Provider fix: ${providerFix(metadata)}`,
        `Description: ${metadata.description}`,
      ].join("\n")
    );
  })
).pipe(Command.withDescription("Explain one rule by id"));

const listRules = Effect.fn("effectDoctor.rules.list")(function* () {
  const lines = knownRules().map(
    (rule) =>
      `${rule.id}\t${rule.defaultSeverity}\t${rule.applicability}\t${rule.source}\t${providerFix(rule)}\t${rule.description}`
  );
  yield* Console.log(lines.join("\n"));
});

const list = Command.make("list", {}, listRules).pipe(
  Command.withDescription("List active Effect v4 rules and their policy")
);

const rules = Command.make("rules", {}, listRules).pipe(
  Command.withDescription("List active rules and their policy"),
  Command.withSubcommands([list, explain])
);

export const effectDoctorCommand = scan.pipe(
  Command.withSubcommands([compare, rules])
);
