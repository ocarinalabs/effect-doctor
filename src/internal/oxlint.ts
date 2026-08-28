import { Buffer } from "node:buffer";

import { FileSystem, Path, Effect } from "effect";

import {
  AnalyzerFailure,
  InvalidAnalyzerOutput,
  ProjectFailure,
} from "../errors.js";
import { fingerprintFinding } from "../fingerprint.js";
import type {
  EngineRun,
  Finding,
  FindingWithoutFingerprint,
} from "../model.js";
import { canonicalRuleId, effectOxlintRules, ruleTitle } from "../rules.js";
import { TOOLCHAIN } from "../version.js";
import { decodeOxlintOutput } from "./oxlint-output.js";
import type { OxlintDiagnostic } from "./oxlint-output.js";
import { runProcess } from "./process.js";
import type { ToolchainPaths } from "./toolchain.js";
import type { AnalyzedSource } from "./tsgo.js";

const CONFIG_CATEGORIES = {
  correctness: "off",
  nursery: "off",
  pedantic: "off",
  perf: "off",
  restriction: "off",
  style: "off",
  suspicious: "off",
} satisfies Readonly<Record<string, string>>;

const makeConfig = (pluginPath: string): string =>
  JSON.stringify({
    categories: CONFIG_CATEGORIES,
    jsPlugins: [pluginPath],
    options: {
      reportUnusedDisableDirectives: "warn",
      respectEslintDisableDirectives: true,
    },
    rules: effectOxlintRules,
  });

type OxlintAnalysis = {
  readonly diagnostics: readonly OxlintDiagnostic[];
};

const makeArguments = (
  toolchain: ToolchainPaths,
  config: string,
  sources: readonly AnalyzedSource[]
): readonly string[] => [
  toolchain.oxlintCli,
  "-c",
  config,
  "-f",
  "json",
  "--disable-nested-config",
  "--no-ignore",
  "--threads",
  "1",
  ...sources.map((source) => source.absolute),
];

const writeTemporaryConfig = Effect.fn("writeTemporaryOxlintConfig")(function* (
  root: string,
  pluginPath: string
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const temporaryDirectory = yield* fs
    .makeTempDirectoryScoped({ prefix: "effect-doctor-oxlint-" })
    .pipe(
      Effect.mapError(
        () =>
          new ProjectFailure({
            message: "Unable to create an isolated Oxlint workspace",
            root,
          })
      )
    );
  const config = path.join(temporaryDirectory, "oxlint.config.json");
  yield* fs.writeFileString(config, makeConfig(pluginPath)).pipe(
    Effect.mapError(
      () =>
        new ProjectFailure({
          message: "Unable to write the isolated Oxlint configuration",
          root,
        })
    )
  );
  return config;
});

const analyzeWithOxlint = Effect.fn("analyzeWithOxlint")(function* (
  toolchain: ToolchainPaths,
  root: string,
  config: string,
  sources: readonly AnalyzedSource[]
) {
  const result = yield* runProcess({
    arguments: makeArguments(toolchain, config, sources),
    cwd: root,
    engine: "effect-oxlint",
    executable: process.execPath,
  });
  if (result.exitCode !== 0 && result.exitCode !== 1) {
    return yield* new AnalyzerFailure({
      engine: "effect-oxlint",
      exitCode: result.exitCode,
      message: `Oxlint exited with code ${result.exitCode}`,
      stderr: result.stderr,
    });
  }
  const output = yield* Effect.try({
    catch: (cause) =>
      new InvalidAnalyzerOutput({
        engine: "effect-oxlint",
        message: `Invalid Oxlint output: ${String(cause)}`,
      }),
    try: () => decodeOxlintOutput(result.stdout, sources.length),
  });
  return { diagnostics: output.diagnostics } satisfies OxlintAnalysis;
});

const verifySourcesUnchanged = Effect.fn("verifySourcesUnchanged")(function* (
  root: string,
  sources: readonly AnalyzedSource[]
) {
  const fs = yield* FileSystem.FileSystem;
  for (const source of sources) {
    const current = yield* fs.readFileString(source.absolute).pipe(
      Effect.mapError(
        () =>
          new ProjectFailure({
            message: `Unable to verify analyzed source file: ${source.relative}`,
            root,
          })
      )
    );
    if (current !== source.source) {
      return yield* new ProjectFailure({
        message: `Source changed during analysis: ${source.relative}`,
        root,
      });
    }
  }
});

export const runOxlint = Effect.fn("runOxlint")(function* (
  toolchain: ToolchainPaths,
  root: string,
  sources: readonly AnalyzedSource[]
) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const config = yield* writeTemporaryConfig(root, toolchain.effectPlugin);
      const analysis = yield* analyzeWithOxlint(
        toolchain,
        root,
        config,
        sources
      );
      yield* verifySourcesUnchanged(root, sources);
      return analysis;
    })
  );
});

const sourceForDiagnostic = (
  root: string,
  path: Path.Path,
  diagnostic: OxlintDiagnostic,
  sources: readonly AnalyzedSource[]
): AnalyzedSource | undefined => {
  const absolute = path.resolve(root, diagnostic.filename);
  return sources.find((source) => source.absolute === absolute);
};

const extractEvidence = (
  source: string,
  offset: number,
  length: number
): string =>
  Buffer.from(source)
    .subarray(offset, offset + length)
    .toString("utf-8");

const endPosition = (
  line: number,
  column: number,
  evidence: string
): { readonly line: number; readonly column: number } => {
  const lines = evidence.split(/\r?\n/u);
  if (lines.length === 1) {
    return { column: column + [...evidence].length, line };
  }
  return {
    column: [...(lines.at(-1) ?? "")].length + 1,
    line: line + lines.length - 1,
  };
};

export const normalizeOxlintFindings = Effect.fn("normalizeOxlintFindings")(
  function* (
    root: string,
    analysis: OxlintAnalysis,
    sources: readonly AnalyzedSource[]
  ) {
    const path = yield* Path.Path;
    const findings: Finding[] = [];

    for (const diagnostic of analysis.diagnostics) {
      const source = sourceForDiagnostic(root, path, diagnostic, sources);
      if (source === undefined) {
        return yield* new ProjectFailure({
          message: `Oxlint reported an unplanned file: ${diagnostic.filename}`,
          root,
        });
      }
      const [{ span }] = diagnostic.labels;
      const evidence = extractEvidence(source.source, span.offset, span.length);
      const withoutFingerprint = {
        category: "antipattern",
        evidence,
        location: {
          end: endPosition(span.line, span.column, evidence),
          file: source.relative,
          start: { column: span.column, line: span.line },
        },
        message: diagnostic.message,
        provenance: {
          engine: "effect-oxlint",
          nativeRuleId: diagnostic.code,
        },
        ruleId: canonicalRuleId(diagnostic.code),
        severity: "advice",
        title: ruleTitle(diagnostic.code),
      } satisfies FindingWithoutFingerprint;
      findings.push({
        ...withoutFingerprint,
        fingerprint: fingerprintFinding(withoutFingerprint),
      });
    }

    return findings;
  }
);

export const oxlintEngineRun = (
  sources: readonly AnalyzedSource[]
): EngineRun => ({
  analyzedFiles: sources.map((source) => source.relative),
  complete: true,
  engine: "effect-oxlint",
  version: TOOLCHAIN.effectOxlint,
});
