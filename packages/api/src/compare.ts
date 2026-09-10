import { compareFindings } from "@effect-doctor/core";
import type { ComparisonReport } from "@effect-doctor/core";
import { Effect } from "effect";
import type { Duration } from "effect";

import type { DoctorFailure } from "./errors.js";
import { sealComparisonReport } from "./internal/report/seal.js";
import { scanProject } from "./scan.js";
import type { ScanRequest } from "./scan.js";
import { DOCTOR_VERSION } from "./version.js";

export type CompareRequest = {
  /**
   * Longest time one analyzer process may run. Defaults to two minutes.
   */
  readonly analyzerTimeout?: Duration.Input | undefined;
  readonly baselineRoot: string;
  readonly candidateRoot: string;
  readonly project?: string | undefined;
};

const sharedOptions = (request: CompareRequest): Omit<ScanRequest, "root"> => ({
  analyzerTimeout: request.analyzerTimeout,
  project: request.project,
});

export const compareProjects: (
  request: CompareRequest
) => Effect.Effect<ComparisonReport, DoctorFailure> = Effect.fn(
  "compareProjects"
)(function* (request) {
  const options = sharedOptions(request);
  const [baseline, candidate] = yield* Effect.all(
    [
      scanProject({ root: request.baselineRoot, ...options }),
      scanProject({ root: request.candidateRoot, ...options }),
    ],
    { concurrency: 2 }
  );
  const delta = compareFindings(baseline.findings, candidate.findings);

  return yield* sealComparisonReport({
    baseline,
    candidate,
    doctorVersion: DOCTOR_VERSION,
    introduced: delta.introduced,
    kind: "comparison",
    resolved: delta.resolved,
    schema: "effect-doctor/comparison/v1",
    unchangedCount: delta.unchanged.length,
  });
});
