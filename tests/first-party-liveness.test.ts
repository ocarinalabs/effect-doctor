import { fileURLToPath } from "node:url";

import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import type { Finding } from "../src/index.js";
import { scanProject } from "../src/index.js";

const fixture = fileURLToPath(new URL("fixtures/doctor", import.meta.url));
const report = Effect.runPromise(scanProject({ root: fixture }));

const EXPECTED_FIRST_PARTY_RULES = [
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
] as const;

const findingsFor = async (ruleId: string): Promise<readonly Finding[]> => {
  const result = await report;
  return result.findings.filter((finding) => finding.ruleId === ruleId);
};

describe("first-party rule liveness", () => {
  it("keeps runtime-proven synchronous controls outside the rule", () => {
    expect(
      Effect.runSync(
        Effect.callback<number>((resume) => resume(Effect.succeed(1)))
      )
    ).toBe(1);
    expect(Effect.runSync(Effect.sleep(0))).toBeUndefined();
    expect(Effect.runSync(Effect.yieldNow)).toBeUndefined();
  });

  it("keeps every enabled public first-party rule live", async () => {
    const result = await report;
    const liveRules = [
      ...new Set(
        result.findings
          .filter((finding) => finding.provenance.engine === "effect-doctor")
          .map((finding) => finding.ruleId)
      ),
    ].sort();

    expect(liveRules).toEqual(EXPECTED_FIRST_PARTY_RULES);
  });

  it("reports Effect.fn span names that disagree with their assigned names", async () => {
    const findings = await findingsFor(
      "effect-doctor/consistent-effect-fn-name"
    );
    expect(findings.map((finding) => finding.evidence)).toEqual([
      'Fx.fn("fetchUser")',
      'traced("writeUser")',
      'EffectModule.fn("removeUser")',
      'EffectPackage.Effect.fn("reloadUser")',
    ]);
  });

  it("reports repeated Layer factories inside one composition graph", async () => {
    const findings = await findingsFor(
      "effect-doctor/no-duplicate-layer-factory-call"
    );
    expect(findings.map((finding) => finding.evidence)).toEqual([
      "databaseLayer()",
      "cacheLayer()",
      "serviceLayer()",
      "databaseLayer()",
      "databaseLayer()",
    ]);
  });

  it("reports fresh closed schemas compiled inside functions", async () => {
    const findings = await findingsFor(
      "effect-doctor/no-inline-schema-compile"
    );
    expect(findings.map((finding) => finding.evidence)).toEqual([
      "RootSchema.decodeUnknownSync(\n    RootSchema.Struct({ name: RootSchema.String })\n  )",
      "SchemaNamespace.is(SchemaNamespace.Array(SchemaNamespace.Number))",
      "directSchemaDecode(\n    SchemaNamespace.Tuple([SchemaNamespace.String, SchemaNamespace.Number])\n  )",
      "(\n    RootParser as typeof RootParser & {\n      readonly decodeUnknownOption: typeof RootSchema.decodeUnknownOption;\n    }\n  ).decodeUnknownOption(RootSchema.Record(RootSchema.String, RootSchema.Int))",
      'ParserNamespace.encodeUnknownResult(\n    SchemaNamespace.Literals(["open", "closed"])\n  )',
      "directParserDecode(RootSchema.NonEmptyArray(RootSchema.String))",
      "RootSchema.decodeUnknownSync(\n    RootSchema.Struct({ wrapped: RootSchema.Boolean }) satisfies RootSchema.Top\n  )",
      'SchemaNamespace.decodeUnknownSync(\n    SchemaNamespace.Struct({\n      records: SchemaNamespace.Array(\n        SchemaNamespace.Union([\n          SchemaNamespace.Tuple([\n            SchemaNamespace.Literal("entry"),\n            SchemaNamespace.Number,\n          ]),\n          SchemaNamespace.Literal(true),\n        ])\n      ),\n    })\n  )',
      "RootSchema.decodeUnknownSync(\n    RootSchema.Struct({ stable: StableLeaf })\n  )",
      'directSchemaEncode(RootSchema.Literal("ready"))',
    ]);
  });

  it("reports repeated straight-line Effect.callback resumes", async () => {
    const findings = await findingsFor(
      "effect-doctor/no-multiple-callback-resume"
    );
    expect(findings.map((finding) => finding.evidence)).toEqual([
      'resume(Fx.succeed("second"))',
      "complete(Fx.succeed(second))",
      "resume(Fx.void)",
      "finish(Fx.succeed(false))",
      "finish(Fx.succeed(true))",
    ]);
  });

  it("reports direct mutation after an unsafe Chunk wrap", async () => {
    const findings = await findingsFor(
      "effect-doctor/no-mutation-after-unsafe-chunk-wrap"
    );
    expect(findings.map((finding) => finding.evidence)).toEqual([
      "pushed.push(4)",
      "assigned[0] = 4",
      "updated[0]++",
      "sorted.sort((left, right) => left - right)",
    ]);
  });

  it("reports direct Redacted.value exposure in diagnostic sinks", async () => {
    const findings = await findingsFor(
      "effect-doctor/no-unredacted-value-in-diagnostic"
    );
    expect(findings.map((finding) => finding.evidence)).toEqual([
      "Redacted.value(secret)",
      "RedactedModule.value(secret)",
      "revealSecret(secret)",
      "revealSecret(secret)",
      "Redacted.value(secret)",
      "RedactedModule.value(secret)",
      "revealSecret(secret)",
      "revealSecret(secret)",
    ]);
  });

  it("reports only directly proven suspending effects at synchronous runners", async () => {
    const findings = await findingsFor(
      "effect-doctor/no-run-sync-on-suspending-effect"
    );
    expect(findings.map((finding) => finding.evidence)).toEqual([
      "Effect.runSync(\n  Effect.promise(() => Promise.resolve(1))\n)",
      'runSyncExit(sleep("1 millis"))',
      "Effect.runSync(\n  tryPromise(() => Promise.resolve(2))\n)",
      "runSyncExit(Effect.never)",
    ]);
  });

  it("reports throws that escape confirmed Effect generator bodies", async () => {
    const findings = await findingsFor(
      "effect-doctor/no-throw-in-effect-generator"
    );
    expect(findings.map((finding) => finding.evidence)).toEqual([
      'throw new Error("invalid user input");',
      'throw new Error("invalid order input");',
      'throw new Error("invalid package input");',
      'throw new Error("invalid named operation input");',
      'throw new Error("invalid direct operation input");',
      'throw new Error("invalid untraced operation input");',
      'throw new Error("invalid eager operation input");',
    ]);
  });

  it("reports unnecessary JSON serialization at Effect logging boundaries", async () => {
    const findings = await findingsFor(
      "effect-doctor/prefer-structured-log-data"
    );
    expect(findings.map((finding) => finding.evidence)).toEqual([
      "JSON.stringify(payload)",
      "JSON.stringify(payload)",
    ]);
  });

  it("reports JSON strings passed to text response constructors", async () => {
    const findings = await findingsFor(
      "effect-doctor/prefer-http-json-response"
    );
    expect(findings.map((finding) => finding.evidence)).toEqual([
      "JSON.stringify(payload)",
      "JSON.stringify(payload)",
    ]);
  });

  it("reports transaction control sent through an Effect SQL statement", async () => {
    const findings = await findingsFor(
      "effect-doctor/no-manual-sql-transaction"
    );
    expect(findings.map((finding) => finding.evidence)).toEqual([
      "sql`BEGIN`",
      "sql`COMMIT`",
      "database`ROLLBACK`",
    ]);
  });

  it("reports direct network effects held inside an Effect SQL transaction", async () => {
    const findings = await findingsFor(
      "effect-doctor/no-network-in-sql-transaction"
    );
    expect(findings.map((finding) => finding.evidence)).toEqual([
      'fetch("https://example.com/in-transaction", { signal })',
      'fetch("https://example.com/try-in-transaction", { signal })',
      'HttpClient.get("https://example.com/in-transaction")',
      'httpGet("https://example.com/named-in-transaction")',
      'fetch("https://example.com/generator-in-transaction", { signal })',
      'HttpClient.get("https://example.com/gen")',
    ]);
  });

  it("reports provably long-lived work run inline during Layer acquisition", async () => {
    const findings = await findingsFor(
      "effect-doctor/no-long-lived-layer-acquisition"
    );
    expect(findings.map((finding) => finding.evidence)).toEqual([
      "Effect.never",
      "Effect.forever(Effect.succeed(Worker.of({ run: Effect.void })))",
      "Stream.runDrain(Stream.never)",
      "Effect.never",
    ]);
  });

  it("reports direct fetch adapters that discard Effect cancellation", async () => {
    const findings = await findingsFor(
      "effect-doctor/prefer-abort-signal-passthrough"
    );
    expect(findings.map((finding) => finding.evidence)).toEqual([
      'fetch("https://example.com/missing")',
      'fetch("https://example.com/object", { method: "GET" })',
    ]);
  });
});
