import { fileURLToPath } from "node:url";

import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import type { Finding } from "../src/index.js";
import { scanProject } from "../src/index.js";

const fixture = fileURLToPath(new URL("fixtures/doctor", import.meta.url));
const report = Effect.runPromise(scanProject({ root: fixture }));

const findingsFor = async (ruleId: string): Promise<readonly Finding[]> => {
  const result = await report;
  return result.findings.filter((finding) => finding.ruleId === ruleId);
};

describe("first-party rule liveness", () => {
  it("reports only directly proven suspending effects at synchronous runners", async () => {
    const findings = await findingsFor(
      "effect-doctor/no-run-sync-on-suspending-effect"
    );
    expect(findings.map((finding) => finding.evidence)).toEqual([
      "Effect.runSync(\n  Effect.promise(() => Promise.resolve(1))\n)",
      'runSyncExit(sleep("1 millis"))',
    ]);
  });
});
