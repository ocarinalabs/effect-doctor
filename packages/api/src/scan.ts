import {
  applyRuleApplicability,
  compareFindingOrder,
  SCAN_POLICY,
} from "@effect-doctor/core";
import type {
  ApplicabilityReport,
  AnalyzerRun,
  Finding,
  FindingSummary,
  ScanReport,
  ScanTarget,
  SourceApplicability,
} from "@effect-doctor/core";
import { NodeServices } from "@effect/platform-node";
import { FileSystem, Path, Effect } from "effect";
import type { Duration } from "effect";

import { InvalidAnalyzerOutput, ProjectFailure } from "./errors.js";
import type { DoctorFailure } from "./errors.js";
import {
  normalizeOxlintFindings,
  oxlintAnalyzerRun,
  runOxlint,
} from "./internal/analyzers/oxlint.js";
import {
  normalizeTsgoFindings,
  runTsgo,
  validateTsgoFiles,
} from "./internal/analyzers/tsgo.js";
import { projectRelativePath } from "./internal/project/path.js";
import {
  makeProjectSnapshot,
  verifyProjectSnapshot,
} from "./internal/project/snapshot.js";
import { resolveToolchain } from "./internal/project/toolchain.js";
import type { ToolchainVersions } from "./internal/project/toolchain.js";
import { validateAnalyzerRuns } from "./internal/report/analyzer-run.js";
import { sealScanReport } from "./internal/report/seal.js";
import { DOCTOR_VERSION } from "./version.js";

export type ScanRequest = {
  /**
   * Longest time one analyzer process may run. Defaults to two minutes.
   */
  readonly analyzerTimeout?: Duration.Input | undefined;
  readonly project?: string | undefined;
  readonly root: string;
};

const summarize = (findings: readonly Finding[]): FindingSummary => ({
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
          code: "root-unavailable",
          message: "Project root does not exist or cannot be resolved",
          root: requestedRoot,
        })
    )
  );
});

const outsideRoot = (root: string): ProjectFailure =>
  new ProjectFailure({
    code: "outside-root",
    message:
      "Project configuration must be a root-relative path inside the project root.",
    root,
  });

const projectNotFound = (root: string): ProjectFailure =>
  new ProjectFailure({
    code: "project-not-found",
    message:
      "The selected project configuration does not exist or cannot be resolved.",
    root,
  });

const relativeInsideRoot = (
  root: string,
  candidate: string
): Effect.Effect<string, ProjectFailure> =>
  Effect.try({
    catch: () => outsideRoot(root),
    try: () => projectRelativePath(root, candidate),
  });

const resolveEntryProject = Effect.fn("resolveEntryProject")(function* (
  root: string,
  requestedProject: string
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  if (path.isAbsolute(requestedProject)) {
    return yield* outsideRoot(root);
  }
  const candidate = path.resolve(root, requestedProject);
  const entry = yield* relativeInsideRoot(root, candidate);
  const tsconfig = yield* fs
    .realPath(candidate)
    .pipe(Effect.mapError(() => projectNotFound(root)));
  yield* relativeInsideRoot(root, tsconfig);
  const info = yield* fs
    .stat(tsconfig)
    .pipe(Effect.mapError(() => projectNotFound(root)));
  if (info.type !== "File") {
    return yield* new ProjectFailure({
      code: "project-invalid",
      message: "The selected project configuration must be a file.",
      root,
    });
  }
  return { entry, tsconfig };
});

const applyApplicability = (
  findings: readonly Finding[],
  sources: readonly SourceApplicability[]
) =>
  Effect.try({
    catch: (error) =>
      new InvalidAnalyzerOutput({
        engine: "effect-doctor",
        message: `Rule applicability could not be applied: ${error instanceof Error ? error.message : String(error)}`,
      }),
    try: () => applyRuleApplicability(findings, sources),
  });

type ReportInputs = {
  readonly applicability: ApplicabilityReport;
  readonly findings: readonly Finding[];
  readonly runs: readonly AnalyzerRun[];
  readonly target: ScanTarget;
  readonly versions: ToolchainVersions;
};

const makeReport = (inputs: ReportInputs): ScanReport => ({
  applicability: inputs.applicability,
  doctorVersion: DOCTOR_VERSION,
  engines: inputs.runs,
  findings: inputs.findings,
  kind: "scan",
  policy: SCAN_POLICY,
  root: ".",
  schema: "effect-doctor/scan/v1",
  summary: summarize(inputs.findings),
  target: inputs.target,
  toolchain: {
    effect: inputs.versions.effect,
    oxlint: inputs.versions.oxlint,
    tsgo: inputs.versions.tsgo,
    typescript: inputs.versions.typescript,
  },
});

const scanProjectWithServices = Effect.fn("scanProjectWithServices")(function* (
  request: ScanRequest
) {
  const root = yield* resolveProjectRoot(request.root);
  const selected = yield* resolveEntryProject(
    root,
    request.project ?? "tsconfig.json"
  );
  const path = yield* Path.Path;
  const toolchain = yield* resolveToolchain();
  const snapshot = yield* makeProjectSnapshot(
    root,
    selected,
    toolchain.tsgoExecutable
  );
  const [tsgoAnalysis, oxlintAnalysis] = yield* Effect.all(
    [
      runTsgo(toolchain, selected.tsconfig, request.analyzerTimeout),
      runOxlint(toolchain, root, snapshot.files, request.analyzerTimeout),
    ],
    { concurrency: 2 }
  );
  const tsgoRun = yield* validateTsgoFiles(
    snapshot,
    tsgoAnalysis,
    toolchain.versions.tsgo
  );
  const runs = yield* validateAnalyzerRuns(snapshot, [
    oxlintAnalyzerRun(root, path, oxlintAnalysis, snapshot.files),
    tsgoRun,
  ]);
  const sources = snapshot.files;
  const oxlintFindings = yield* normalizeOxlintFindings(
    root,
    oxlintAnalysis,
    sources
  );
  const tsgoFindings = yield* normalizeTsgoFindings(tsgoAnalysis, sources);
  const normalizedFindings = [...tsgoFindings, ...oxlintFindings].sort(
    compareFindingOrder
  );
  const applied = yield* applyApplicability(
    normalizedFindings,
    oxlintAnalysis.sourceProfiles
  );
  yield* verifyProjectSnapshot(snapshot, toolchain.tsgoExecutable);
  return yield* sealScanReport(
    makeReport({
      applicability: applied.applicability,
      findings: applied.findings,
      runs,
      target: snapshot.target,
      versions: toolchain.versions,
    })
  );
});

export const scanProject = (
  request: ScanRequest
): Effect.Effect<ScanReport, DoctorFailure> =>
  scanProjectWithServices(request).pipe(Effect.provide(NodeServices.layer));
