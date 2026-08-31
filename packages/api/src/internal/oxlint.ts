import { Buffer } from "node:buffer";
import { resolve as resolvePath } from "node:path";

import {
  compareCodeUnits,
  effectOxlintRules,
  fingerprintFinding,
  integrityOxlintRules,
  ruleForDiagnostic,
} from "@effect-doctor/core";
import type {
  AnalyzerRun,
  Finding,
  FindingWithoutFingerprint,
  RuleCatalogEntry,
} from "@effect-doctor/core";
import { FileSystem, Path, Effect } from "effect";
import { RECOMMENDED_RULES } from "oxlint-plugin-effect-doctor";

import {
  AnalyzerFailure,
  InvalidAnalyzerOutput,
  ProjectFailure,
} from "../errors.js";
import { DOCTOR_VERSION } from "../version.js";
import { decodeOxlintOutput } from "./oxlint-output.js";
import type { OxlintDiagnostic } from "./oxlint-output.js";
import { runProcess } from "./process.js";
import { INTEGRITY_VISIT_MESSAGE } from "./rules/diagnostic-suppression-contract.js";
import type { ToolchainPaths } from "./toolchain.js";
import type { TsgoFile } from "./tsgo-output.js";
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

const CANARY_CONFIG_RULE = "effect-doctor/__file-canary";
const CANARY_DIAGNOSTIC_RULE = "effect-doctor(__file-canary)";
const doctorOxlintRules: Readonly<Record<string, "error" | "warn">> =
  RECOMMENDED_RULES;
const PRIMARY_RULE_COUNT =
  Object.keys(effectOxlintRules).length +
  Object.keys(doctorOxlintRules).length +
  1;
const INTEGRITY_RULE_COUNT = Object.keys(integrityOxlintRules).length;

const makePrimaryConfig = (
  effectPluginPath: string,
  doctorPluginPath: string
): string =>
  JSON.stringify({
    categories: CONFIG_CATEGORIES,
    jsPlugins: [effectPluginPath, doctorPluginPath],
    options: {
      reportUnusedDisableDirectives: "off",
      respectEslintDisableDirectives: true,
    },
    rules: {
      ...effectOxlintRules,
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
};

type OxlintPass = "primary" | "integrity";

type OxlintDiagnosticWithPass = OxlintDiagnostic & {
  readonly pass: OxlintPass;
};

type OxlintProcessAnalysis = {
  readonly diagnostics: readonly OxlintDiagnostic[];
  readonly numberOfRules: number;
};

export const oxlintAnalyzerRuns = (
  root: string,
  analysis: OxlintAnalysis,
  sources: readonly AnalyzedSource[],
  effectOxlintVersion: string
): readonly AnalyzerRun[] => {
  const sourceByAbsolute = new Map(
    sources.map((source) => [source.absolute, source.relative])
  );
  const canaryFiles = analysis.diagnostics
    .filter((diagnostic) => diagnostic.code === CANARY_DIAGNOSTIC_RULE)
    .map((diagnostic) => {
      const resolved = resolvePath(root, diagnostic.filename);
      return sourceByAbsolute.get(resolved) ?? resolved;
    })
    .sort(compareCodeUnits);
  const analyzedFiles = sources.map((source) => source.relative);
  return [
    {
      analyzedFiles: canaryFiles,
      complete: canaryFiles.length === sources.length,
      engine: "effect-doctor",
      version: DOCTOR_VERSION,
    },
    {
      analyzedFiles,
      complete: true,
      engine: "effect-oxlint",
      version: effectOxlintVersion,
    },
  ];
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
          message: "Unable to write the isolated Oxlint configuration",
          root,
        })
    )
  );
  return { config, directory: temporaryDirectory };
});

const analyzeWithOxlint = Effect.fn("analyzeWithOxlint")(function* (
  toolchain: ToolchainPaths,
  root: string,
  config: string,
  sources: readonly AnalyzedSource[],
  plannedRuleCount: number,
  engine: "effect-oxlint" | "effect-doctor"
) {
  const result = yield* runProcess({
    arguments: makeArguments(toolchain, config, sources),
    cwd: root,
    engine,
    executable: process.execPath,
  });
  if (result.exitCode !== 0 && result.exitCode !== 1) {
    return yield* new AnalyzerFailure({
      engine,
      exitCode: result.exitCode,
      message: `Oxlint exited with code ${result.exitCode}`,
      reason: "exit",
      stderr: "",
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

const writeIntegritySources = Effect.fn("writeIntegritySources")(function* (
  root: string,
  directory: string,
  sources: readonly AnalyzedSource[]
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const mirrored: AnalyzedSource[] = [];
  for (const source of sources) {
    const absolute = path.join(directory, "sources", source.relative);
    yield* fs.makeDirectory(path.dirname(absolute), { recursive: true }).pipe(
      Effect.mapError(
        () =>
          new ProjectFailure({
            message: "Unable to create an isolated Oxlint workspace",
            root,
          })
      )
    );
    const masked = yield* Effect.try({
      catch: () =>
        new ProjectFailure({
          message: "Unable to prepare suppression integrity analysis",
          root,
        }),
      try: () => maskIntegritySource(source.source),
    });
    yield* fs.writeFileString(absolute, masked).pipe(
      Effect.mapError(
        () =>
          new ProjectFailure({
            message: "Unable to prepare suppression integrity analysis",
            root,
          })
      )
    );
    mirrored.push({ absolute, relative: source.relative, source: masked });
  }
  return mirrored;
});

const validateIntegrityAnalysis = Effect.fn("validateIntegrityAnalysis")(
  function* (
    root: string,
    directory: string,
    analysis: OxlintProcessAnalysis,
    mirrored: readonly AnalyzedSource[],
    originals: readonly AnalyzedSource[]
  ) {
    const path = yield* Path.Path;
    if (analysis.numberOfRules !== INTEGRITY_RULE_COUNT) {
      return yield* new InvalidAnalyzerOutput({
        engine: "effect-doctor",
        message: "Suppression integrity rules were not fully configured.",
      });
    }

    const visits = analysis.diagnostics
      .filter((diagnostic) => diagnostic.message === INTEGRITY_VISIT_MESSAGE)
      .map((diagnostic) => path.resolve(directory, diagnostic.filename))
      .sort(compareCodeUnits);
    const expectedVisits = mirrored
      .map((source) => source.absolute)
      .sort(compareCodeUnits);
    if (JSON.stringify(visits) !== JSON.stringify(expectedVisits)) {
      return yield* new InvalidAnalyzerOutput({
        engine: "effect-doctor",
        message:
          "Suppression integrity analysis did not visit every project file exactly once.",
      });
    }

    const originalByMirror = new Map(
      mirrored.map((source, index) => [
        source.absolute,
        originals[index]?.absolute,
      ])
    );
    const diagnostics: OxlintDiagnostic[] = [];
    for (const diagnostic of analysis.diagnostics) {
      if (diagnostic.message === INTEGRITY_VISIT_MESSAGE) {
        continue;
      }
      const mirroredPath = path.resolve(directory, diagnostic.filename);
      const original = originalByMirror.get(mirroredPath);
      if (original === undefined) {
        return yield* new ProjectFailure({
          message: "Suppression integrity analysis reported an unplanned file.",
          root,
        });
      }
      diagnostics.push({ ...diagnostic, filename: original });
    }
    return diagnostics;
  }
);

export const runOxlint = Effect.fn("runOxlint")(function* (
  toolchain: ToolchainPaths,
  root: string,
  sources: readonly AnalyzedSource[]
) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const primary = yield* writeTemporaryConfig(
        root,
        "effect-doctor-oxlint-",
        makePrimaryConfig(toolchain.effectPlugin, toolchain.doctorPlugin)
      );
      const integrity = yield* writeTemporaryConfig(
        root,
        "effect-doctor-integrity-",
        makeIntegrityConfig(toolchain.doctorPlugin)
      );
      const mirrored = yield* writeIntegritySources(
        root,
        integrity.directory,
        sources
      );
      const [primaryAnalysis, integrityAnalysis] = yield* Effect.all(
        [
          analyzeWithOxlint(
            toolchain,
            root,
            primary.config,
            sources,
            PRIMARY_RULE_COUNT,
            "effect-oxlint"
          ),
          analyzeWithOxlint(
            toolchain,
            integrity.directory,
            integrity.config,
            mirrored,
            INTEGRITY_RULE_COUNT,
            "effect-doctor"
          ),
        ],
        { concurrency: 2 }
      );
      const integrityDiagnostics = yield* validateIntegrityAnalysis(
        root,
        integrity.directory,
        integrityAnalysis,
        mirrored,
        sources
      );
      return {
        diagnostics: [
          ...primaryAnalysis.diagnostics.map((diagnostic) => ({
            ...diagnostic,
            pass: "primary" as const,
          })),
          ...integrityDiagnostics.map((diagnostic) => ({
            ...diagnostic,
            pass: "integrity" as const,
          })),
        ],
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

const positionAtByteOffset = (
  source: Buffer,
  offset: number
): { readonly column: number; readonly line: number } | undefined => {
  if (offset > source.byteLength) {
    return undefined;
  }
  const prefix = source.subarray(0, offset).toString("utf-8");
  if (Buffer.byteLength(prefix) !== offset) {
    return undefined;
  }
  let line = 1;
  for (const byte of source.subarray(0, offset)) {
    if (byte === 0x0a) {
      line += 1;
    }
  }
  const lastNewline = source.subarray(0, offset).lastIndexOf(0x0a);
  return {
    column: offset - lastNewline,
    line,
  };
};

const extractEvidence = (
  source: string,
  span: OxlintSpan
): string | undefined => {
  const bytes = Buffer.from(source);
  const endOffset = span.offset + span.length;
  const start = positionAtByteOffset(bytes, span.offset);
  const end = positionAtByteOffset(bytes, endOffset);
  if (
    span.length === 0 ||
    start === undefined ||
    end === undefined ||
    start.line !== span.line ||
    start.column !== span.column
  ) {
    return undefined;
  }
  const evidence = bytes.subarray(span.offset, endOffset).toString("utf-8");
  return Buffer.byteLength(evidence) === span.length ? evidence : undefined;
};

const endPosition = (
  line: number,
  column: number,
  evidence: string
): { readonly line: number; readonly column: number } => {
  const lines = evidence.split(/\r?\n/u);
  if (lines.length === 1) {
    return { column: column + Buffer.byteLength(evidence), line };
  }
  return {
    column: Buffer.byteLength(lines.at(-1) ?? "") + 1,
    line: line + lines.length - 1,
  };
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
      message: "Oxlint reported a file outside the project snapshot.",
      root,
    });
  }
  return source;
});

const requireOxlintRule = Effect.fn("requireOxlintRule")(function* (
  diagnostic: OxlintDiagnosticWithPass
) {
  const rule = ruleForDiagnostic(diagnostic.code);
  if (rule === undefined || rule.source === "effect-tsgo") {
    return yield* new InvalidAnalyzerOutput({
      engine: diagnostic.code.startsWith("effect-doctor(")
        ? "effect-doctor"
        : "effect-oxlint",
      message: `Oxlint emitted unknown diagnostic: ${diagnostic.code}`,
    });
  }
  return rule;
});

const configuredOxlintSeverity = (
  rule: RuleCatalogEntry
): "error" | "warn" | undefined => {
  if (rule.source === "effect-oxlint") {
    return effectOxlintRules[rule.providerRuleId];
  }
  return rule.execution === "oxlint-integrity"
    ? integrityOxlintRules[rule.providerRuleId]
    : doctorOxlintRules[rule.providerRuleId];
};

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

const requireV4OxlintFile = Effect.fn("requireV4OxlintFile")(function* (
  root: string,
  path: Path.Path,
  rule: RuleCatalogEntry,
  source: AnalyzedSource,
  fileVersions: readonly TsgoFile[]
) {
  const fileVersion = fileVersions.find(
    (file) => path.resolve(root, file.file) === source.absolute
  );
  if (
    fileVersion === undefined ||
    fileVersion.detectedEffect !== "v4" ||
    fileVersion.supportedEffect !== "v4"
  ) {
    return yield* new InvalidAnalyzerOutput({
      engine: rule.source,
      message: "Oxlint diagnostic requires an Effect v4 file inventory.",
    });
  }
});

const makeOxlintFinding = Effect.fn("makeOxlintFinding")(function* (
  diagnostic: OxlintDiagnosticWithPass,
  rule: RuleCatalogEntry,
  source: AnalyzedSource
) {
  const [{ span }] = diagnostic.labels;
  const evidence = extractEvidence(source.source, span);
  if (evidence === undefined) {
    return yield* new InvalidAnalyzerOutput({
      engine: rule.source,
      message: "Oxlint diagnostic span is outside the project snapshot.",
    });
  }
  const withoutFingerprint = {
    category: rule.category,
    evidence,
    location: {
      end: endPosition(span.line, span.column, evidence),
      file: source.relative,
      start: { column: span.column, line: span.line },
    },
    message: diagnostic.message,
    provenance: {
      engine: rule.source,
      nativeRuleId:
        rule.source === "effect-doctor" ? rule.nativeRuleId : diagnostic.code,
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
    analysis: OxlintAnalysis,
    sources: readonly AnalyzedSource[],
    fileVersions: readonly TsgoFile[]
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
      yield* requireV4OxlintFile(root, path, rule, source, fileVersions);
      findings.push(yield* makeOxlintFinding(diagnostic, rule, source));
    }

    return findings;
  }
);
