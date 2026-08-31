import { compareFindingOrder } from "@effect-doctor/core";
import type {
  AnalyzerRun,
  Finding,
  FindingSummary,
  ScanReport,
} from "@effect-doctor/core";
import { NodeServices } from "@effect/platform-node";
import { FileSystem, Path, Effect } from "effect";

import { ProjectFailure } from "./errors.js";
import type { DoctorFailure } from "./errors.js";
import { validateAnalyzerRuns } from "./internal/analyzer-run.js";
import {
  normalizeOxlintFindings,
  oxlintAnalyzerRuns,
  runOxlint,
} from "./internal/oxlint.js";
import {
  makeProjectSnapshot,
  verifyProjectSnapshot,
} from "./internal/project-snapshot.js";
import { resolveToolchain } from "./internal/toolchain.js";
import type { ToolchainVersions } from "./internal/toolchain.js";
import {
  normalizeTsgoFindings,
  runTsgo,
  validateTsgoFiles,
} from "./internal/tsgo.js";
import { DOCTOR_VERSION } from "./version.js";

export type ScanRequest = {
  readonly root: string;
};

const summarize = (findings: readonly Finding[]): FindingSummary => ({
  advice: findings.filter((finding) => finding.severity === "advice").length,
  errors: findings.filter((finding) => finding.severity === "error").length,
  warnings: findings.filter((finding) => finding.severity === "warning").length,
});

const resolveProjectRoot = Effect.fn("resolveProjectRoot")(function* (
  requestedRoot: string
) {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.realPath(requestedRoot).pipe(
    Effect.mapError(
      () =>
        new ProjectFailure({
          message: "Project root does not exist or cannot be resolved",
          root: requestedRoot,
        })
    )
  );
});

const requireTsconfig = Effect.fn("requireTsconfig")(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const tsconfig = path.join(root, "tsconfig.json");
  const exists = yield* fs.exists(tsconfig).pipe(
    Effect.mapError(
      () =>
        new ProjectFailure({
          message: "Unable to inspect the project tsconfig.json",
          root,
        })
    )
  );
  if (!exists) {
    return yield* new ProjectFailure({
      message: "Effect Doctor currently requires a root tsconfig.json",
      root,
    });
  }
  return tsconfig;
});

const makeReport = (
  runs: readonly AnalyzerRun[],
  findings: readonly Finding[],
  versions: ToolchainVersions
): ScanReport => ({
  doctorVersion: DOCTOR_VERSION,
  engines: runs,
  findings,
  kind: "scan",
  root: ".",
  schema: "effect-doctor/scan/v1",
  summary: summarize(findings),
  toolchain: {
    effect: versions.effect,
    effectOxlint: versions.effectOxlint,
    oxlint: versions.oxlint,
    tsgo: versions.tsgo,
    typescript: versions.typescript,
  },
});

const scanProjectWithServices = Effect.fn("scanProjectWithServices")(function* (
  request: ScanRequest
) {
  const root = yield* resolveProjectRoot(request.root);
  const tsconfig = yield* requireTsconfig(root);
  const toolchain = yield* resolveToolchain();
  const snapshot = yield* makeProjectSnapshot(
    root,
    tsconfig,
    toolchain.tsgoExecutable
  );
  const [tsgoAnalysis, oxlintAnalysis] = yield* Effect.all(
    [runTsgo(toolchain, tsconfig), runOxlint(toolchain, root, snapshot.files)],
    { concurrency: 2 }
  );
  const tsgoRun = yield* validateTsgoFiles(
    snapshot,
    tsgoAnalysis,
    toolchain.versions.tsgo
  );
  const runs = yield* validateAnalyzerRuns(snapshot, [
    ...oxlintAnalyzerRuns(
      root,
      oxlintAnalysis,
      snapshot.files,
      toolchain.versions.effectOxlint
    ),
    tsgoRun,
  ]);
  const sources = snapshot.files;
  const oxlintFindings = yield* normalizeOxlintFindings(
    root,
    oxlintAnalysis,
    sources,
    tsgoAnalysis.output.files
  );
  const tsgoFindings = yield* normalizeTsgoFindings(tsgoAnalysis, sources);
  const findings = [...tsgoFindings, ...oxlintFindings].sort(
    compareFindingOrder
  );
  yield* verifyProjectSnapshot(snapshot, toolchain.tsgoExecutable);
  return makeReport(runs, findings, toolchain.versions);
});

export const scanProject = (
  request: ScanRequest
): Effect.Effect<ScanReport, DoctorFailure> =>
  scanProjectWithServices(request).pipe(Effect.provide(NodeServices.layer));
