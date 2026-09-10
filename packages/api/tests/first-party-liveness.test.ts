import { fileURLToPath } from "node:url";

import { Effect } from "effect";
import type { AuthoredRuleId } from "oxlint-plugin-effect-doctor";
import { describe, expect, it } from "vitest";

import { scanProject } from "../src/index.js";

const fixture = fileURLToPath(new URL("fixtures/doctor", import.meta.url));
const report = Effect.runPromise(scanProject({ root: fixture }));

const EXPECTED_FINDINGS = {
  "effect-doctor/consistent-effect-fn-name": [
    "src/effect-fn-name.ts:6",
    "src/effect-fn-name.ts:10",
    "src/effect-fn-name.ts:15",
    "src/effect-fn-name.ts:18",
  ],
  "effect-doctor/no-duplicate-layer-factory-call": [
    "src/duplicate-layer-factory.ts:14",
    "src/duplicate-layer-factory.ts:19",
    "src/duplicate-layer-factory.ts:24",
    "src/duplicate-layer-factory.ts:29",
    "src/duplicate-layer-factory.ts:33",
  ],
  "effect-doctor/no-inline-schema-compile": [
    "src/inline-schema-compile.ts:23",
    "src/inline-schema-compile.ts:28",
    "src/inline-schema-compile.ts:31",
    "src/inline-schema-compile.ts:36",
    "src/inline-schema-compile.ts:45",
    "src/inline-schema-compile.ts:50",
    "src/inline-schema-compile.ts:53",
    "src/inline-schema-compile.ts:58",
    "src/inline-schema-compile.ts:73",
    "src/inline-schema-compile.ts:78",
    "src/inline-schema-compile.ts:185",
    "src/inline-schema-compile.ts:190",
    "src/inline-schema-compile.ts:195",
    "src/inline-schema-compile.ts:202",
    "src/inline-schema-compile.ts:261",
  ],
  "effect-doctor/no-long-lived-layer-acquisition": [
    "src/layer-lifetimes.ts:8",
    "src/layer-lifetimes.ts:12",
    "src/layer-lifetimes.ts:16",
    "src/layer-lifetimes.ts:21",
  ],
  "effect-doctor/no-manual-sql-transaction": [
    "src/sql-transactions.ts:13",
    "src/sql-transactions.ts:14",
    "src/sql-transactions.ts:19",
  ],
  "effect-doctor/no-multiple-callback-resume": [
    "src/callback-resume.ts:8",
    "src/callback-resume.ts:15",
    "src/callback-resume.ts:22",
    "src/callback-resume.ts:28",
    "src/callback-resume.ts:29",
  ],
  "effect-doctor/no-mutation-after-unsafe-chunk-wrap": [
    "src/unsafe-chunk-mutation.ts:11",
    "src/unsafe-chunk-mutation.ts:15",
    "src/unsafe-chunk-mutation.ts:19",
    "src/unsafe-chunk-mutation.ts:23",
    "src/unsafe-chunk-mutation.ts:27",
    "src/unsafe-chunk-mutation.ts:51",
    "src/unsafe-chunk-mutation.ts:55",
  ],
  "effect-doctor/no-network-in-sql-transaction": [
    "src/sql-transactions.ts:31",
    "src/sql-transactions.ts:41",
    "src/sql-transactions.ts:50",
    "src/sql-transactions.ts:57",
    "src/sql-transactions.ts:66",
    "src/sql-transactions.ts:76",
    "src/sql-transactions.ts:85",
    "src/sql-transactions.ts:94",
    "src/sql-transactions.ts:104",
  ],
  "effect-doctor/no-run-sync-on-suspending-effect": [
    "src/run-sync.ts:4",
    "src/run-sync.ts:8",
    "src/run-sync.ts:9",
    "src/run-sync.ts:12",
  ],
  "effect-doctor/no-throw-in-effect-generator": [
    "src/throw-in-effect-generator.ts:13",
    "src/throw-in-effect-generator.ts:17",
    "src/throw-in-effect-generator.ts:21",
    "src/throw-in-effect-generator.ts:25",
    "src/throw-in-effect-generator.ts:29",
    "src/throw-in-effect-generator.ts:34",
    "src/throw-in-effect-generator.ts:39",
    "src/throw-in-effect-generator.ts:43",
  ],
  "effect-doctor/no-unredacted-value-in-diagnostic": [
    "src/redacted-diagnostics.ts:15",
    "src/redacted-diagnostics.ts:19",
    "src/redacted-diagnostics.ts:23",
    "src/redacted-diagnostics.ts:27",
    "src/redacted-diagnostics.ts:31",
    "src/redacted-diagnostics.ts:35",
    "src/redacted-diagnostics.ts:41",
    "src/redacted-diagnostics.ts:45",
    "src/redacted-diagnostics.ts:50",
  ],
  "effect-doctor/prefer-abort-signal-passthrough": [
    "src/abort-signal.ts:5",
    "src/abort-signal.ts:9",
  ],
  "effect-doctor/prefer-config-redacted": [
    "src/main.ts:9",
    "src/main.ts:10",
    "src/main.ts:11",
    "src/main.ts:12",
    "src/main.ts:13",
    "src/main.ts:14",
    "src/main.ts:15",
    "src/main.ts:16",
    "src/main.ts:17",
    "src/main.ts:20",
    "src/main.ts:23",
    "src/main.ts:24",
    "src/main.ts:25",
    "src/main.ts:29",
    "src/main.ts:33",
    "src/main.ts:37",
    "src/main.ts:41",
    "src/main.ts:83",
  ],
  "effect-doctor/prefer-http-json-response": [
    "src/http-json-response.ts:7",
    "src/http-json-response.ts:9",
  ],
  "effect-doctor/prefer-structured-log-data": [
    "src/structured-logging.ts:6",
    "src/structured-logging.ts:7",
  ],
} satisfies Readonly<
  Record<`effect-doctor/${AuthoredRuleId}`, readonly string[]>
>;

const locationKey = (file: string, line: number): string => `${file}:${line}`;

const compareLocations = (left: string, right: string): number => {
  const [leftFile = "", leftLine = "0"] = left.split(":");
  const [rightFile = "", rightLine = "0"] = right.split(":");
  if (leftFile !== rightFile) {
    return leftFile < rightFile ? -1 : 1;
  }
  return Number(leftLine) - Number(rightLine);
};

describe("first-party rule behavior", () => {
  it("reports every recommended rule at exactly its fixture locations", async () => {
    const result = await report;
    const actual = new Map<string, string[]>();
    for (const finding of result.findings) {
      if (finding.provenance.engine !== "effect-doctor") {
        continue;
      }
      const locations = actual.get(finding.ruleId) ?? [];
      locations.push(
        locationKey(finding.location.file, finding.location.start.line)
      );
      actual.set(finding.ruleId, locations);
    }

    for (const [ruleId, expected] of Object.entries(EXPECTED_FINDINGS)) {
      expect(
        (actual.get(ruleId) ?? []).toSorted(compareLocations),
        ruleId
      ).toEqual([...expected].toSorted(compareLocations));
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
