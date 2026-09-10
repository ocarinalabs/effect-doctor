import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  annotationCommand,
  metricsFor,
  messageCommand,
  outputValues,
  parseReportShape,
  renderSummary,
  statusDescription,
} from "../report.mjs";

const fixture = (name) =>
  readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), "utf-8");

test("a Comparison Report selects introduced and resolved Findings", () => {
  const parsed = parseReportShape(fixture("comparison"));
  assert.equal(
    parsed.findings[0].ruleId,
    "effect-doctor/no-run-sync-on-suspending-effect"
  );
  assert.equal(
    parsed.resolved[0].ruleId,
    "effect-doctor/prefer-structured-log-data"
  );
  assert.equal(parsed.policy.activeRuleCount, 157);
  assert.equal(parsed.applicability.normalizedDiagnosticCount, 1);
});

test("a Scan Report requires a complete, well-formed receipt", () => {
  const mutations = [
    (report) => {
      delete report.engines;
    },
    (report) => {
      report.engines[1].complete = false;
    },
    (report) => {
      report.engines[1].analyzedFiles = ["src/other.ts"];
    },
    (report) => {
      delete report.toolchain;
    },
    (report) => {
      report.summary.errors = 2;
    },
    (report) => {
      report.findings[0].location.end = { column: 0, line: 4 };
    },
    (report) => {
      report.findings[0].severity = "critical";
    },
  ];

  for (const mutate of mutations) {
    const report = JSON.parse(fixture("scan"));
    mutate(report);
    assert.throws(
      () => parseReportShape(JSON.stringify(report)),
      /invalid Scan Report/u
    );
  }
});

test("report paths must be normalized project-relative POSIX paths", () => {
  for (const file of [
    "zz/",
    "..",
    "../main.ts",
    "src/./main.ts",
    "/workspace/main.ts",
    "src\\main.ts",
    "C:/main.ts",
  ]) {
    const report = JSON.parse(fixture("scan"));
    for (const run of report.engines) {
      run.analyzedFiles = [file];
    }
    report.applicability.files = [{ directEffectModuleReference: true, file }];
    report.findings = [];
    report.applicability.normalizedDiagnosticCount = 0;
    report.summary = { advice: 0, errors: 0, warnings: 0 };
    assert.throws(
      () => parseReportShape(JSON.stringify(report)),
      /invalid Scan Report/u
    );
  }
});

test("a Comparison Report validates both scans and its finding lists", () => {
  const mutations = [
    (report) => {
      delete report.baseline.engines;
    },
    (report) => {
      report.introduced = [{ ruleId: "effect/floating-effect" }];
    },
    (report) => {
      report.resolved = [
        ...report.baseline.findings,
        ...report.baseline.findings,
      ];
    },
  ];

  for (const mutate of mutations) {
    const report = JSON.parse(fixture("comparison"));
    mutate(report);
    assert.throws(
      () => parseReportShape(JSON.stringify(report)),
      /invalid (?:Scan|Comparison) Report/u
    );
  }
});

test("a Comparison Report cannot mix scan policies", () => {
  const report = JSON.parse(fixture("comparison"));
  report.candidate.policy.digest = "0".repeat(64);

  assert.throws(
    () => parseReportShape(JSON.stringify(report)),
    /different scan policies/u
  );
});

test("a scan policy must carry a complete identity", () => {
  const mutations = [
    (report) => {
      report.policy.activeRuleCount = 0;
    },
    (report) => {
      report.policy.revision = "1";
    },
    (report) => {
      report.policy.digest = "not-a-digest";
    },
    (report) => {
      delete report.policy.id;
    },
  ];

  for (const mutate of mutations) {
    const report = JSON.parse(fixture("scan"));
    mutate(report);
    assert.throws(
      () => parseReportShape(JSON.stringify(report)),
      /invalid scan policy/u
    );
  }
});

test("an applicability receipt must reconcile with its scan", () => {
  const countMismatch = JSON.parse(fixture("scan"));
  countMismatch.applicability.normalizedDiagnosticCount = 4;

  const groupMismatch = JSON.parse(fixture("scan"));
  groupMismatch.applicability.normalizedDiagnosticCount += 1;
  groupMismatch.applicability.notApplicable = {
    groups: [
      {
        count: 2,
        reason: "missing-direct-effect-module-reference",
        ruleId: "effect-doctor/no-globals",
      },
    ],
    total: 1,
  };

  for (const report of [countMismatch, groupMismatch]) {
    assert.throws(
      () => parseReportShape(JSON.stringify(report)),
      /invalid applicability receipt/u
    );
  }
});

test("a Comparison Report cannot mix project targets", () => {
  const report = JSON.parse(fixture("comparison"));
  report.baseline.target = {
    entry: "configs/other.json",
    projects: ["configs/other.json"],
  };

  assert.throws(
    () => parseReportShape(JSON.stringify(report)),
    /different project targets/u
  );
});

test("a project target must be unique and contain its entry", () => {
  for (const projects of [
    ["tsconfig.json", "tsconfig.json"],
    ["packages/app/tsconfig.json"],
  ]) {
    const report = JSON.parse(fixture("scan"));
    report.target.projects = projects;

    assert.throws(
      () => parseReportShape(JSON.stringify(report)),
      /invalid project target/u
    );
  }
});

test("a Comparison Report validates the baseline project graph", () => {
  const report = JSON.parse(fixture("comparison"));
  report.baseline.target.projects = [];

  assert.throws(
    () => parseReportShape(JSON.stringify(report)),
    /invalid project target/u
  );
});

test("summary exposes Findings without inventing a score", () => {
  const parsed = parseReportShape(fixture("comparison"));
  const metrics = metricsFor(parsed.findings, parsed.resolved);
  const summary = renderSummary({
    blocked: true,
    completed: true,
    directory: ".",
    doctorVersion: "0.1.0",
    engines: parsed.engines,
    findings: parsed.findings,
    applicability: parsed.applicability,
    metrics,
    policy: parsed.policy,
    scope: "changed",
    target: parsed.target,
  });
  assert.match(summary, /1 finding across 1 file/u);
  assert.match(summary, /157 active rules/u);
  assert.match(summary, /effect-v4\/default@3/u);
  assert.match(summary, /effect-doctor@0\.1\.0/u);
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
    target: {
      entry: "configs/effect.json",
      projects: ["configs/effect.json"],
    },
  });
  assert.match(summary, /Incomplete/u);
  assert.match(summary, /effect-tsgo timed out/u);
  assert.match(summary, /configs\/effect\.json/u);
});

test("workflow annotations preserve locations and escape command payloads", () => {
  const sourceFinding = parseReportShape(fixture("scan")).findings.find(
    (finding) => finding.severity === "error"
  );
  assert.notEqual(sourceFinding, undefined);
  const finding = {
    ...sourceFinding,
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
  const metrics = metricsFor(parseReportShape(fixture("scan")).findings);
  const outputs = outputValues({ metrics });
  assert.deepEqual(outputs, {
    "affected-files": 2,
    "error-count": 1,
    "resolved-findings": 0,
    "total-findings": 3,
    "warning-count": 2,
  });
  assert.equal("score" in outputs, false);
});

test("commit status describes selected Findings", () => {
  const metrics = metricsFor(parseReportShape(fixture("scan")).findings);
  assert.equal(
    statusDescription({ completed: true, metrics, scope: "full" }),
    "Found 1 errors, 2 warnings"
  );
  assert.equal(
    statusDescription({ completed: false, metrics, scope: "full" }),
    "Analysis incomplete"
  );
});
