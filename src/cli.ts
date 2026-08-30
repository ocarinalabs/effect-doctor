import { Console, Effect } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { compareProjects } from "./compare.js";
import type { DoctorFailure } from "./errors.js";
import { setExitCode } from "./internal/exit-code.js";
import { isBlocked, renderComparison, renderScan } from "./render.js";
import { knownRules } from "./rules.js";
import { scanProject } from "./scan.js";

const formatFlag = Flag.choice("format", ["pretty", "json"]).pipe(
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

const failureMessage = (failure: DoctorFailure): string => {
  if (failure._tag === "ProjectFailure") {
    return "Project configuration could not be analyzed.";
  }
  if (failure._tag === "AnalyzerFailure") {
    return `${failure.engine} could not complete analysis.`;
  }
  return `${failure.engine} returned invalid analysis output.`;
};

const renderFailure = (
  failure: DoctorFailure,
  format: "pretty" | "json"
): string => {
  const message = failureMessage(failure);
  if (format === "json") {
    return JSON.stringify(
      {
        error: {
          message,
          tag: failure._tag,
        },
        schema: "effect-doctor/error/v1",
        status: "failed",
      },
      null,
      2
    );
  }
  return `Effect Doctor failed: ${message}`;
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
  },
  Effect.fn("effectDoctor.scan")(function* ({ blocking, directory, format }) {
    const report = yield* scanProject({ root: directory }).pipe(
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

    yield* Console.log(renderScan(report, format));
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
  },
  Effect.fn("effectDoctor.compare")(function* ({
    baseline,
    blocking,
    candidate,
    format,
  }) {
    const report = yield* compareProjects({
      baselineRoot: baseline,
      candidateRoot: candidate,
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

    yield* Console.log(renderComparison(report, format));
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
        `Enabled: ${metadata.defaultEnabled ? "yes" : "no"}`,
        `Status: ${metadata.status}`,
        `Selection: ${metadata.selection}`,
        `Category: ${metadata.category}`,
        `Fixable: ${metadata.fixable ? "yes" : "no"}`,
        `Effect versions: ${metadata.supportedEffectVersions.join(", ") || "unspecified"}`,
        `Description: ${metadata.description}`,
      ].join("\n")
    );
  })
).pipe(Command.withDescription("Explain one canonical rule"));

const listRules = Effect.fn("effectDoctor.rules.list")(function* () {
  const lines = knownRules().map(
    (rule) =>
      `${rule.id}\t${rule.defaultSeverity}\t${rule.defaultEnabled ? "enabled" : "disabled"}\t${rule.status}\t${rule.selection}\t${rule.source}\t${rule.description}`
  );
  yield* Console.log(lines.join("\n"));
});

const list = Command.make("list", {}, listRules).pipe(
  Command.withDescription("List canonical rules and their policy")
);

const rules = Command.make("rules", {}, listRules).pipe(
  Command.withDescription("List canonical rules and their providers"),
  Command.withSubcommands([list, explain])
);

export const effectDoctorCommand = scan.pipe(
  Command.withSubcommands([compare, rules])
);
