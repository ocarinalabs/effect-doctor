import type { AnalyzerRun } from "@effect-doctor/core";
import { Effect } from "effect";

import { InvalidAnalyzerOutput } from "../../errors.js";
import type { ProjectSnapshot } from "../project/snapshot.js";

const ENGINE_ORDER = ["effect-doctor", "effect-tsgo"] as const;

const inventoryDifference = (
  expected: readonly string[],
  actual: readonly string[]
): string => {
  const expectedFiles = new Set(expected);
  const actualFiles = new Set(actual);
  const missing = expected.find((file) => !actualFiles.has(file));
  if (missing !== undefined) {
    return `missing ${missing}`;
  }
  const unexpected = actual.find((file) => !expectedFiles.has(file));
  if (unexpected !== undefined) {
    return `unexpected ${unexpected}`;
  }
  return "inventory order differs";
};

const coverageIssue = (
  expectedFiles: readonly string[],
  matching: readonly AnalyzerRun[]
): string | undefined => {
  const [run] = matching;
  if (run === undefined) {
    return "no Analyzer Run";
  }
  if (matching.length !== 1) {
    return `${matching.length} Analyzer Runs`;
  }
  if (!run.complete) {
    return "Analyzer Run incomplete";
  }
  if (JSON.stringify(run.analyzedFiles) !== JSON.stringify(expectedFiles)) {
    return inventoryDifference(expectedFiles, run.analyzedFiles);
  }
  return undefined;
};

export const validateAnalyzerRuns = Effect.fn("validateAnalyzerRuns")(
  function* (snapshot: ProjectSnapshot, runs: readonly AnalyzerRun[]) {
    const expectedFiles = snapshot.files.map((file) => file.relative);
    const validated: AnalyzerRun[] = [];

    for (const engine of ENGINE_ORDER) {
      const matching = runs.filter((run) => run.engine === engine);
      const issue = coverageIssue(expectedFiles, matching);
      const [run] = matching;
      if (issue !== undefined || run === undefined) {
        return yield* new InvalidAnalyzerOutput({
          engine,
          message: `${engine} did not prove exact project snapshot coverage (${issue ?? "no Analyzer Run"})`,
        });
      }
      validated.push(run);
    }

    if (runs.length !== ENGINE_ORDER.length) {
      return yield* new InvalidAnalyzerOutput({
        engine: "effect-doctor",
        message: "Analyzers returned unexpected runs",
      });
    }
    return validated;
  }
);
