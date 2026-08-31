import { dirname, resolve as resolvePath, win32 } from "node:path";

import {
  compareCodeUnits,
  fingerprintFinding,
  ruleForTsgoDiagnostic,
  tsgoDiagnosticSeverity,
} from "@effect-doctor/core";
import type {
  AnalyzerRun,
  Finding,
  FindingWithoutFingerprint,
  RuleCatalogEntry,
} from "@effect-doctor/core";
import { FileSystem, Path, Effect } from "effect";

import {
  InvalidAnalyzerOutput,
  AnalyzerFailure,
  ProjectFailure,
} from "../errors.js";
import { runProcess } from "./process.js";
import type { ProjectSnapshot } from "./project-snapshot.js";
import type { ToolchainPaths } from "./toolchain.js";
import { decodeTsgoOutput } from "./tsgo-output.js";
import type { TsgoDiagnostic, TsgoOutput } from "./tsgo-output.js";

const LSP_CONFIG = {
  diagnosticSeverity: tsgoDiagnosticSeverity,
  diagnostics: true,
  noExternal: true,
};

type TsgoAnalysis = {
  readonly output: TsgoOutput;
  readonly files: readonly string[];
};

export const runTsgo = Effect.fn("runTsgo")(function* (
  toolchain: ToolchainPaths,
  tsconfig: string
) {
  const cwd = dirname(tsconfig);
  const request = {
    cwd,
    format: "json",
    listFiles: true,
    lspconfig: JSON.stringify(LSP_CONFIG),
    progress: false,
    project: tsconfig,
    strict: false,
  };
  const result = yield* runProcess({
    arguments: ["--effect-cli-diagnostics", JSON.stringify(request)],
    cwd,
    engine: "effect-tsgo",
    executable: toolchain.tsgoExecutable,
  });

  if (result.exitCode !== 0 && result.exitCode !== 1) {
    return yield* new AnalyzerFailure({
      engine: "effect-tsgo",
      exitCode: result.exitCode,
      message: `Effect TSGo exited with code ${result.exitCode}`,
      reason: "exit",
      stderr: "",
    });
  }

  const output = yield* Effect.try({
    catch: () =>
      new InvalidAnalyzerOutput({
        engine: "effect-tsgo",
        message: "Effect TSGo returned invalid analysis output.",
      }),
    try: () => decodeTsgoOutput(result.stdout),
  });

  return {
    files: output.files.map((file) => file.file),
    output,
  } satisfies TsgoAnalysis;
});

export const validateTsgoFiles = Effect.fn("validateTsgoFiles")(function* (
  snapshot: ProjectSnapshot,
  analysis: TsgoAnalysis,
  version: string
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const reportedFiles: string[] = [];

  for (const file of analysis.files) {
    const absolute = yield* fs.realPath(file).pipe(
      Effect.mapError(
        () =>
          new ProjectFailure({
            message: "Effect TSGo reported an unresolved project file.",
            root: snapshot.root,
          })
      )
    );
    const relative = path
      .relative(snapshot.root, absolute)
      .replaceAll("\\", "/");
    if (relative.startsWith("../") || path.isAbsolute(relative)) {
      return yield* new ProjectFailure({
        message: "Effect TSGo reported a file outside the project root.",
        root: snapshot.root,
      });
    }
    reportedFiles.push(relative);
  }

  reportedFiles.sort(compareCodeUnits);
  return {
    analyzedFiles: reportedFiles,
    complete: true,
    engine: "effect-tsgo",
    version,
  } satisfies AnalyzerRun;
});

export type AnalyzedSource = {
  readonly absolute: string;
  readonly relative: string;
  readonly source: string;
};

const usesWindowsPathSemantics = (value: string): boolean =>
  process.platform === "win32" ||
  /^[A-Za-z]:[\\/]/u.test(value) ||
  value.startsWith("\\\\");

const providerPathIdentity = (value: string): string =>
  usesWindowsPathSemantics(value)
    ? win32.normalize(value).toLowerCase()
    : resolvePath(value);

const sourceForDiagnostic = (
  diagnostic: TsgoDiagnostic,
  sources: readonly AnalyzedSource[]
): AnalyzedSource | undefined => {
  const diagnosticPath = providerPathIdentity(diagnostic.file);
  return sources.find(
    (source) => providerPathIdentity(source.absolute) === diagnosticPath
  );
};

const positionAtOffset = (
  source: string,
  offset: number
): { readonly column: number; readonly line: number } | undefined => {
  if (offset > source.length) {
    return undefined;
  }
  const lines = source.slice(0, offset).split(/\r?\n/u);
  return {
    column: (lines.at(-1) ?? "").length + 1,
    line: lines.length,
  };
};

const hasValidSpan = (diagnostic: TsgoDiagnostic, source: string): boolean => {
  const start = positionAtOffset(source, diagnostic.start);
  const end = positionAtOffset(source, diagnostic.start + diagnostic.length);
  return (
    start !== undefined &&
    end !== undefined &&
    start.line === diagnostic.line &&
    start.column === diagnostic.column &&
    end.line === diagnostic.endLine &&
    end.column === diagnostic.endColumn
  );
};

const ruleForTsgoFinding = Effect.fn("ruleForTsgoFinding")(function* (
  diagnostic: TsgoDiagnostic
) {
  const rule = ruleForTsgoDiagnostic(diagnostic.name, diagnostic.code);
  if (rule?.source === "effect-doctor") {
    return undefined;
  }
  if (rule === undefined || rule.source !== "effect-tsgo") {
    return yield* new InvalidAnalyzerOutput({
      engine: "effect-tsgo",
      message: `Effect TSGo emitted unknown diagnostic: ${diagnostic.name}`,
    });
  }
  return rule;
});

const validateTsgoRule = Effect.fn("validateTsgoRule")(function* (
  diagnostic: TsgoDiagnostic,
  rule: RuleCatalogEntry
) {
  const configuredSeverity = tsgoDiagnosticSeverity[rule.providerRuleId];
  if (
    configuredSeverity === undefined ||
    configuredSeverity !== diagnostic.severity
  ) {
    return yield* new InvalidAnalyzerOutput({
      engine: "effect-tsgo",
      message: `Effect TSGo diagnostic disagrees with catalog policy: ${diagnostic.name}`,
    });
  }
});

const requireTsgoSource = Effect.fn("requireTsgoSource")(function* (
  diagnostic: TsgoDiagnostic,
  sources: readonly AnalyzedSource[]
) {
  const source = sourceForDiagnostic(diagnostic, sources);
  if (source === undefined) {
    return yield* new InvalidAnalyzerOutput({
      engine: "effect-tsgo",
      message: "Effect TSGo diagnostic source is outside the project snapshot.",
    });
  }
  if (!hasValidSpan(diagnostic, source.source)) {
    return yield* new InvalidAnalyzerOutput({
      engine: "effect-tsgo",
      message: "Effect TSGo diagnostic span is outside the project snapshot.",
    });
  }
  return source;
});

const makeTsgoFinding = (
  diagnostic: TsgoDiagnostic,
  rule: RuleCatalogEntry,
  source: AnalyzedSource
): Finding => {
  const evidence = source.source.slice(
    diagnostic.start,
    diagnostic.start + diagnostic.length
  );
  const withoutFingerprint = {
    category: rule.category,
    evidence,
    location: {
      end: { column: diagnostic.endColumn, line: diagnostic.endLine },
      file: source.relative,
      start: { column: diagnostic.column, line: diagnostic.line },
    },
    message: diagnostic.message,
    provenance: {
      engine: "effect-tsgo",
      nativeRuleId: diagnostic.name,
    },
    ruleId: rule.id,
    severity: rule.defaultSeverity,
    title: rule.title,
  } satisfies FindingWithoutFingerprint;
  return {
    ...withoutFingerprint,
    fingerprint: fingerprintFinding(withoutFingerprint),
  };
};

export const normalizeTsgoFindings = Effect.fn("normalizeTsgoFindings")(
  function* (analysis: TsgoAnalysis, sources: readonly AnalyzedSource[]) {
    const findings: Finding[] = [];
    for (const diagnostic of analysis.output.diagnostics) {
      const rule = yield* ruleForTsgoFinding(diagnostic);
      if (rule === undefined) {
        continue;
      }
      yield* validateTsgoRule(diagnostic, rule);
      const source = yield* requireTsgoSource(diagnostic, sources);
      findings.push(makeTsgoFinding(diagnostic, rule, source));
    }
    return findings;
  }
);
