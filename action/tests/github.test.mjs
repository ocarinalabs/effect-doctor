import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { inlineReviewComments } from "../github.mjs";
import { metricsFor, parseDoctorReport } from "../report.mjs";

const parsed = parseDoctorReport(
  readFileSync(new URL("fixtures/scan.json", import.meta.url), "utf-8")
);

test("inline reviews include only Findings on changed lines", () => {
  const result = {
    changedLines: {
      "src/log.ts": [4],
      "src/program.ts": [12],
    },
    directory: "packages/app",
    findings: parsed.findings,
    metrics: metricsFor(parsed.findings),
    repositoryPrefix: "packages/app",
  };
  const comments = inlineReviewComments(result);
  assert.deepEqual(
    comments.map((comment) => [comment.path, comment.line]),
    [
      ["packages/app/src/log.ts", 4],
      ["packages/app/src/program.ts", 12],
    ]
  );
});

test("inline reviews cap the number of API comments", () => {
  const [finding] = parsed.findings;
  const findings = Array.from({ length: 40 }, (_, index) => ({
    ...finding,
    location: {
      ...finding.location,
      start: { ...finding.location.start, line: index + 1 },
    },
  }));
  const result = {
    changedLines: {
      "src/program.ts": Array.from({ length: 40 }, (_, index) => index + 1),
    },
    directory: ".",
    findings,
    repositoryPrefix: ".",
  };
  assert.equal(inlineReviewComments(result).length, 25);
});
