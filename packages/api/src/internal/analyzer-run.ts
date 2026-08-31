import type { AnalyzerRun } from "@effect-doctor/core";
import { Effect } from "effect";

import { InvalidAnalyzerOutput } from "../errors.js";
import type { ProjectSnapshot } from "./project-snapshot.js";

const ENGINE_ORDER = ["effect-doctor", "effect-oxlint", "effect-tsgo"] as const;

export const validateAnalyzerRuns = Effect.fn("validateAnalyzerRuns")(
  function* (snapshot: ProjectSnapshot, runs: readonly AnalyzerRun[]) {
    const expectedFiles = snapshot.files.map((file) => file.relative);
    const validated: AnalyzerRun[] = [];

    for (const engine of ENGINE_ORDER) {
      const matching = runs.filter((run) => run.engine === engine);
      const [run] = matching;
      if (
        matching.length !== 1 ||
        run === undefined ||
        !run.complete ||
        JSON.stringify(run.analyzedFiles) !== JSON.stringify(expectedFiles)
      ) {
        return yield* new InvalidAnalyzerOutput({
          engine,
          message: `${engine} did not prove exact project snapshot coverage`,
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
