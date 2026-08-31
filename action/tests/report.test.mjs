import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  annotationCommand,
  blocks,
  metricsFor,
  messageCommand,
  outputValues,
  parseDoctorReport,
  renderSummary,
  statusDescription,
} from "../report.mjs";

const fixture = (name) =>
  readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), "utf-8");

test("a Comparison Report selects introduced and resolved Findings", () => {
  const parsed = parseDoctorReport(fixture("comparison"));
  assert.equal(parsed.findings[0].fingerprint, "introduced");
  assert.equal(parsed.resolved[0].fingerprint, "resolved");
});

test("blocking policy ignores advice and respects its threshold", () => {
  const advice = metricsFor([
    parseDoctorReport(fixture("scan")).findings.find(
      (finding) => finding.severity === "advice"
    ),
  ]);
  assert.equal(blocks(advice, "error"), false);
  assert.equal(blocks(advice, "warning"), false);

  const all = metricsFor(parseDoctorReport(fixture("scan")).findings);
  assert.equal(blocks(all, "none"), false);
  assert.equal(blocks(all, "warning"), true);
  assert.equal(blocks(all, "error"), true);
});

test("summary exposes Findings without inventing a score", () => {
  const parsed = parseDoctorReport(fixture("comparison"));
  const metrics = metricsFor(parsed.findings, parsed.resolved);
  const summary = renderSummary({
    blocked: true,
    completed: true,
    directory: ".",
    doctorVersion: "0.1.0",
    findings: parsed.findings,
    metrics,
    scope: "changed",
  });
  assert.match(summary, /1 finding across 1 file/u);
  assert.match(summary, /effect-doctor\/no-run-sync-on-suspending-effect/u);
  assert.doesNotMatch(summary, /score/iu);
});

test("an incomplete summary preserves the Analyzer Run failure", () => {
  const summary = renderSummary({
    blocked: true,
    completed: false,
    directory: ".",
    doctorVersion: undefined,
    errorMessage: "effect-tsgo timed out",
    findings: [],
    metrics: metricsFor([]),
    scope: "full",
  });
  assert.match(summary, /Incomplete/u);
  assert.match(summary, /effect-tsgo timed out/u);
});

test("workflow annotations preserve locations and escape command payloads", () => {
  const finding = {
    ...parseDoctorReport(fixture("scan")).findings[0],
    message: "unsafe: value, 100%\nnext line",
  };
  const command = annotationCommand(finding, "packages/app", "/workspace");
  assert.match(
    command,
    /^::error file=packages\/app\/src\/program\.ts,line=7,col=3/u
  );
  assert.match(command, /unsafe: value, 100%25%0Anext line/u);
});

test("plain workflow messages cannot inject a second command", () => {
  assert.equal(
    messageCommand("error", "failed%\n::warning::injected"),
    "::error::failed%25%0A::warning::injected"
  );
});

test("Action outputs expose Finding counts without a score", () => {
  const metrics = metricsFor(parseDoctorReport(fixture("scan")).findings);
  const outputs = outputValues({ metrics });
  assert.deepEqual(outputs, {
    "advice-count": 1,
    "affected-files": 2,
    "error-count": 1,
    "resolved-findings": 0,
    "total-findings": 3,
    "warning-count": 1,
  });
  assert.equal("score" in outputs, false);
});

test("commit status describes selected Findings", () => {
  const metrics = metricsFor(parseDoctorReport(fixture("scan")).findings);
  assert.equal(
    statusDescription({ completed: true, metrics, scope: "full" }),
    "Found 1 errors, 1 warnings, 1 advice"
  );
  assert.equal(
    statusDescription({ completed: false, metrics, scope: "full" }),
    "Analysis incomplete"
  );
});
