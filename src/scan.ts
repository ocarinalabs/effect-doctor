import { NodeServices } from "@effect/platform-node";
import { FileSystem, Path, Effect } from "effect";

import { ProjectFailure } from "./errors.js";
import type { DoctorFailure } from "./errors.js";
import { analyzeDoctorRules, doctorEngineRun } from "./internal/doctor.js";
import {
  normalizeOxlintFindings,
  oxlintEngineRun,
  runOxlint,
} from "./internal/oxlint.js";
import { resolveToolchain } from "./internal/toolchain.js";
import {
  normalizeTsgoFindings,
  runTsgo,
  tsgoEngineRun,
  validateTsgoFiles,
} from "./internal/tsgo.js";
import type { AnalyzedSource } from "./internal/tsgo.js";
import type { Finding, FindingSummary, ScanReport } from "./model.js";
import { DOCTOR_VERSION, TOOLCHAIN } from "./version.js";

export type ScanRequest = {
  readonly root: string;
};

const summarize = (findings: readonly Finding[]): FindingSummary => ({
  advice: findings.filter((finding) => finding.severity === "advice").length,
  errors: findings.filter((finding) => finding.severity === "error").length,
  warnings: findings.filter((finding) => finding.severity === "warning").length,
});

const compareFindings = (left: Finding, right: Finding): number =>
  left.location.file.localeCompare(right.location.file) ||
  left.location.start.line - right.location.start.line ||
  left.location.start.column - right.location.start.column ||
  left.ruleId.localeCompare(right.ruleId) ||
  left.message.localeCompare(right.message);

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
  sources: readonly AnalyzedSource[],
  findings: readonly Finding[]
): ScanReport => ({
  doctorVersion: DOCTOR_VERSION,
  engines: [
    doctorEngineRun(sources),
    oxlintEngineRun(sources),
    tsgoEngineRun(sources),
  ],
  findings,
  kind: "scan",
  root: ".",
  schema: "effect-doctor/scan/v1",
  summary: summarize(findings),
  toolchain: TOOLCHAIN,
});

const scanProjectWithServices = Effect.fn("scanProject")(function* (
  request: ScanRequest
) {
  const root = yield* resolveProjectRoot(request.root);
  const tsconfig = yield* requireTsconfig(root);
  const toolchain = yield* resolveToolchain();
  const tsgoAnalysis = yield* runTsgo(toolchain, tsconfig);
  const sources = yield* validateTsgoFiles(root, tsgoAnalysis);
  const oxlintAnalysis = yield* runOxlint(toolchain, root, sources);
  const oxlintFindings = yield* normalizeOxlintFindings(
    root,
    oxlintAnalysis,
    sources
  );
  const findings = [
    ...analyzeDoctorRules(sources),
    ...normalizeTsgoFindings(tsgoAnalysis, sources),
    ...oxlintFindings,
  ].sort(compareFindings);
  return makeReport(sources, findings);
});

export const scanProject = (
  request: ScanRequest
): Effect.Effect<ScanReport, DoctorFailure> =>
  scanProjectWithServices(request).pipe(Effect.provide(NodeServices.layer));
