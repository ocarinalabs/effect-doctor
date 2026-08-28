import { Effect } from "effect";

import { compareFindings } from "./delta.js";
import type { ComparisonReport } from "./model.js";
import { scanProject } from "./scan.js";
import { DOCTOR_VERSION } from "./version.js";

export type CompareRequest = {
  readonly baselineRoot: string;
  readonly candidateRoot: string;
};

export const compareProjects = Effect.fn("compareProjects")(function* (
  request: CompareRequest
) {
  const [baseline, candidate] = yield* Effect.all(
    [
      scanProject({ root: request.baselineRoot }),
      scanProject({ root: request.candidateRoot }),
    ],
    { concurrency: 2 }
  );
  const delta = compareFindings(baseline.findings, candidate.findings);

  return {
    baseline,
    candidate,
    doctorVersion: DOCTOR_VERSION,
    introduced: delta.introduced,
    kind: "comparison",
    resolved: delta.resolved,
    schema: "effect-doctor/comparison/v1",
    unchangedCount: delta.unchanged.length,
  } satisfies ComparisonReport;
});
