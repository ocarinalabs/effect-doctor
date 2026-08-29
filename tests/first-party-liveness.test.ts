import { fileURLToPath } from "node:url";

import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import type { Finding } from "../src/index.js";
import { scanProject } from "../src/index.js";

const fixture = fileURLToPath(new URL("fixtures/doctor", import.meta.url));
const report = Effect.runPromise(scanProject({ root: fixture }));

const EXPECTED_FIRST_PARTY_RULES = [
  "effect-doctor/diagnostic-suppression",
  "effect-doctor/no-long-lived-layer-acquisition",
  "effect-doctor/no-manual-sql-transaction",
  "effect-doctor/no-network-in-sql-transaction",
  "effect-doctor/no-run-sync-on-suspending-effect",
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
