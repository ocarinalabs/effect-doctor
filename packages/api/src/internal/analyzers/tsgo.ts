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
  SourcePosition,
} from "@effect-doctor/core";
import { FileSystem, Path, Effect } from "effect";
import type { Duration } from "effect";

import {
  InvalidAnalyzerOutput,
  AnalyzerFailure,
  ProjectFailure,
} from "../../errors.js";
import type { ProjectSnapshot } from "../project/snapshot.js";
import { sourceView } from "../project/source-view.js";
import type { AnalyzedSource } from "../project/source-view.js";
import type { ToolchainPaths } from "../project/toolchain.js";
import { outputExcerpt, runProcess } from "./process.js";
import { decodeTsgoOutput } from "./tsgo-output.js";
import type { TsgoDiagnostic, TsgoOutput } from "./tsgo-output.js";

export type { AnalyzedSource } from "../project/source-view.js";

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
  tsconfig: string,
  timeout?: Duration.Input | undefined
) {
  const path = yield* Path.Path;
  const cwd = path.dirname(tsconfig);
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
    timeout,
  });

  if (result.exitCode !== 0 && result.exitCode !== 1) {
    return yield* new AnalyzerFailure({
      engine: "effect-tsgo",
      exitCode: result.exitCode,
      message: `Effect TSGo exited with code ${result.exitCode}`,
      reason: "exit",
      stderr: outputExcerpt(result.stderr),
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

const unsupportedEffectFailure = (
  snapshot: ProjectSnapshot,
  files: TsgoOutput["files"],
  path: Path.Path
): ProjectFailure | undefined => {
  const file = files.find(
    (entry) => entry.detectedEffect !== "v4" || entry.supportedEffect !== "v4"
  );
  if (file === undefined) {
    return undefined;
  }
  const relative = path
    .relative(snapshot.root, file.file)
    .replaceAll("\\", "/");
  return new ProjectFailure({
    code: "effect-unsupported",
    message: `${relative} is not compiled against Effect v4 (detected ${file.detectedEffect}). Effect Doctor analyzes only projects that depend on effect 4.x. Select one with --project.`,
    root: snapshot.root,
  });
};

export const validateTsgoFiles = Effect.fn("validateTsgoFiles")(function* (
  snapshot: ProjectSnapshot,
  analysis: TsgoAnalysis,
  version: string
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const reportedFiles: string[] = [];
  const unsupported = unsupportedEffectFailure(
    snapshot,
    analysis.output.files,
    path
  );
  if (unsupported !== undefined) {
    return yield* unsupported;
  }

  for (const file of analysis.files) {
    const absolute = yield* fs.realPath(file).pipe(
      Effect.mapError(
        () =>
          new ProjectFailure({
            code: "coverage-mismatch",
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
        code: "outside-root",
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

const usesWindowsPathSemantics = (value: string): boolean =>
  process.platform === "win32" ||
  /^[A-Za-z]:[\\/]/u.test(value) ||
  value.startsWith("\\\\");

const windowsIdentity = (path: Path.Path, value: string): string =>
  (process.platform === "win32"
    ? path.normalize(value)
    : value.replaceAll("/", "\\")
  ).toLowerCase();

const providerPathIdentity = Effect.fn("providerPathIdentity")(function* (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  value: string
) {
  const canonical = yield* fs
    .realPath(value)
    .pipe(Effect.orElseSucceed(() => undefined));
  if (canonical !== undefined) {
    return usesWindowsPathSemantics(canonical)
      ? windowsIdentity(path, canonical)
      : canonical;
  }
  return usesWindowsPathSemantics(value)
    ? windowsIdentity(path, value)
    : path.resolve(value);
});

type SourceLookup = {
  readonly find: (providerPath: string) => AnalyzedSource | undefined;
};

const makeSourceLookup = Effect.fn("makeSourceLookup")(function* (
  sources: readonly AnalyzedSource[],
  providerPaths: readonly string[]
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const byIdentity = new Map<string, AnalyzedSource>();
  for (const source of sources) {
    byIdentity.set(
      yield* providerPathIdentity(fs, path, source.absolute),
      source
    );
  }
  const resolved = new Map<string, AnalyzedSource | undefined>();
  for (const providerPath of new Set(providerPaths)) {
    resolved.set(
      providerPath,
      byIdentity.get(yield* providerPathIdentity(fs, path, providerPath))
    );
  }
  return {
    find: (providerPath) => resolved.get(providerPath),
  } satisfies SourceLookup;
});

type ResolvedSpan = {
  readonly end: SourcePosition;
  readonly evidence: string;
  readonly start: SourcePosition;
};

const samePosition = (
  position: SourcePosition,
  line: number,
  column: number
): boolean => position.line === line && position.column === column;

const resolveSpan = (
  diagnostic: TsgoDiagnostic,
  source: AnalyzedSource
): ResolvedSpan | undefined => {
  const { index } = sourceView(source);
  const endOffset = diagnostic.start + diagnostic.length;
  const start = index.positionAt(diagnostic.start);
  const end = index.positionAt(endOffset);
  if (
    start === undefined ||
    end === undefined ||
    !samePosition(start, diagnostic.line, diagnostic.column) ||
    !samePosition(end, diagnostic.endLine, diagnostic.endColumn)
  ) {
    return undefined;
  }
  return {
    end,
    evidence: source.source.slice(diagnostic.start, endOffset),
    start,
  };
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

const requireTsgoSpan = Effect.fn("requireTsgoSpan")(function* (
  diagnostic: TsgoDiagnostic,
  sources: SourceLookup
) {
  const source = sources.find(diagnostic.file);
  if (source === undefined) {
    return yield* new InvalidAnalyzerOutput({
      engine: "effect-tsgo",
      message: "Effect TSGo diagnostic source is outside the project snapshot.",
    });
  }
  const span = resolveSpan(diagnostic, source);
  if (span === undefined) {
    return yield* new InvalidAnalyzerOutput({
      engine: "effect-tsgo",
      message: `Effect TSGo diagnostic span is outside the project snapshot: ${source.relative}:${diagnostic.line}:${diagnostic.column}`,
    });
  }
  return { source, span };
});

const makeTsgoFinding = (
  diagnostic: TsgoDiagnostic,
  rule: RuleCatalogEntry,
  source: AnalyzedSource,
  span: ResolvedSpan
): Finding => {
  const withoutFingerprint = {
    category: rule.category,
    evidence: span.evidence,
    location: {
      end: span.end,
      file: source.relative,
      start: span.start,
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
    const lookup = yield* makeSourceLookup(
      sources,
      analysis.output.diagnostics.map((diagnostic) => diagnostic.file)
    );
    const findings: Finding[] = [];
    for (const diagnostic of analysis.output.diagnostics) {
      const rule = yield* ruleForTsgoFinding(diagnostic);
      if (rule === undefined) {
        continue;
      }
      yield* validateTsgoRule(diagnostic, rule);
      const { source, span } = yield* requireTsgoSpan(diagnostic, lookup);
      findings.push(makeTsgoFinding(diagnostic, rule, source, span));
    }
    return findings;
  }
);
