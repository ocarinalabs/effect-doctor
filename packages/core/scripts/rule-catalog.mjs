import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

import effectDoctorPlugin from "oxlint-plugin-effect-doctor";

import { compareCodeUnits } from "../src/internal/order.ts";
import { PINNED_TOOLCHAIN } from "../src/pinned-toolchain.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const outputPath = resolve(projectRoot, "src/generated/rule-catalog.ts");
const metadataInputPath = resolve(
  projectRoot,
  "vendor/effect-tsgo/metadata-0.45.0.json"
);
const PINNED_METADATA_SHA256 =
  "1b77d4e6800bdb6b77e3a71514aa526a45d127d2e6943dcddfa004fe98d7e518";
const args = new Set(process.argv.slice(2));
const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
};

const ERROR_OXLINT_RULES = new Set([
  "no-managed-runtime-in-effect",
  "no-unbounded-concurrency",
]);

// Every finding is a mandatory fix, so a rule stays only when the fix is right in
// every file it applies to. These TSGo rules report ordinary code outside Effect
// generators, library-author conventions, or general TypeScript style.
const DROPPED_TSGO_RULES = new Set([
  "asyncFunction",
  "deterministicKeys",
  "globalConsole",
  "globalDate",
  "globalFetch",
  "globalTimers",
  "missingPipeableSignature",
  "newSchemaClass",
  "preferSchemaOverJson",
  "schemaNumber",
  "schemaSync",
  "serviceNotAsClass",
  "strictBooleanExpressions",
  "strictEffectProvide",
  "unnecessaryArrowBlock",
]);

const ALWAYS_RULE_IDS = new Set([
  "effect-doctor/consistent-effect-fn-name",
  "effect-doctor/diagnostic-suppression",
  "effect-doctor/no-duplicate-layer-factory-call",
  "effect-doctor/no-inline-schema-compile",
  "effect-doctor/no-long-lived-layer-acquisition",
  "effect-doctor/no-manual-sql-transaction",
  "effect-doctor/no-multiple-callback-resume",
  "effect-doctor/no-mutation-after-unsafe-chunk-wrap",
  "effect-doctor/no-network-in-sql-transaction",
  "effect-doctor/no-run-sync-on-suspending-effect",
  "effect-doctor/no-throw-in-effect-generator",
  "effect-doctor/no-unredacted-value-in-diagnostic",
  "effect-doctor/prefer-abort-signal-passthrough",
  "effect-doctor/prefer-config-redacted",
  "effect-doctor/prefer-http-json-response",
  "effect-doctor/prefer-structured-log-data",
  "effect/abort-controller-in-effect",
  "effect/acquire-release-disposable",
  "effect/all-of-map-to-for-each",
  "effect/any-unknown-in-error-context",
  "effect/catch-all-tag-dispatch-to-catch-tag",
  "effect/catch-all-to-map-error",
  "effect/catch-chain-to-first-success-of",
  "effect/catch-conditional-refail-to-catch-if",
  "effect/catch-die-to-or-die",
  "effect/catch-tag-to-catch-reason",
  "effect/catch-to-ignore",
  "effect/catch-to-or-else-succeed",
  "effect/catch-unfailable-effect",
  "effect/class-self-mismatch",
  "effect/crypto-random-uuid-in-effect",
  "effect/duplicate-package",
  "effect/effect-do-notation",
  "effect/effect-fn-iife",
  "effect/effect-fn-implicit-any",
  "effect/effect-fn-opportunity",
  "effect/effect-gen-uses-adapter",
  "effect/effect-in-failure",
  "effect/effect-in-void-success",
  "effect/effect-map-flatten",
  "effect/effect-map-void",
  "effect/effect-succeed-with-void",
  "effect/flat-map-conditional-to-filter-or-fail",
  "effect/flat-map-to-map",
  "effect/floating-effect",
  "effect/floating-effect-in-vitest",
  "effect/global-console-in-effect",
  "effect/global-date-in-effect",
  "effect/global-error-in-effect-catch",
  "effect/global-error-in-effect-failure",
  "effect/global-fetch-in-effect",
  "effect/global-random-in-effect",
  "effect/global-timers-in-effect",
  "effect/instance-of-schema",
  "effect/layer-merge-all-with-dependencies",
  "effect/lazy-effect",
  "effect/lazy-promise-in-effect-sync",
  "effect/leaking-requirements",
  "effect/map-some-to-as-some",
  "effect/match-effect-to-map-both",
  "effect/match-effect-to-match",
  "effect/missing-effect-context",
  "effect/missing-effect-error",
  "effect/missing-layer-context",
  "effect/missing-return-yield-star",
  "effect/missing-star-in-yield-effect-gen",
  "effect/multiple-catch-tag",
  "effect/multiple-effect-provide",
  "effect/nested-effect-gen-yield",
  "effect-doctor/no-managed-runtime-in-effect",
  "effect-doctor/no-sequential-effect-all",
  "effect-doctor/no-unbounded-concurrency",
  "effect/obsolete-match-import",
  "effect/obsolete-schema-import",
  "effect/option-match-to-from-option",
  "effect/outdated-api",
  "effect/overridden-schema-constructor",
  "effect-doctor/prefer-catch-tag",
  "effect-doctor/prefer-effect-fn",
  "effect/prefer-schema-type-property",
  "effect/prefer-succeed-some-or-none",
  "effect/prefer-typed-schema-decoder",
  "effect/prefer-unsafe-constructor",
  "effect/process-env-in-effect",
  "effect/promise-in-effect-success",
  "effect/provide-layer-succeed-to-provide-service",
  "effect/race-first-with-sleep-to-timeout",
  "effect/redundant-map-error",
  "effect/redundant-or-die",
  "effect/redundant-schema-tag-identifier",
  "effect-doctor/require-named-effect-fn",
  "effect/return-effect-in-gen",
  "effect/run-effect-inside-effect",
  "effect/run-of-exit-to-run-exit",
  "effect/schema-literal-non-finite",
  "effect/schema-opaque-instance-member",
  "effect/schema-struct-with-tag",
  "effect/schema-sync-in-effect",
  "effect/sync-to-succeed",
  "effect/timeout-catch-tag-to-timeout-or-else",
  "effect/try-catch-in-effect-gen",
  "effect/unknown-in-effect-catch",
  "effect/unnecessary-effect-gen",
  "effect/unnecessary-fail-yieldable-error",
  "effect/unnecessary-pipe",
  "effect/unnecessary-pipe-chain",
  "effect/unsafe-effect-type-assertion",
]);

const DIRECT_EFFECT_MODULE_RULE_IDS = new Set([
  "effect/crypto-random-uuid",
  "effect/global-random",
  "effect/node-builtin-import",
  "effect/process-env",
  "effect/extends-native-error",
  "effect/missed-pipeable-opportunity",
  "effect/new-promise",
  "effect-doctor/no-module-mocks",
  "effect-doctor/prefer-match-tags-exhaustive",
  "effect-doctor/prefer-predicate-is-tagged",
  "effect/unnecessary-typeof-type",
]);

const ruleApplicability = (id) => {
  if (ALWAYS_RULE_IDS.has(id)) {
    return "always";
  }
  if (DIRECT_EFFECT_MODULE_RULE_IDS.has(id)) {
    return "direct-effect-module";
  }
  throw new Error(`Rule ${id} has no explicit applicability family`);
};

const normalizeCategory = (group) =>
  group === "effectNative" ? "effect-native" : group;

const toKebabCase = (value) =>
  value
    .replaceAll(/(?<lower>[a-z\d])(?<upper>[A-Z])/gu, "$<lower>-$<upper>")
    .replaceAll(/(?<acronym>[A-Z]+)(?<word>[A-Z][a-z])/gu, "$<acronym>-$<word>")
    .replaceAll(/[\s_]+/gu, "-")
    .toLowerCase();

const title = (value) =>
  toKebabCase(value)
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");

const severity = (providerSeverity) =>
  providerSeverity === "error" ? "error" : "warning";

const oxlintSeverity = (name) =>
  ERROR_OXLINT_RULES.has(name) ? "error" : "warning";

const oxlintCategory = (name) => {
  if (
    ["no-managed-runtime-in-effect", "no-unbounded-concurrency"].includes(name)
  ) {
    return "resource-safety";
  }
  return "antipattern";
};

const readJson = (path) => JSON.parse(readFileSync(path, "utf-8"));

const verifyMetadataSource = (source) => {
  const digest = createHash("sha256").update(source).digest("hex");
  if (digest !== PINNED_METADATA_SHA256) {
    throw new Error(
      `Expected exact @effect/tsgo 0.45.0 metadata ${PINNED_METADATA_SHA256}, got ${digest}`
    );
  }
};

const requireRefreshSource = (metadataPath, reference) => {
  if (!args.has("--refresh-input")) {
    return;
  }
  if (metadataPath !== undefined || reference !== undefined) {
    return;
  }
  throw new Error("--refresh-input requires --metadata or --reference");
};

const referenceMetadata = (reference) =>
  execFileSync(
    "git",
    [
      "-C",
      resolve(reference),
      "show",
      "@effect/tsgo@0.45.0:_packages/tsgo/src/metadata.json",
    ],
    { encoding: "utf-8" }
  );

const metadataSource = (metadataPath, reference) => {
  if (metadataPath !== undefined) {
    return readFileSync(resolve(metadataPath), "utf-8");
  }
  if (reference !== undefined) {
    return referenceMetadata(reference);
  }
  return readFileSync(metadataInputPath, "utf-8");
};

const readMetadata = () => {
  const metadataPath = valueAfter("--metadata");
  const reference = valueAfter("--reference");
  requireRefreshSource(metadataPath, reference);
  const source = metadataSource(metadataPath, reference);
  verifyMetadataSource(source);
  if (args.has("--refresh-input")) {
    mkdirSync(dirname(metadataInputPath), { recursive: true });
    writeFileSync(metadataInputPath, source);
  }
  return JSON.parse(source);
};

const supportsEffectV4 = (rule) => rule.supportedEffect.includes("v4");

const isActiveTsgoRule = (rule) =>
  supportsEffectV4(rule) && !DROPPED_TSGO_RULES.has(rule.name);

const makeTsgoEntries = (metadata) =>
  metadata.rules.filter(isActiveTsgoRule).map((rule) => ({
    category: normalizeCategory(rule.group),
    defaultSeverity: severity(rule.defaultSeverity),
    description: rule.description,
    diagnosticCodes: rule.codes,
    diagnosticRuleIds: [rule.name],
    execution: "tsgo",
    fixable: rule.fixable,
    id: `effect/${toKebabCase(rule.name)}`,
    nativeRuleId: rule.name,
    providerDefaultSeverity: rule.defaultSeverity,
    providerRuleId: rule.name,
    source: "effect-tsgo",
    title: title(rule.name),
  }));

const oxlintDescription = (name, docs) =>
  typeof docs?.description === "string"
    ? docs.description
    : `Effect Doctor rule ${name}`;

const isOxlintFixable = (fixable) => ["code", "whitespace"].includes(fixable);

const makeAdoptedEntry = ([name, rule]) => {
  const docs = rule.meta?.docs;
  return {
    category: oxlintCategory(name),
    description: oxlintDescription(name, docs),
    diagnosticCodes: [],
    defaultSeverity: oxlintSeverity(name),
    diagnosticRuleIds: [`effect-doctor(${name})`],
    execution: "oxlint",
    fixable: isOxlintFixable(rule.meta?.fixable),
    id: `effect-doctor/${name}`,
    nativeRuleId: name,
    providerDefaultSeverity: "error",
    providerRuleId: `effect-doctor/${name}`,
    source: "effect-doctor",
    title: title(name),
  };
};

const installedPluginRules = () => Object.entries(effectDoctorPlugin.rules);

const makeAdoptedEntries = () => {
  const authoredNames = new Set(
    DOCTOR_ENTRIES.map((entry) => entry.nativeRuleId)
  );
  return installedPluginRules()
    .filter(([name]) => !authoredNames.has(name))
    .map(makeAdoptedEntry);
};

const DOCTOR_ENTRIES = [
  {
    category: "effect-native",
    defaultSeverity: "warning",
    description:
      "Keep unqualified Effect.fn span names consistent with their assigned function names.",
    diagnosticCodes: [],
    diagnosticRuleIds: ["effect-doctor(consistent-effect-fn-name)"],
    execution: "oxlint",
    fixable: false,
    id: "effect-doctor/consistent-effect-fn-name",
    nativeRuleId: "consistent-effect-fn-name",
    providerDefaultSeverity: "warning",
    providerRuleId: "effect-doctor/consistent-effect-fn-name",
    source: "effect-doctor",
    title: "Consistent Effect Fn Name",
  },
  {
    category: "antipattern",
    defaultSeverity: "warning",
    description:
      "Keeps analyzer suppression directives visible for explicit review.",
    diagnosticCodes: [377_000],
    diagnosticRuleIds: [
      "effect-doctor(__diagnostic-suppression-integrity)",
      "effect(377000)",
    ],
    execution: "oxlint-integrity",
    fixable: false,
    id: "effect-doctor/diagnostic-suppression",
    nativeRuleId: "diagnostic-suppression",
    providerDefaultSeverity: "warning",
    providerRuleId: "effect-doctor/__diagnostic-suppression-integrity",
    source: "effect-doctor",
    title: "Diagnostic Suppression",
  },
  {
    category: "resource-safety",
    defaultSeverity: "warning",
    description:
      "Reuse a zero-argument Layer factory result within one composition graph unless the duplicate is explicitly fresh.",
    diagnosticCodes: [],
    diagnosticRuleIds: ["effect-doctor(no-duplicate-layer-factory-call)"],
    execution: "oxlint",
    fixable: false,
    id: "effect-doctor/no-duplicate-layer-factory-call",
    nativeRuleId: "no-duplicate-layer-factory-call",
    providerDefaultSeverity: "warning",
    providerRuleId: "effect-doctor/no-duplicate-layer-factory-call",
    source: "effect-doctor",
    title: "No Duplicate Layer Factory Call",
  },
  {
    category: "antipattern",
    defaultSeverity: "warning",
    description:
      "Reuse closed Effect v4 schemas and parser adapters outside repeated function execution.",
    diagnosticCodes: [],
    diagnosticRuleIds: ["effect-doctor(no-inline-schema-compile)"],
    execution: "oxlint",
    fixable: false,
    id: "effect-doctor/no-inline-schema-compile",
    nativeRuleId: "no-inline-schema-compile",
    providerDefaultSeverity: "warning",
    providerRuleId: "effect-doctor/no-inline-schema-compile",
    source: "effect-doctor",
    title: "No Inline Schema Compile",
  },
  {
    category: "resource-safety",
    defaultSeverity: "error",
    description:
      "Fork provably long-lived work into the Layer scope instead of blocking acquisition.",
    diagnosticCodes: [],
    diagnosticRuleIds: ["effect-doctor(no-long-lived-layer-acquisition)"],
    execution: "oxlint",
    fixable: false,
    id: "effect-doctor/no-long-lived-layer-acquisition",
    nativeRuleId: "no-long-lived-layer-acquisition",
    providerDefaultSeverity: "warning",
    providerRuleId: "effect-doctor/no-long-lived-layer-acquisition",
    source: "effect-doctor",
    title: "No Long Lived Layer Acquisition",
  },
  {
    category: "correctness",
    defaultSeverity: "error",
    description:
      "Call an Effect.callback continuation at most once on a straight-line path.",
    diagnosticCodes: [],
    diagnosticRuleIds: ["effect-doctor(no-multiple-callback-resume)"],
    execution: "oxlint",
    fixable: false,
    id: "effect-doctor/no-multiple-callback-resume",
    nativeRuleId: "no-multiple-callback-resume",
    providerDefaultSeverity: "warning",
    providerRuleId: "effect-doctor/no-multiple-callback-resume",
    source: "effect-doctor",
    title: "No Multiple Callback Resume",
  },
  {
    category: "correctness",
    defaultSeverity: "error",
    description:
      "Prevent direct mutation of arrays shared with Chunk.fromArrayUnsafe.",
    diagnosticCodes: [],
    diagnosticRuleIds: ["effect-doctor(no-mutation-after-unsafe-chunk-wrap)"],
    execution: "oxlint",
    fixable: false,
    id: "effect-doctor/no-mutation-after-unsafe-chunk-wrap",
    nativeRuleId: "no-mutation-after-unsafe-chunk-wrap",
    providerDefaultSeverity: "warning",
    providerRuleId: "effect-doctor/no-mutation-after-unsafe-chunk-wrap",
    source: "effect-doctor",
    title: "No Mutation After Unsafe Chunk Wrap",
  },
  {
    category: "resource-safety",
    defaultSeverity: "error",
    description:
      "Use Effect SQL transaction ownership instead of sending transaction-control statements manually.",
    diagnosticCodes: [],
    diagnosticRuleIds: ["effect-doctor(no-manual-sql-transaction)"],
    execution: "oxlint",
    fixable: false,
    id: "effect-doctor/no-manual-sql-transaction",
    nativeRuleId: "no-manual-sql-transaction",
    providerDefaultSeverity: "warning",
    providerRuleId: "effect-doctor/no-manual-sql-transaction",
    source: "effect-doctor",
    title: "No Manual SQL Transaction",
  },
  {
    category: "security",
    defaultSeverity: "error",
    description:
      "Prevent Redacted.value from exposing secrets directly inside diagnostic and telemetry sinks.",
    diagnosticCodes: [],
    diagnosticRuleIds: ["effect-doctor(no-unredacted-value-in-diagnostic)"],
    execution: "oxlint",
    fixable: false,
    id: "effect-doctor/no-unredacted-value-in-diagnostic",
    nativeRuleId: "no-unredacted-value-in-diagnostic",
    providerDefaultSeverity: "warning",
    providerRuleId: "effect-doctor/no-unredacted-value-in-diagnostic",
    source: "effect-doctor",
    title: "No Unredacted Value In Diagnostic",
  },
  {
    category: "resource-safety",
    defaultSeverity: "error",
    description:
      "Keep direct HTTP work outside Effect SQL transaction effects.",
    diagnosticCodes: [],
    diagnosticRuleIds: ["effect-doctor(no-network-in-sql-transaction)"],
    execution: "oxlint",
    fixable: false,
    id: "effect-doctor/no-network-in-sql-transaction",
    nativeRuleId: "no-network-in-sql-transaction",
    providerDefaultSeverity: "warning",
    providerRuleId: "effect-doctor/no-network-in-sql-transaction",
    source: "effect-doctor",
    title: "No Network In SQL Transaction",
  },
  {
    category: "correctness",
    defaultSeverity: "error",
    description:
      "Avoid synchronous runners for Effect constructors that are proven to suspend.",
    diagnosticCodes: [],
    diagnosticRuleIds: ["effect-doctor(no-run-sync-on-suspending-effect)"],
    execution: "oxlint",
    fixable: false,
    id: "effect-doctor/no-run-sync-on-suspending-effect",
    nativeRuleId: "no-run-sync-on-suspending-effect",
    providerDefaultSeverity: "warning",
    providerRuleId: "effect-doctor/no-run-sync-on-suspending-effect",
    source: "effect-doctor",
    title: "No Run Sync On Suspending Effect",
  },
  {
    category: "correctness",
    defaultSeverity: "error",
    description:
      "Keep escaping exceptions out of confirmed Effect generator bodies.",
    diagnosticCodes: [],
    diagnosticRuleIds: ["effect-doctor(no-throw-in-effect-generator)"],
    execution: "oxlint",
    fixable: false,
    id: "effect-doctor/no-throw-in-effect-generator",
    nativeRuleId: "no-throw-in-effect-generator",
    providerDefaultSeverity: "warning",
    providerRuleId: "effect-doctor/no-throw-in-effect-generator",
    source: "effect-doctor",
    title: "No Throw In Effect Generator",
  },
  {
    category: "resource-safety",
    defaultSeverity: "warning",
    description:
      "Forward Effect's AbortSignal when adapting a directly cancellable fetch promise.",
    diagnosticCodes: [],
    diagnosticRuleIds: ["effect-doctor(prefer-abort-signal-passthrough)"],
    execution: "oxlint",
    fixable: false,
    id: "effect-doctor/prefer-abort-signal-passthrough",
    nativeRuleId: "prefer-abort-signal-passthrough",
    providerDefaultSeverity: "warning",
    providerRuleId: "effect-doctor/prefer-abort-signal-passthrough",
    source: "effect-doctor",
    title: "Prefer Abort Signal Passthrough",
  },
  {
    category: "security",
    defaultSeverity: "error",
    description:
      "Redact statically named secret configuration values at construction.",
    diagnosticCodes: [],
    diagnosticRuleIds: ["effect-doctor(prefer-config-redacted)"],
    execution: "oxlint",
    fixable: false,
    id: "effect-doctor/prefer-config-redacted",
    nativeRuleId: "prefer-config-redacted",
    providerDefaultSeverity: "warning",
    providerRuleId: "effect-doctor/prefer-config-redacted",
    source: "effect-doctor",
    title: "Prefer Config Redacted",
  },
  {
    category: "effect-native",
    defaultSeverity: "warning",
    description:
      "Pass structured values directly to Effect logging instead of serializing them first.",
    diagnosticCodes: [],
    diagnosticRuleIds: ["effect-doctor(prefer-structured-log-data)"],
    execution: "oxlint",
    fixable: false,
    id: "effect-doctor/prefer-structured-log-data",
    nativeRuleId: "prefer-structured-log-data",
    providerDefaultSeverity: "warning",
    providerRuleId: "effect-doctor/prefer-structured-log-data",
    source: "effect-doctor",
    title: "Prefer Structured Log Data",
  },
  {
    category: "effect-native",
    defaultSeverity: "warning",
    description:
      "Use Effect's JSON response constructor instead of stringifying into a text response.",
    diagnosticCodes: [],
    diagnosticRuleIds: ["effect-doctor(prefer-http-json-response)"],
    execution: "oxlint",
    fixable: false,
    id: "effect-doctor/prefer-http-json-response",
    nativeRuleId: "prefer-http-json-response",
    providerDefaultSeverity: "warning",
    providerRuleId: "effect-doctor/prefer-http-json-response",
    source: "effect-doctor",
    title: "Prefer HTTP JSON Response",
  },
];

const sortEntries = (entries) =>
  entries.sort(
    (left, right) =>
      compareCodeUnits(left.id, right.id) ||
      compareCodeUnits(left.source, right.source)
  );

const makeEntries = (metadata) =>
  sortEntries(
    [
      ...makeTsgoEntries(metadata),
      ...makeAdoptedEntries(),
      ...DOCTOR_ENTRIES,
    ].map((entry) => ({
      ...entry,
      applicability: ruleApplicability(entry.id),
    }))
  );

const assertCount = (label, actual, expected) => {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
};

const assertProviderCounts = (entries) => {
  const expectedCounts = {
    "effect-doctor": 25,
    "effect-tsgo": 93,
  };
  for (const [source, count] of Object.entries(expectedCounts)) {
    const actual = entries.filter((entry) => entry.source === source).length;
    assertCount(source, actual, count);
  }
};

const assertUniqueCanonicalIds = (entries) => {
  const ids = new Set(entries.map((entry) => entry.id));
  if (ids.size !== entries.length) {
    throw new Error("Canonical rule IDs must be unique");
  }
};

const assertTsgoCodes = (tsgo) => {
  const tsgoCodes = tsgo.flatMap((entry) => entry.diagnosticCodes);
  if (tsgoCodes.length !== 101 || new Set(tsgoCodes).size !== 101) {
    throw new Error("Expected 101 unique TSGo diagnostic codes");
  }
};

const assertDistribution = (entries, field, expected, label) => {
  for (const [value, count] of Object.entries(expected)) {
    const actual = entries.filter((entry) => entry[field] === value).length;
    assertCount(`${label} ${value}`, actual, count);
  }
};

const assertUniqueDiagnosticRuleIds = (entries) => {
  const diagnosticRuleIds = entries.flatMap((entry) => entry.diagnosticRuleIds);
  if (diagnosticRuleIds.length !== new Set(diagnosticRuleIds).size) {
    throw new Error("Native diagnostic rule IDs must be unique");
  }
};

const assertApplicabilityPolicy = (entries) => {
  const catalogIds = entries.map((entry) => entry.id).sort(compareCodeUnits);
  const policyIds = [...ALWAYS_RULE_IDS, ...DIRECT_EFFECT_MODULE_RULE_IDS].sort(
    compareCodeUnits
  );
  if (JSON.stringify(catalogIds) !== JSON.stringify(policyIds)) {
    throw new Error(
      "Every canonical rule must have exactly one explicit applicability family"
    );
  }
  assertCount("active rules", entries.length, 118);
  assertDistribution(
    entries,
    "applicability",
    { always: 107, "direct-effect-module": 11 },
    "applicability"
  );
  const errors = entries.filter((entry) => entry.defaultSeverity === "error");
  assertCount("error rules", errors.length, 23);
  if (errors.some((entry) => entry.applicability !== "always")) {
    throw new Error("Every error rule must always apply");
  }
};

const assertCatalog = (entries) => {
  assertProviderCounts(entries);
  assertUniqueCanonicalIds(entries);
  const tsgo = entries.filter((entry) => entry.source === "effect-tsgo");
  assertTsgoCodes(tsgo);
  assertDistribution(
    tsgo,
    "category",
    {
      antipattern: 18,
      correctness: 19,
      "effect-native": 15,
      style: 41,
    },
    "TSGo category"
  );
  assertDistribution(
    tsgo,
    "providerDefaultSeverity",
    { error: 12, off: 20, suggestion: 46, warning: 15 },
    "TSGo severity"
  );
  assertCount(
    "fixable TSGo rules",
    tsgo.filter((entry) => entry.fixable).length,
    46
  );
  assertUniqueDiagnosticRuleIds(entries);
  assertApplicabilityPolicy(entries);
};

const disabledTsgoRules = (metadata) =>
  metadata.rules
    .filter((rule) => !isActiveTsgoRule(rule))
    .map((rule) => rule.name)
    .sort(compareCodeUnits);

const render = (entries, metadata) =>
  `// Generated by scripts/rule-catalog.mjs. Do not edit by hand.\n` +
  `export const GENERATED_DISABLED_TSGO_RULES = ${JSON.stringify(disabledTsgoRules(metadata), null, 2)} as const;\n` +
  `export const GENERATED_RULE_CATALOG = ${JSON.stringify(entries, null, 2)} as const;\n`;

const parseGenerated = () => {
  const source = readFileSync(outputPath, "utf-8");
  const prefix = "export const GENERATED_RULE_CATALOG = ";
  const start = source.indexOf(prefix);
  const end = source.indexOf(" as const;", start);
  if (start === -1 || end === -1) {
    throw new Error("Invalid generated catalog format");
  }
  return JSON.parse(source.slice(start + prefix.length, end));
};

const verifyProviderVersions = (installed) => {
  for (const [name, version] of Object.entries(PINNED_TOOLCHAIN)) {
    if (installed[name].version !== version) {
      throw new Error(`Installed ${name} version differs from its pin`);
    }
  }
};

const assertSameInventory = (label, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} catalog does not match the installed inventory`);
  }
};

// The published @effect/tsgo schema.json matched the tagged metadata at 0.45.0.
// List a rule here when a release publishes a schema that omits it or keeps an
// older description, so the drift check names the release instead of failing.
const PUBLISHED_SCHEMA_OMISSIONS = new Set();

const PUBLISHED_SCHEMA_STALE_DESCRIPTIONS = new Set();

const verifyTsgoSchemaEntry = (schemaRules, entry) => {
  const schemaRule = schemaRules[entry.providerRuleId];
  if (PUBLISHED_SCHEMA_OMISSIONS.has(entry.providerRuleId)) {
    if (schemaRule !== undefined) {
      throw new Error(
        `${entry.providerRuleId} is in the published TSGo schema; remove it from PUBLISHED_SCHEMA_OMISSIONS`
      );
    }
    return;
  }
  if (schemaRule.default !== entry.providerDefaultSeverity) {
    throw new Error(`TSGo severity drift for ${entry.providerRuleId}`);
  }
  const staleDescription = PUBLISHED_SCHEMA_STALE_DESCRIPTIONS.has(
    entry.providerRuleId
  );
  if ((schemaRule.description !== entry.description) !== staleDescription) {
    throw new Error(`TSGo metadata drift for ${entry.providerRuleId}`);
  }
};

const verifyTsgoSchema = (schemaRules, catalogTsgo, metadata) => {
  const schemaNames = Object.keys(schemaRules).sort(compareCodeUnits);
  const metadataNames = metadata.rules
    .map((rule) => rule.name)
    .filter((name) => !PUBLISHED_SCHEMA_OMISSIONS.has(name))
    .sort(compareCodeUnits);
  assertSameInventory("TSGo schema", schemaNames, metadataNames);
  const v4Names = metadata.rules
    .filter(isActiveTsgoRule)
    .map((rule) => rule.name)
    .sort(compareCodeUnits);
  const catalogNames = catalogTsgo
    .map((entry) => entry.providerRuleId)
    .sort(compareCodeUnits);
  assertSameInventory("TSGo Effect v4", v4Names, catalogNames);
  for (const entry of catalogTsgo) {
    verifyTsgoSchemaEntry(schemaRules, entry);
  }
};

const verifyPluginInventory = (entries) => {
  const installedNames = installedPluginRules()
    .map(([name]) => name)
    .sort(compareCodeUnits);
  const catalogNames = entries
    .filter(
      (entry) =>
        entry.source === "effect-doctor" && entry.execution === "oxlint"
    )
    .map((entry) => entry.nativeRuleId)
    .sort(compareCodeUnits);
  assertSameInventory("Effect Doctor plugin", installedNames, catalogNames);
};

const verifyInstalledProviders = (entries, metadata) => {
  const tsgoPackage = require.resolve("@effect/tsgo/package.json");
  const tsgoRoot = dirname(tsgoPackage);
  const requireFromTsgo = createRequire(tsgoPackage);
  const installed = {
    effect: readJson(require.resolve("effect/package.json")),
    oxlint: readJson(require.resolve("oxlint/package.json")),
    oxlintPlugins: readJson(
      resolve(dirname(require.resolve("@oxlint/plugins")), "package.json")
    ),
    tsgo: readJson(tsgoPackage),
    tsgoPlatform: readJson(
      requireFromTsgo.resolve(
        `@effect/tsgo-${process.platform}-${process.arch}/package.json`
      )
    ),
    typescript: readJson(require.resolve("typescript/package.json")),
  };
  verifyProviderVersions(installed);
  const schema = readJson(resolve(tsgoRoot, "schema.json"));
  const schemaRules =
    schema.definitions.effectLanguageServicePluginDiagnosticSeverityDefinition
      .properties;
  const catalogTsgo = entries.filter((entry) => entry.source === "effect-tsgo");
  verifyTsgoSchema(schemaRules, catalogTsgo, metadata);
  verifyPluginInventory(entries);
};

const metadata = readMetadata();
if (args.has("--write")) {
  const entries = makeEntries(metadata);
  assertCatalog(entries);
  verifyInstalledProviders(entries, metadata);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, render(entries, metadata));
  process.stdout.write(`wrote ${outputPath}\n`);
} else {
  const entries = parseGenerated();
  assertCatalog(entries);
  verifyInstalledProviders(entries, metadata);
  const expected = makeEntries(metadata);
  if (render(entries, metadata) !== render(expected, metadata)) {
    throw new Error("Generated catalog differs from pinned reference metadata");
  }
  process.stderr.write("rule catalog is current\n");
}
