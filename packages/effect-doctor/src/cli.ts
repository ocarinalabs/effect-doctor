import { compareProjects, knownRules, scanProject } from "@effect-doctor/api";
import type { DoctorFailure, RuleMetadata } from "@effect-doctor/api";
import { Console, Effect } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { setExitCode } from "./internal/exit-code.js";
import { posixArgument } from "./internal/posix-argument.js";
import { isBlocked, renderComparison, renderScan } from "./render.js";
import type { OutputFormat } from "./render.js";

const formatFlag = Flag.choice("format", ["pretty", "json", "agent"]).pipe(
  Flag.withDescription("Output format"),
  Flag.withDefault("pretty")
);

const blockingFlag = Flag.choice("blocking", [
  "error",
  "warning",
  "never",
]).pipe(
  Flag.withDescription("Lowest severity that produces exit code 1"),
  Flag.withDefault("error")
);

const projectFlag = Flag.string("project").pipe(
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
  return `Effect Doctor failed: ${failure.message}`;
};

const scan = Command.make(
  "effect-doctor",
  {
    blocking: blockingFlag,
    directory: Argument.directory("directory").pipe(
      Argument.withDescription("Effect TypeScript project root"),
      Argument.withDefault(".")
    ),
    format: formatFlag,
    project: projectFlag,
  },
  Effect.fn("effectDoctor.scan")(function* ({
    blocking,
    directory,
    format,
    project,
  }) {
    const report = yield* scanProject({ project, root: directory }).pipe(
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

    const rerunCommand = `effect-doctor ${posixArgument(directory)} --project=${posixArgument(report.target.entry)} --format agent --blocking never`;
    yield* Console.log(renderScan(report, format, rerunCommand));
    if (isBlocked(report.findings, blocking)) {
      yield* setExitCode(1);
    }
  })
).pipe(Command.withDescription("Analyze an Effect TypeScript project"));

const compare = Command.make(
  "compare",
  {
    baseline: Argument.directory("baseline"),
    blocking: blockingFlag,
    candidate: Argument.directory("candidate"),
    format: formatFlag,
    project: projectFlag,
  },
  Effect.fn("effectDoctor.compare")(function* ({
    baseline,
    blocking,
    candidate,
    format,
    project,
  }) {
    const report = yield* compareProjects({
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

    const rerunCommand = `effect-doctor compare ${posixArgument(baseline)} ${posixArgument(candidate)} --project=${posixArgument(report.candidate.target.entry)} --format agent --blocking never`;
    yield* Console.log(renderComparison(report, format, rerunCommand));
    if (isBlocked(report.introduced, blocking)) {
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
  { rule: Argument.string("rule") },
  Effect.fn("effectDoctor.rules.explain")(function* ({ rule }) {
    const metadata = knownRules().find((candidate) => candidate.id === rule);
    if (metadata === undefined) {
      yield* Console.error(`Unknown Effect Doctor rule: ${rule}`);
      yield* setExitCode(2);
      return;
    }
    yield* Console.log(
      [
        metadata.id,
        `Title: ${metadata.title}`,
        `Source: ${metadata.source}`,
        `Native rule: ${metadata.nativeRuleId}`,
        `Default severity: ${metadata.defaultSeverity}`,
        `Status: ${metadata.status}`,
        `Category: ${metadata.category}`,
        `Provider fix: ${providerFix(metadata)}`,
        `Description: ${metadata.description}`,
      ].join("\n")
    );
  })
).pipe(Command.withDescription("Explain one canonical rule"));

const listRules = Effect.fn("effectDoctor.rules.list")(function* () {
  const lines = knownRules().map(
    (rule) =>
      `${rule.id}\t${rule.defaultSeverity}\t${rule.status}\t${rule.source}\t${providerFix(rule)}\t${rule.description}`
  );
  yield* Console.log(lines.join("\n"));
});

const list = Command.make("list", {}, listRules).pipe(
  Command.withDescription("List active Effect v4 rules and their policy")
);

const rules = Command.make("rules", {}, listRules).pipe(
  Command.withDescription("List canonical rules and their providers"),
  Command.withSubcommands([list, explain])
);

export const effectDoctorCommand = scan.pipe(
  Command.withSubcommands([compare, rules])
);
