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
import { projectRelativePath } from "./internal/project-path.js";
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
  readonly project?: string;
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
          code: "root-unavailable",
          message: "Project root does not exist or cannot be resolved",
          root: requestedRoot,
        })
    )
  );
});

const resolveEntryProject = Effect.fn("resolveEntryProject")(function* (
  root: string,
  requestedProject: string
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  if (path.isAbsolute(requestedProject)) {
    return yield* new ProjectFailure({
      code: "outside-root",
      message:
        "Project configuration must be a root-relative path inside the project root.",
      root,
    });
  }

  const candidate = path.resolve(root, requestedProject);
  let entry: string;
  try {
    entry = projectRelativePath(root, candidate);
  } catch {
    return yield* new ProjectFailure({
      code: "outside-root",
      message:
        "Project configuration must be a root-relative path inside the project root.",
      root,
    });
  }

  const tsconfig = yield* fs.realPath(candidate).pipe(
    Effect.mapError(
      () =>
        new ProjectFailure({
          code: "project-not-found",
          message:
            "The selected project configuration does not exist or cannot be resolved.",
          root,
        })
    )
  );
  try {
    projectRelativePath(root, tsconfig);
  } catch {
    return yield* new ProjectFailure({
      code: "outside-root",
      message:
        "Project configuration must be a root-relative path inside the project root.",
      root,
    });
  }
  const info = yield* fs.stat(tsconfig).pipe(
    Effect.mapError(
      () =>
        new ProjectFailure({
          code: "project-not-found",
          message:
            "The selected project configuration does not exist or cannot be resolved.",
          root,
        })
    )
  );
  if (info.type !== "File") {
    return yield* new ProjectFailure({
      code: "project-invalid",
      message: "The selected project configuration must be a file.",
      root,
    });
  }
  return { entry, tsconfig };
});

const makeReport = (
  runs: readonly AnalyzerRun[],
  findings: readonly Finding[],
  applicability: ApplicabilityReport,
  target: ScanTarget,
  versions: ToolchainVersions
): ScanReport => ({
  applicability,
  doctorVersion: DOCTOR_VERSION,
  engines: runs,
  findings,
  kind: "scan",
  policy: SCAN_POLICY,
  root: ".",
  schema: "effect-doctor/scan/v1",
  summary: summarize(findings),
  target,
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
  const selected = yield* resolveEntryProject(
    root,
    request.project ?? "tsconfig.json"
  );
  const toolchain = yield* resolveToolchain();
  const snapshot = yield* makeProjectSnapshot(
    root,
    selected,
    toolchain.tsgoExecutable
  );
  const [tsgoAnalysis, oxlintAnalysis] = yield* Effect.all(
    [
      runTsgo(toolchain, selected.tsconfig),
      runOxlint(toolchain, root, snapshot.files),
    ],
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
    sources
  );
  const tsgoFindings = yield* normalizeTsgoFindings(tsgoAnalysis, sources);
  const normalizedFindings = [...tsgoFindings, ...oxlintFindings].sort(
    compareFindingOrder
  );
  const applied = applyRuleApplicability(
    normalizedFindings,
    oxlintAnalysis.sourceProfiles
  );
  yield* verifyProjectSnapshot(snapshot, toolchain.tsgoExecutable);
  return makeReport(
    runs,
    applied.findings,
    applied.applicability,
    snapshot.target,
    toolchain.versions
  );
});

export const scanProject = (
  request: ScanRequest
): Effect.Effect<ScanReport, DoctorFailure> =>
  scanProjectWithServices(request).pipe(Effect.provide(NodeServices.layer));
