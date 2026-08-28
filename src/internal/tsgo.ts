import { FileSystem, Path, Effect } from "effect";

import {
  InvalidAnalyzerOutput,
  AnalyzerFailure,
  ProjectFailure,
} from "../errors.js";
import { fingerprintFinding } from "../fingerprint.js";
import type {
  EngineRun,
  Finding,
  FindingWithoutFingerprint,
} from "../model.js";
import {
  canonicalRuleId,
  ruleTitle,
  tsgoCategory,
  tsgoSeverity,
} from "../rules.js";
import { TOOLCHAIN } from "../version.js";
import { runProcess } from "./process.js";
import type { ToolchainPaths } from "./toolchain.js";
import { decodeTsgoOutput } from "./tsgo-output.js";
import type { TsgoDiagnostic, TsgoOutput } from "./tsgo-output.js";

const LSP_CONFIG = {
  diagnosticSeverity: {
    asyncFunction: "off",
    cryptoRandomUUID: "off",
    cryptoRandomUUIDInEffect: "off",
    globalConsole: "off",
    globalConsoleInEffect: "off",
    globalDate: "off",
    globalDateInEffect: "off",
    globalFetch: "off",
    globalFetchInEffect: "off",
    globalRandom: "off",
    globalRandomInEffect: "off",
    globalTimers: "off",
    globalTimersInEffect: "off",
    newPromise: "off",
    nodeBuiltinImport: "off",
    preferSchemaOverJson: "off",
    processEnv: "off",
    processEnvInEffect: "off",
    tryCatchInEffectGen: "off",
  },
  diagnostics: true,
  noExternal: true,
};

export type TsgoAnalysis = {
  readonly output: TsgoOutput;
  readonly files: readonly string[];
};

export const runTsgo = Effect.fn("runTsgo")(function* (
  toolchain: ToolchainPaths,
  tsconfig: string
) {
  const result = yield* runProcess({
    arguments: [
      toolchain.tsgoCli,
      "diagnostics",
      "--project",
      tsconfig,
      "--format",
      "json",
      "--list-files",
      "--lspconfig",
      JSON.stringify(LSP_CONFIG),
    ],
    cwd: toolchain.packageRoot,
    engine: "effect-tsgo",
    executable: process.execPath,
  });

  if (result.exitCode !== 0 && result.exitCode !== 1) {
    return yield* new AnalyzerFailure({
      engine: "effect-tsgo",
      exitCode: result.exitCode,
      message: `Effect TSGo exited with code ${result.exitCode}`,
      stderr: result.stderr,
    });
  }

  const output = yield* Effect.try({
    catch: (cause) =>
      new InvalidAnalyzerOutput({
        engine: "effect-tsgo",
        message: `Invalid Effect TSGo output: ${String(cause)}`,
      }),
    try: () => decodeTsgoOutput(result.stdout),
  });

  return {
    files: output.files.map((file) => file.file),
    output,
  } satisfies TsgoAnalysis;
});

export const validateTsgoFiles = Effect.fn("validateTsgoFiles")(function* (
  root: string,
  analysis: TsgoAnalysis
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const files: {
    readonly absolute: string;
    readonly relative: string;
    readonly source: string;
  }[] = [];

  for (const file of analysis.files) {
    const absolute = yield* fs.realPath(file).pipe(
      Effect.mapError(
        () =>
          new ProjectFailure({
            message: `Effect TSGo reported a file that cannot be resolved: ${file}`,
            root,
          })
      )
    );
    const relative = path.relative(root, absolute).replaceAll("\\", "/");
    if (relative.startsWith("../") || path.isAbsolute(relative)) {
      return yield* new ProjectFailure({
        message: `Effect TSGo reported a file outside the project root: ${file}`,
        root,
      });
    }
    const source = yield* fs.readFileString(absolute).pipe(
      Effect.mapError(
        () =>
          new ProjectFailure({
            message: `Unable to read analyzed source file: ${file}`,
            root,
          })
      )
    );
    files.push({ absolute, relative, source });
  }

  return files.sort((left, right) =>
    left.relative.localeCompare(right.relative)
  );
});

export type AnalyzedSource = {
  readonly absolute: string;
  readonly relative: string;
  readonly source: string;
};

const sourceForDiagnostic = (
  diagnostic: TsgoDiagnostic,
  sources: readonly AnalyzedSource[]
): AnalyzedSource | undefined =>
  sources.find((source) => source.absolute === diagnostic.file);

const DOCTOR_OWNED_DIAGNOSTICS = new Set(["effect(377000)"]);

export const normalizeTsgoFindings = (
  analysis: TsgoAnalysis,
  sources: readonly AnalyzedSource[]
): readonly Finding[] =>
  analysis.output.diagnostics
    .filter((diagnostic) => !DOCTOR_OWNED_DIAGNOSTICS.has(diagnostic.name))
    .map((diagnostic) => {
      const source = sourceForDiagnostic(diagnostic, sources);
      const evidence =
        source?.source.slice(
          diagnostic.start,
          diagnostic.start + diagnostic.length
        ) ?? "";
      const withoutFingerprint = {
        category: tsgoCategory(diagnostic.name),
        evidence,
        location: {
          end: { column: diagnostic.endColumn, line: diagnostic.endLine },
          file: source?.relative ?? diagnostic.file,
          start: { column: diagnostic.column, line: diagnostic.line },
        },
        message: diagnostic.message,
        provenance: {
          engine: "effect-tsgo",
          nativeRuleId: diagnostic.name,
        },
        ruleId: canonicalRuleId(diagnostic.name),
        severity: tsgoSeverity(diagnostic.name, diagnostic.severity),
        title: ruleTitle(diagnostic.name),
      } satisfies FindingWithoutFingerprint;

      return {
        ...withoutFingerprint,
        fingerprint: fingerprintFinding(withoutFingerprint),
      };
    });

export const tsgoEngineRun = (
  sources: readonly AnalyzedSource[]
): EngineRun => ({
  analyzedFiles: sources.map((source) => source.relative),
  complete: true,
  engine: "effect-tsgo",
  version: TOOLCHAIN.tsgo,
});
