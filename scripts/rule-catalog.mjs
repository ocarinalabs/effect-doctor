import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { rules as effectOxlintRules } from "oxlint-plugin-effect";

import { compareCodeUnits } from "../src/internal/order.ts";
import { PINNED_TOOLCHAIN } from "../src/version.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const outputPath = resolve(projectRoot, "src/generated/rule-catalog.ts");
const metadataInputPath = resolve(
  projectRoot,
  "vendor/effect-tsgo/metadata-0.38.0.json"
);
const PINNED_METADATA_SHA256 =
  "8efebbb2bd64e8947f3f62bc17cca83f1ffa996175d2c4b3be1a3cda9b88df61";
const args = new Set(process.argv.slice(2));
const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
};

const BLOCK = new Set([
  "noChainedTypeAssertions",
  "noManagedRuntimeInEffect",
  "noPerCallCacheConstruction",
  "noRunCollectOnUnboundedStream",
  "noUnboundedConcurrency",
  "noUnboundedRetry",
  "noWidenThenAssert",
]);
const ADVISE = new Set([
  "noModuleMocks",
  "noObjectParameters",
  "noSequentialEffectAll",
  "preferCatchTag",
  "preferMatchTagsExhaustive",
  "preferPredicateIsTagged",
  "preferServiceOf",
  "requireNamedEffectFn",
]);
const PREVIEW = new Set([
  "noKnownValueWidening",
  "noTestLifecycleHooks",
  "noUnknownTypeAliases",
]);
const DELEGATE = new Set([
  "noAsyncFunction",
  "noEffectBind",
  "noEffectDo",
  "noGlobals",
  "noInlineProvide",
  "noNestedEffectGen",
  "noNewPromise",
  "noNodeBuiltinImport",
  "noSilentCatchAll",
  "noTryCatch",
  "preferEffectFn",
]);
const REJECT = new Set([
  "noAs",
  "noConditionalEmptyObjectSpread",
  "noDynamicImports",
  "noNewError",
  "noNullish",
  "noRuntimeTypeof",
  "noShapeInSymbolNames",
  "noTernary",
  "noThrowStatement",
  "noUnknownParameters",
  "noUnsafeDictionaryType",
]);

const OXLINT_POLICIES = new Map([
  ...[...BLOCK].map((name) => [
    name,
    {
      defaultEnabled: true,
      defaultSeverity: "error",
      selection: "enforce",
      status: "blocking",
    },
  ]),
  ...[...ADVISE].map((name) => [
    name,
    {
      defaultEnabled: true,
      defaultSeverity: "advice",
      selection: "advise",
      status: "advisory",
    },
  ]),
  ...[...PREVIEW].map((name) => [
    name,
    {
      defaultEnabled: false,
      defaultSeverity: "advice",
      selection: "preview",
      status: "preview",
    },
  ]),
  ...[...DELEGATE].map((name) => [
    name,
    {
      defaultEnabled: false,
      defaultSeverity: "advice",
      selection: "delegate",
      status: "disabled",
    },
  ]),
  ...[...REJECT].map((name) => [
    name,
    {
      defaultEnabled: false,
      defaultSeverity: "advice",
      selection: "reject",
      status: "disabled",
    },
  ]),
]);

const normalizeCategory = (group) =>
  group === "effectNative" ? "effect-native" : group;

const toKebabCase = (value) =>
  value
    .replaceAll(/(?<lower>[a-z\d])(?<upper>[A-Z])/gu, "$<lower>-$<upper>")
    .replaceAll(/[\s_]+/gu, "-")
    .toLowerCase();

const title = (value) =>
  toKebabCase(value)
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");

const severity = (providerSeverity) => {
  if (providerSeverity === "error" || providerSeverity === "warning") {
    return providerSeverity;
  }
  return "advice";
};

const tsgoStatus = (providerSeverity) => {
  if (providerSeverity === "error") {
    return "blocking";
  }
  if (providerSeverity === "warning") {
    return "advisory";
  }
  if (providerSeverity === "suggestion") {
    return "preview";
  }
  return "disabled";
};

const oxlintPolicy = (name) => {
  const policy = OXLINT_POLICIES.get(name);
  if (policy === undefined) {
    throw new Error(`Missing Effect Oxlint policy for ${name}`);
  }
  return policy;
};

const oxlintCategory = (name) => {
  if (
    [
      "noManagedRuntimeInEffect",
      "noPerCallCacheConstruction",
      "noRunCollectOnUnboundedStream",
      "noUnboundedConcurrency",
      "noUnboundedRetry",
    ].includes(name)
  ) {
    return "resource-safety";
  }
  if (
    [
      "noChainedTypeAssertions",
      "noKnownValueWidening",
      "noObjectParameters",
      "noUnknownParameters",
      "noUnknownTypeAliases",
      "noUnsafeDictionaryType",
      "noWidenThenAssert",
    ].includes(name)
  ) {
    return "correctness";
  }
  return "antipattern";
};

const effectVersions = (value) => {
  if (value === "both") {
    return ["v3", "v4"];
  }
  if (value === "v3" || value === "v4") {
    return [value];
  }
  return [];
};

const readJson = (path) => JSON.parse(readFileSync(path, "utf-8"));

const verifyMetadataSource = (source) => {
  const digest = createHash("sha256").update(source).digest("hex");
  if (digest !== PINNED_METADATA_SHA256) {
    throw new Error(
      `Expected exact @effect/tsgo 0.38.0 metadata ${PINNED_METADATA_SHA256}, got ${digest}`
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
      "@effect/tsgo@0.38.0:_packages/tsgo/src/metadata.json",
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

const makeTsgoEntries = (metadata) =>
  metadata.rules.map((rule) => ({
    category: normalizeCategory(rule.group),
    defaultEnabled:
      rule.defaultSeverity === "error" || rule.defaultSeverity === "warning",
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
    selection: "provider-default",
    source: "effect-tsgo",
    status: tsgoStatus(rule.defaultSeverity),
    supportedEffectVersions: rule.supportedEffect,
    title: title(rule.name),
  }));

const oxlintDescription = (name, docs) =>
  typeof docs?.description === "string"
    ? docs.description
    : `Effect Oxlint rule ${name}`;

const isOxlintFixable = (fixable) => ["code", "whitespace"].includes(fixable);

const makeOxlintEntry = ([name, rule]) => {
  const docs = rule.meta?.docs;
  return {
    category: oxlintCategory(name),
    description: oxlintDescription(name, docs),
    diagnosticCodes: [],
    diagnosticRuleIds: [`effect(${name})`],
    execution: "oxlint",
    fixable: isOxlintFixable(rule.meta?.fixable),
    id: `effect/${toKebabCase(name)}`,
    nativeRuleId: `effect/${name}`,
    providerDefaultSeverity: "off",
    providerRuleId: `effect/${name}`,
    source: "effect-oxlint",
    supportedEffectVersions: effectVersions(docs?.effectVersion),
    title: title(name),
    ...oxlintPolicy(name),
  };
};

const makeOxlintEntries = () =>
  Object.entries(effectOxlintRules).map(makeOxlintEntry);

const makeDoctorEntries = () => [
  {
    category: "antipattern",
    defaultEnabled: true,
    defaultSeverity: "advice",
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
    selection: "advise",
    source: "effect-doctor",
    status: "advisory",
    supportedEffectVersions: ["v3", "v4"],
    title: "Diagnostic Suppression",
  },
  {
    category: "resource-safety",
    defaultEnabled: true,
    defaultSeverity: "advice",
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
    selection: "advise",
    source: "effect-doctor",
    status: "advisory",
    supportedEffectVersions: ["v4"],
    title: "No Manual SQL Transaction",
  },
  {
    category: "correctness",
    defaultEnabled: true,
    defaultSeverity: "advice",
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
    selection: "advise",
    source: "effect-doctor",
    status: "advisory",
    supportedEffectVersions: ["v4"],
    title: "No Run Sync On Suspending Effect",
  },
  {
    category: "resource-safety",
    defaultEnabled: true,
    defaultSeverity: "advice",
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
    selection: "advise",
    source: "effect-doctor",
    status: "advisory",
    supportedEffectVersions: ["v4"],
    title: "Prefer Abort Signal Passthrough",
  },
  {
    category: "security",
    defaultEnabled: true,
    defaultSeverity: "advice",
    description:
      "Prefer Config.redacted for statically named secret configuration values.",
    diagnosticCodes: [],
    diagnosticRuleIds: ["effect-doctor(prefer-config-redacted)"],
    execution: "oxlint",
    fixable: false,
    id: "effect-doctor/prefer-config-redacted",
    nativeRuleId: "prefer-config-redacted",
    providerDefaultSeverity: "warning",
    providerRuleId: "effect-doctor/prefer-config-redacted",
    selection: "advise",
    source: "effect-doctor",
    status: "advisory",
    supportedEffectVersions: ["v3", "v4"],
    title: "Prefer Config Redacted",
  },
  {
    category: "effect-native",
    defaultEnabled: true,
    defaultSeverity: "advice",
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
    selection: "advise",
    source: "effect-doctor",
    status: "advisory",
    supportedEffectVersions: ["v3", "v4"],
    title: "Prefer Structured Log Data",
  },
  {
    category: "correctness",
    defaultEnabled: true,
    defaultSeverity: "advice",
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
    selection: "advise",
    source: "effect-doctor",
    status: "advisory",
    supportedEffectVersions: ["v4"],
    title: "Prefer HTTP JSON Response",
  },
];

const sortEntries = (entries) =>
  entries.sort(
    (left, right) =>
      compareCodeUnits(left.id, right.id) ||
      compareCodeUnits(left.source, right.source)
  );

const assertCount = (label, actual, expected) => {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
};

const assertProviderCounts = (entries) => {
  const expectedCounts = {
    "effect-doctor": 7,
    "effect-oxlint": 40,
    "effect-tsgo": 99,
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
  if (tsgoCodes.length !== 109 || new Set(tsgoCodes).size !== 109) {
    throw new Error("Expected 109 unique TSGo diagnostic codes");
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

const assertCatalog = (entries) => {
  assertProviderCounts(entries);
  assertUniqueCanonicalIds(entries);
  assertCount(
    "enabled rules",
    entries.filter((entry) => entry.defaultEnabled).length,
    50
  );
  const tsgo = entries.filter((entry) => entry.source === "effect-tsgo");
  assertTsgoCodes(tsgo);
  assertDistribution(
    tsgo,
    "category",
    {
      antipattern: 20,
      correctness: 18,
      "effect-native": 22,
      style: 39,
    },
    "TSGo category"
  );
  assertDistribution(
    tsgo,
    "providerDefaultSeverity",
    { error: 13, off: 35, suggestion: 36, warning: 15 },
    "TSGo severity"
  );
  assertCount(
    "fixable TSGo rules",
    tsgo.filter((entry) => entry.fixable).length,
    43
  );
  assertUniqueDiagnosticRuleIds(entries);
};

const render = (entries) =>
  `// Generated by scripts/rule-catalog.mjs. Do not edit by hand.\n` +
  `export const GENERATED_RULE_CATALOG = ${JSON.stringify(entries, null, 2)} as const;\n`;

const parseGenerated = () => {
  const source = readFileSync(outputPath, "utf-8");
  const prefix = "export const GENERATED_RULE_CATALOG = ";
  const start = source.indexOf(prefix);
  const end = source.lastIndexOf(" as const;");
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

const verifyTsgoSchema = (schemaRules, catalogTsgo) => {
  const schemaNames = Object.keys(schemaRules).sort(compareCodeUnits);
  const catalogNames = catalogTsgo
    .map((entry) => entry.providerRuleId)
    .sort(compareCodeUnits);
  assertSameInventory("TSGo schema", schemaNames, catalogNames);
  for (const entry of catalogTsgo) {
    const schemaRule = schemaRules[entry.providerRuleId];
    if (
      schemaRule.default !== entry.providerDefaultSeverity ||
      schemaRule.description !== entry.description
    ) {
      throw new Error(`TSGo metadata drift for ${entry.providerRuleId}`);
    }
  }
};

const verifyOxlintInventory = (entries) => {
  const installedOxlintNames =
    Object.keys(effectOxlintRules).sort(compareCodeUnits);
  const catalogOxlint = entries.filter(
    (entry) => entry.source === "effect-oxlint"
  );
  const catalogOxlintNames = catalogOxlint
    .map((entry) => entry.providerRuleId.slice("effect/".length))
    .sort(compareCodeUnits);
  assertSameInventory(
    "Effect Oxlint",
    installedOxlintNames,
    catalogOxlintNames
  );
};

const verifyInstalledProviders = (entries) => {
  const installed = {
    effect: readJson(resolve(projectRoot, "node_modules/effect/package.json")),
    effectOxlint: readJson(
      resolve(projectRoot, "node_modules/oxlint-plugin-effect/package.json")
    ),
    oxlint: readJson(resolve(projectRoot, "node_modules/oxlint/package.json")),
    oxlintPlugins: readJson(
      resolve(projectRoot, "node_modules/@oxlint/plugins/package.json")
    ),
    tsgo: readJson(
      resolve(projectRoot, "node_modules/@effect/tsgo/package.json")
    ),
    tsgoPlatform: readJson(
      resolve(
        projectRoot,
        `node_modules/@effect/tsgo-${process.platform}-${process.arch}/package.json`
      )
    ),
    typescript: readJson(
      resolve(projectRoot, "node_modules/typescript/package.json")
    ),
  };
  verifyProviderVersions(installed);
  const schema = readJson(
    resolve(projectRoot, "node_modules/@effect/tsgo/schema.json")
  );
  const schemaRules =
    schema.definitions.effectLanguageServicePluginDiagnosticSeverityDefinition
      .properties;
  const catalogTsgo = entries.filter((entry) => entry.source === "effect-tsgo");
  verifyTsgoSchema(schemaRules, catalogTsgo);
  verifyOxlintInventory(entries);
};

const metadata = readMetadata();
if (args.has("--write")) {
  const entries = sortEntries([
    ...makeTsgoEntries(metadata),
    ...makeOxlintEntries(),
    ...makeDoctorEntries(),
  ]);
  assertCatalog(entries);
  verifyInstalledProviders(entries);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, render(entries));
  process.stdout.write(`wrote ${outputPath}\n`);
} else {
  const entries = parseGenerated();
  assertCatalog(entries);
  verifyInstalledProviders(entries);
  const expected = sortEntries([
    ...makeTsgoEntries(metadata),
    ...makeOxlintEntries(),
    ...makeDoctorEntries(),
  ]);
  if (render(entries) !== render(expected)) {
    throw new Error("Generated catalog differs from pinned reference metadata");
  }
  process.stderr.write("rule catalog is current\n");
}
