import { fileURLToPath } from "node:url";

import { Effect } from "effect";
import type { RECOMMENDED_RULES } from "oxlint-plugin-effect-doctor";
import { describe, expect, it } from "vitest";

import { scanProject } from "../src/index.js";

const fixture = fileURLToPath(new URL("fixtures/doctor", import.meta.url));
const report = Effect.runPromise(scanProject({ root: fixture }));

const EXPECTED_FINDING_COUNTS = {
  "effect-doctor/consistent-effect-fn-name": 4,
  "effect-doctor/no-duplicate-layer-factory-call": 5,
  "effect-doctor/no-inline-schema-compile": 10,
  "effect-doctor/no-long-lived-layer-acquisition": 4,
  "effect-doctor/no-manual-sql-transaction": 3,
  "effect-doctor/no-multiple-callback-resume": 5,
  "effect-doctor/no-mutation-after-unsafe-chunk-wrap": 4,
  "effect-doctor/no-network-in-sql-transaction": 6,
  "effect-doctor/no-run-sync-on-suspending-effect": 4,
  "effect-doctor/no-throw-in-effect-generator": 8,
  "effect-doctor/no-unredacted-value-in-diagnostic": 8,
  "effect-doctor/prefer-abort-signal-passthrough": 2,
  "effect-doctor/prefer-config-redacted": 17,
  "effect-doctor/prefer-http-json-response": 2,
  "effect-doctor/prefer-structured-log-data": 2,
} satisfies Readonly<Record<keyof typeof RECOMMENDED_RULES, number>>;

describe("first-party rule behavior", () => {
  it("exercises every recommended rule against positive and negative cases", async () => {
    const result = await report;
    const counts = new Map<string, number>();
    for (const finding of result.findings) {
      if (finding.provenance.engine === "effect-doctor") {
        counts.set(finding.ruleId, (counts.get(finding.ruleId) ?? 0) + 1);
      }
    }

    for (const [ruleId, expectedCount] of Object.entries(
      EXPECTED_FINDING_COUNTS
    )) {
      expect(counts.get(ruleId) ?? 0).toBe(expectedCount);
    }
  }, 30_000);

  it("does not treat deliberate test failures as production throws", async () => {
    const result = await report;

    expect(
      result.findings.some(
        (finding) =>
          finding.ruleId === "effect-doctor/no-throw-in-effect-generator" &&
          finding.location.file.endsWith(".test.ts")
      )
    ).toBe(false);
  }, 30_000);
});
