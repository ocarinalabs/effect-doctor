import { fileURLToPath } from "node:url";

import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import type { Finding } from "../src/index.js";
import { scanProject } from "../src/index.js";

const fixture = fileURLToPath(new URL("fixtures/doctor", import.meta.url));
const report = Effect.runPromise(scanProject({ root: fixture }));

const EXPECTED_FIRST_PARTY_RULES = [
  "effect-doctor/diagnostic-suppression",
  "effect-doctor/no-manual-sql-transaction",
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
