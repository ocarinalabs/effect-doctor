import { NodeServices } from "@effect/platform-node";
import { FileSystem, Path, Effect } from "effect";

import { ProjectFailure } from "./errors.js";
import type { DoctorFailure } from "./errors.js";
import { compareCodeUnits } from "./internal/order.js";
import {
  normalizeOxlintFindings,
  oxlintProviderReceipts,
  runOxlint,
} from "./internal/oxlint.js";
import {
  makeProjectSnapshot,
  verifyProjectSnapshot,
} from "./internal/project-snapshot.js";
import { validateProviderReceipts } from "./internal/provider-receipt.js";
import { resolveToolchain } from "./internal/toolchain.js";
import type { ToolchainVersions } from "./internal/toolchain.js";
import {
  normalizeTsgoFindings,
  runTsgo,
  validateTsgoFiles,
} from "./internal/tsgo.js";
import type {
  Finding,
  FindingSummary,
  ProviderReceipt,
  ScanReport,
} from "./model.js";
import { DOCTOR_VERSION } from "./version.js";

export type ScanRequest = {
  readonly root: string;
};

const summarize = (findings: readonly Finding[]): FindingSummary => ({
  advice: findings.filter((finding) => finding.severity === "advice").length,
  errors: findings.filter((finding) => finding.severity === "error").length,
  warnings: findings.filter((finding) => finding.severity === "warning").length,
});

const compareFindings = (left: Finding, right: Finding): number =>
  compareCodeUnits(left.location.file, right.location.file) ||
  left.location.start.line - right.location.start.line ||
  left.location.start.column - right.location.start.column ||
  compareCodeUnits(left.ruleId, right.ruleId) ||
  compareCodeUnits(left.message, right.message);

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
  receipts: readonly ProviderReceipt[],
  findings: readonly Finding[],
  versions: ToolchainVersions
): ScanReport => ({
  doctorVersion: DOCTOR_VERSION,
  engines: receipts,
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
  const tsgoReceipt = yield* validateTsgoFiles(
    snapshot,
    tsgoAnalysis,
    toolchain.versions.tsgo
  );
  const receipts = yield* validateProviderReceipts(snapshot, [
    ...oxlintProviderReceipts(
      root,
      oxlintAnalysis,
      snapshot.files,
      toolchain.versions.effectOxlint
    ),
    tsgoReceipt,
  ]);
  const sources = snapshot.files;
  const oxlintFindings = yield* normalizeOxlintFindings(
    root,
    oxlintAnalysis,
    sources
  );
  const tsgoFindings = yield* normalizeTsgoFindings(tsgoAnalysis, sources);
  const findings = [...tsgoFindings, ...oxlintFindings].sort(compareFindings);
  yield* verifyProjectSnapshot(snapshot, toolchain.tsgoExecutable);
  return makeReport(receipts, findings, toolchain.versions);
});

export const scanProject = (
  request: ScanRequest
): Effect.Effect<ScanReport, DoctorFailure> =>
  scanProjectWithServices(request).pipe(Effect.provide(NodeServices.layer));
