import { Buffer } from "node:buffer";

import {
  compareCodeUnits,
  doctorOxlintRules,
  fingerprintFinding,
  integrityOxlintRules,
  ruleForDiagnostic,
} from "@effect-doctor/core";
import type {
  AnalyzerRun,
  Finding,
  FindingWithoutFingerprint,
  RuleCatalogEntry,
  SourceApplicability,
  SourcePosition,
} from "@effect-doctor/core";
import { FileSystem, Path, Effect } from "effect";
import type { Duration } from "effect";

import {
  AnalyzerFailure,
  InvalidAnalyzerOutput,
  ProjectFailure,
} from "../../errors.js";
import { DOCTOR_VERSION } from "../../version.js";
import {
  bytePositionAt,
  codeUnitOffsetAt,
  sourceView,
} from "../project/source-view.js";
import type { AnalyzedSource } from "../project/source-view.js";
import type { ToolchainPaths } from "../project/toolchain.js";
import { decodeOxlintOutput } from "./oxlint-output.js";
import type { OxlintDiagnostic } from "./oxlint-output.js";
import { outputExcerpt, runProcess } from "./process.js";
import {
  DIRECT_EFFECT_REFERENCE_VISIT_MESSAGE,
  isIntegrityVisitMessage,
} from "./rules/diagnostic-suppression-contract.js";

const CONFIG_CATEGORIES = {
  correctness: "off",
  nursery: "off",
  pedantic: "off",
  perf: "off",
  restriction: "off",
  style: "off",
  suspicious: "off",
} satisfies Readonly<Record<string, string>>;

const CANARY_CONFIG_RULE = "effect-doctor/__file-canary";
const CANARY_DIAGNOSTIC_RULE = "effect-doctor(__file-canary)";
const PRIMARY_RULE_COUNT = Object.keys(doctorOxlintRules).length + 1;
const INTEGRITY_RULE_COUNT = Object.keys(integrityOxlintRules).length;

const makePrimaryConfig = (doctorPluginPath: string): string =>
  JSON.stringify({
    categories: CONFIG_CATEGORIES,
    jsPlugins: [doctorPluginPath],
    options: {
      reportUnusedDisableDirectives: "off",
      respectEslintDisableDirectives: true,
    },
    rules: {
      ...doctorOxlintRules,
      [CANARY_CONFIG_RULE]: "warn",
    },
  });

const makeIntegrityConfig = (doctorPluginPath: string): string =>
  JSON.stringify({
    categories: CONFIG_CATEGORIES,
    jsPlugins: [doctorPluginPath],
    options: {
      reportUnusedDisableDirectives: "off",
      respectEslintDisableDirectives: false,
    },
    rules: integrityOxlintRules,
  });

export type OxlintAnalysis = {
  readonly diagnostics: readonly OxlintDiagnosticWithPass[];
  readonly sourceProfiles: readonly OxlintSourceProfile[];
};

export type OxlintSourceProfile = SourceApplicability;

type OxlintPass = "primary" | "integrity";

type OxlintDiagnosticWithPass = OxlintDiagnostic & {
  readonly pass: OxlintPass;
};

type OxlintProcessAnalysis = {
  readonly diagnostics: readonly OxlintDiagnostic[];
  readonly numberOfRules: number;
};

export const oxlintAnalyzerRun = (
  root: string,
  path: Path.Path,
  analysis: OxlintAnalysis,
  sources: readonly AnalyzedSource[]
): AnalyzerRun => {
  const sourceByAbsolute = new Map(
    sources.map((source) => [source.absolute, source.relative])
  );
  const canaryFiles = analysis.diagnostics
    .filter((diagnostic) => diagnostic.code === CANARY_DIAGNOSTIC_RULE)
    .map((diagnostic) => {
      const resolved = path.resolve(root, diagnostic.filename);
      return sourceByAbsolute.get(resolved) ?? resolved;
    })
    .sort(compareCodeUnits);
  return {
    analyzedFiles: canaryFiles,
    complete: canaryFiles.length === sources.length,
    engine: "effect-doctor",
    version: DOCTOR_VERSION,
  };
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

const writeTemporaryConfig = Effect.fn("writeTemporaryConfig")(function* (
  root: string,
  prefix: string,
  contents: string
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const temporaryDirectory = yield* fs.makeTempDirectoryScoped({ prefix }).pipe(
    Effect.mapError(
      () =>
        new ProjectFailure({
          code: "workspace-unavailable",
          message: "Unable to create an isolated Oxlint workspace",
          root,
        })
    )
  );
  const config = path.join(temporaryDirectory, "oxlint.config.json");
  yield* fs.writeFileString(config, contents).pipe(
    Effect.mapError(
      () =>
        new ProjectFailure({
          code: "workspace-unavailable",
          message: "Unable to write the isolated Oxlint configuration",
          root,
        })
    )
  );
  return { config, directory: temporaryDirectory };
});

type OxlintProcessRequest = {
  readonly config: string;
  readonly engine: "effect-doctor";
  readonly plannedRuleCount: number;
  readonly root: string;
  readonly sources: readonly AnalyzedSource[];
  readonly timeout: Duration.Input | undefined;
};

const analyzeWithOxlint = Effect.fn("analyzeWithOxlint")(function* (
  toolchain: ToolchainPaths,
  request: OxlintProcessRequest
) {
  const { engine, plannedRuleCount, sources } = request;
  const result = yield* runProcess({
    arguments: makeArguments(toolchain, request.config, sources),
    cwd: request.root,
    engine,
    executable: process.execPath,
    timeout: request.timeout,
  });
  if (result.exitCode !== 0 && result.exitCode !== 1) {
    return yield* new AnalyzerFailure({
      engine,
      exitCode: result.exitCode,
      message: `Oxlint exited with code ${result.exitCode}`,
      reason: "exit",
      stderr: outputExcerpt(result.stderr),
    });
  }
  const output = yield* Effect.try({
    catch: () =>
      new InvalidAnalyzerOutput({
        engine,
        message: "Oxlint returned invalid analysis output.",
      }),
    try: () =>
      decodeOxlintOutput(result.stdout, sources.length, plannedRuleCount),
  });
  return {
    diagnostics: output.diagnostics,
    numberOfRules: output.number_of_rules,
  } satisfies OxlintProcessAnalysis;
});

const maskIntegritySource = (source: string): string => {
  const masked = source.replaceAll("oxlint-disable", "oxlint_disable");
  if (Buffer.byteLength(masked) !== Buffer.byteLength(source)) {
    throw new Error("Integrity source masking changed byte offsets");
  }
  return masked;
};

type MirroredSource = {
  readonly mirrored: AnalyzedSource;
  readonly original: AnalyzedSource;
};

const workspaceUnavailable = (root: string, message: string): ProjectFailure =>
  new ProjectFailure({ code: "workspace-unavailable", message, root });

const writeIntegritySources = Effect.fn("writeIntegritySources")(function* (
  root: string,
  directory: string,
  sources: readonly AnalyzedSource[]
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const mirrors: MirroredSource[] = [];
  for (const source of sources) {
    const absolute = path.join(directory, "sources", source.relative);
    yield* fs
      .makeDirectory(path.dirname(absolute), { recursive: true })
      .pipe(
        Effect.mapError(() =>
          workspaceUnavailable(
            root,
            "Unable to create an isolated Oxlint workspace"
          )
        )
      );
    const masked = yield* Effect.try({
      catch: () =>
        workspaceUnavailable(
          root,
          "Unable to prepare suppression integrity analysis"
        ),
      try: () => maskIntegritySource(source.source),
    });
    yield* fs
      .writeFileString(absolute, masked)
      .pipe(
        Effect.mapError(() =>
          workspaceUnavailable(
            root,
            "Unable to prepare suppression integrity analysis"
          )
        )
      );
    mirrors.push({
      mirrored: {
        absolute,
        bomLength: 0,
        relative: source.relative,
        source: masked,
      },
      original: source,
    });
  }
  return mirrors;
});

const integrityVisitMismatch = (
  path: Path.Path,
  directory: string,
  analysis: OxlintProcessAnalysis,
  mirrors: readonly MirroredSource[]
): boolean => {
  const visits = analysis.diagnostics
    .filter((diagnostic) => isIntegrityVisitMessage(diagnostic.message))
    .map((diagnostic) => path.resolve(directory, diagnostic.filename))
    .sort(compareCodeUnits);
  const expectedVisits = mirrors
    .map((mirror) => mirror.mirrored.absolute)
    .sort(compareCodeUnits);
  return JSON.stringify(visits) !== JSON.stringify(expectedVisits);
};

const integritySourceProfiles = (
  path: Path.Path,
  directory: string,
  analysis: OxlintProcessAnalysis,
  mirrors: readonly MirroredSource[]
): OxlintSourceProfile[] => {
  const directReferenceFiles = new Set(
    analysis.diagnostics
      .filter(
        (diagnostic) =>
          diagnostic.message === DIRECT_EFFECT_REFERENCE_VISIT_MESSAGE
      )
      .map((diagnostic) => path.resolve(directory, diagnostic.filename))
  );
  return mirrors
    .map((mirror) => ({
      directEffectModuleReference: directReferenceFiles.has(
        mirror.mirrored.absolute
      ),
      file: mirror.original.relative,
    }))
    .sort((left, right) => compareCodeUnits(left.file, right.file));
};

const validateIntegrityAnalysis = Effect.fn("validateIntegrityAnalysis")(
  function* (
    root: string,
    directory: string,
    analysis: OxlintProcessAnalysis,
    mirrors: readonly MirroredSource[]
  ) {
    const path = yield* Path.Path;
    if (analysis.numberOfRules !== INTEGRITY_RULE_COUNT) {
      return yield* new InvalidAnalyzerOutput({
        engine: "effect-doctor",
        message: "Suppression integrity rules were not fully configured.",
      });
    }
    if (integrityVisitMismatch(path, directory, analysis, mirrors)) {
      return yield* new InvalidAnalyzerOutput({
        engine: "effect-doctor",
        message:
          "Suppression integrity analysis did not visit every project file exactly once.",
      });
    }
    const originalByMirror = new Map(
      mirrors.map((mirror) => [
        mirror.mirrored.absolute,
        mirror.original.absolute,
      ])
    );
    const diagnostics: OxlintDiagnostic[] = [];
    for (const diagnostic of analysis.diagnostics) {
      if (isIntegrityVisitMessage(diagnostic.message)) {
        continue;
      }
      const original = originalByMirror.get(
        path.resolve(directory, diagnostic.filename)
      );
      if (original === undefined) {
        return yield* new ProjectFailure({
          code: "coverage-mismatch",
          message: "Suppression integrity analysis reported an unplanned file.",
          root,
        });
      }
      diagnostics.push({ ...diagnostic, filename: original });
    }
    return {
      diagnostics,
      sourceProfiles: integritySourceProfiles(
        path,
        directory,
        analysis,
        mirrors
      ),
    };
  }
);

const runPrimaryPass = Effect.fn("runPrimaryPass")(function* (
  toolchain: ToolchainPaths,
  root: string,
  sources: readonly AnalyzedSource[],
  timeout: Duration.Input | undefined
) {
  const primary = yield* writeTemporaryConfig(
    root,
    "effect-doctor-oxlint-",
    makePrimaryConfig(toolchain.doctorPlugin)
  );
  return yield* analyzeWithOxlint(toolchain, {
    config: primary.config,
    engine: "effect-doctor",
    plannedRuleCount: PRIMARY_RULE_COUNT,
    root,
    sources,
    timeout,
  });
});

const runIntegrityPass = Effect.fn("runIntegrityPass")(function* (
  toolchain: ToolchainPaths,
  root: string,
  sources: readonly AnalyzedSource[],
  timeout: Duration.Input | undefined
) {
  const integrity = yield* writeTemporaryConfig(
    root,
    "effect-doctor-integrity-",
    makeIntegrityConfig(toolchain.doctorPlugin)
  );
  const mirrors = yield* writeIntegritySources(
    root,
    integrity.directory,
    sources
  );
  const analysis = yield* analyzeWithOxlint(toolchain, {
    config: integrity.config,
    engine: "effect-doctor",
    plannedRuleCount: INTEGRITY_RULE_COUNT,
    root: integrity.directory,
    sources: mirrors.map((mirror) => mirror.mirrored),
    timeout,
  });
  return yield* validateIntegrityAnalysis(
    root,
    integrity.directory,
    analysis,
    mirrors
  );
});

const withPass =
  (pass: OxlintPass) =>
  (diagnostic: OxlintDiagnostic): OxlintDiagnosticWithPass => ({
    ...diagnostic,
    pass,
  });

export const runOxlint = Effect.fn("runOxlint")(function* (
  toolchain: ToolchainPaths,
  root: string,
  sources: readonly AnalyzedSource[],
  timeout?: Duration.Input | undefined
) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const [primary, integrity] = yield* Effect.all(
        [
          runPrimaryPass(toolchain, root, sources, timeout),
          runIntegrityPass(toolchain, root, sources, timeout),
        ],
        { concurrency: 2 }
      );
      return {
        diagnostics: [
          ...primary.diagnostics.map(withPass("primary")),
          ...integrity.diagnostics.map(withPass("integrity")),
        ],
        sourceProfiles: integrity.sourceProfiles,
      } satisfies OxlintAnalysis;
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

type OxlintSpan = OxlintDiagnostic["labels"][number]["span"];

type ResolvedSpan = {
  readonly end: SourcePosition;
  readonly evidence: string;
  readonly start: SourcePosition;
};

const matchesReportedPosition = (
  source: AnalyzedSource,
  span: OxlintSpan,
  offset: number
): boolean => {
  const reported = bytePositionAt(sourceView(source), offset);
  const bomColumns = span.line === 1 ? source.bomLength : 0;
  return (
    reported !== undefined &&
    reported.line === span.line &&
    reported.column === span.column - bomColumns
  );
};

/** Oxlint reports byte offsets and byte columns. */
const resolveSpan = (
  source: AnalyzedSource,
  span: OxlintSpan
): ResolvedSpan | undefined => {
  const view = sourceView(source);
  const offset = span.offset - source.bomLength;
  if (span.length === 0 || !matchesReportedPosition(source, span, offset)) {
    return undefined;
  }
  const startOffset = codeUnitOffsetAt(view, offset);
  const endOffset = codeUnitOffsetAt(view, offset + span.length);
  if (startOffset === undefined || endOffset === undefined) {
    return undefined;
  }
  const start = view.index.positionAt(startOffset);
  const end = view.index.positionAt(endOffset);
  if (start === undefined || end === undefined) {
    return undefined;
  }
  const evidence = source.source.slice(startOffset, endOffset);
  return Buffer.byteLength(evidence) === span.length
    ? { end, evidence, start }
    : undefined;
};

const requireOxlintSource = Effect.fn("requireOxlintSource")(function* (
  root: string,
  path: Path.Path,
  diagnostic: OxlintDiagnostic,
  sources: readonly AnalyzedSource[]
) {
  const source = sourceForDiagnostic(root, path, diagnostic, sources);
  if (source === undefined) {
    return yield* new ProjectFailure({
      code: "coverage-mismatch",
      message: `Oxlint reported a file outside the project snapshot: ${path.relative(root, path.resolve(root, diagnostic.filename)).replaceAll("\\", "/")}`,
      root,
    });
  }
  return source;
});

const requireOxlintRule = Effect.fn("requireOxlintRule")(function* (
  diagnostic: OxlintDiagnosticWithPass
) {
  const rule = ruleForDiagnostic(diagnostic.code);
  if (rule === undefined || rule.source !== "effect-doctor") {
    return yield* new InvalidAnalyzerOutput({
      engine: "effect-doctor",
      message: `Oxlint emitted unknown diagnostic: ${diagnostic.code}`,
    });
  }
  return rule;
});

const configuredOxlintSeverity = (
  rule: RuleCatalogEntry
): "error" | "warn" | undefined =>
  rule.execution === "oxlint-integrity"
    ? integrityOxlintRules[rule.providerRuleId]
    : doctorOxlintRules[rule.providerRuleId];

const validateOxlintPolicy = Effect.fn("validateOxlintPolicy")(function* (
  diagnostic: OxlintDiagnosticWithPass,
  rule: RuleCatalogEntry
) {
  const configuredSeverity = configuredOxlintSeverity(rule);
  const expectedPass: OxlintPass =
    rule.execution === "oxlint-integrity" ? "integrity" : "primary";
  const expectedDiagnosticSeverity =
    configuredSeverity === "error" ? "error" : "warning";
  if (
    configuredSeverity === undefined ||
    diagnostic.pass !== expectedPass ||
    diagnostic.severity !== expectedDiagnosticSeverity
  ) {
    return yield* new InvalidAnalyzerOutput({
      engine: rule.source,
      message: "Oxlint diagnostic does not match the configured rule policy.",
    });
  }
});

const makeOxlintFinding = Effect.fn("makeOxlintFinding")(function* (
  diagnostic: OxlintDiagnosticWithPass,
  rule: RuleCatalogEntry,
  source: AnalyzedSource
) {
  const [{ span }] = diagnostic.labels;
  const resolved = resolveSpan(source, span);
  if (resolved === undefined) {
    return yield* new InvalidAnalyzerOutput({
      engine: rule.source,
      message: `Oxlint diagnostic span is outside the project snapshot: ${source.relative}:${span.line}:${span.column}`,
    });
  }
  const withoutFingerprint = {
    category: rule.category,
    evidence: resolved.evidence,
    location: {
      end: resolved.end,
      file: source.relative,
      start: resolved.start,
    },
    message: diagnostic.message,
    provenance: {
      engine: "effect-doctor",
      nativeRuleId: rule.nativeRuleId,
    },
    ruleId: rule.id,
    severity: rule.defaultSeverity,
    title: rule.title,
  } satisfies FindingWithoutFingerprint;
  return {
    ...withoutFingerprint,
    fingerprint: fingerprintFinding(withoutFingerprint),
  } satisfies Finding;
});

export const normalizeOxlintFindings = Effect.fn("normalizeOxlintFindings")(
  function* (
    root: string,
    analysis: Pick<OxlintAnalysis, "diagnostics">,
    sources: readonly AnalyzedSource[]
  ) {
    const path = yield* Path.Path;
    const findings: Finding[] = [];

    for (const diagnostic of analysis.diagnostics) {
      if (diagnostic.code === CANARY_DIAGNOSTIC_RULE) {
        continue;
      }
      const source = yield* requireOxlintSource(
        root,
        path,
        diagnostic,
        sources
      );
      const rule = yield* requireOxlintRule(diagnostic);
      yield* validateOxlintPolicy(diagnostic, rule);
      findings.push(yield* makeOxlintFinding(diagnostic, rule, source));
    }

    return findings;
  }
);
