import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  effectiveScope,
  parseChangedLines,
  rebaseChangedLines,
  safePullRequestScope,
  selectFindings,
} from "../diff.mjs";
import { parseDoctorReport } from "../report.mjs";

const scan = parseDoctorReport(
  readFileSync(new URL("fixtures/scan.json", import.meta.url), "utf-8")
);

test("unified patches yield candidate-side changed lines", () => {
  const patch = [
    "diff --git src/program.ts src/program.ts",
    "--- src/program.ts",
    "+++ src/program.ts",
    "@@ -5,2 +5,3 @@",
    " unchanged",
    "-old",
    "+new",
    "+another",
    "@@ -11 +12 @@",
    "-before",
    "+after",
  ].join("\n");
  const changed = parseChangedLines(patch);
  assert.deepEqual([...changed.get("src/program.ts")], [6, 7, 12]);
});

test("directory rebasing excludes files outside the project", () => {
  const changed = new Map([
    ["packages/app/src/program.ts", new Set([7])],
    ["packages/other/src/index.ts", new Set([1])],
  ]);
  const rebased = rebaseChangedLines(changed, "packages/app");
  assert.deepEqual([...rebased.keys()], ["src/program.ts"]);
});

test("files scope selects every Finding in changed files", () => {
  const findings = selectFindings({
    changedFiles: new Set(["src/program.ts"]),
    changedLines: new Map(),
    findings: scan.findings,
    scope: "files",
  });
  assert.deepEqual(
    findings.map((finding) => finding.location.file),
    ["src/program.ts", "src/program.ts"]
  );
});

test("lines scope selects Findings that begin on changed lines", () => {
  const findings = selectFindings({
    changedFiles: new Set(["src/program.ts"]),
    changedLines: new Map([["src/program.ts", new Set([7])]]),
    findings: scan.findings,
    scope: "lines",
  });
  assert.deepEqual(
    findings.map((finding) => finding.fingerprint),
    ["first"]
  );
});

test("pull requests honor scope while other events analyze the full project", () => {
  assert.equal(effectiveScope("changed", "pull_request"), "changed");
  assert.equal(effectiveScope("lines", "pull_request"), "lines");
  assert.equal(effectiveScope("changed", "push"), "full");
  assert.equal(effectiveScope("files", "workflow_dispatch"), "full");
});

test("dependency and workspace changes avoid a hybrid comparison", () => {
  assert.equal(
    safePullRequestScope("changed", new Set(["packages/app/package.json"])),
    "full"
  );
  assert.equal(
    safePullRequestScope("changed", new Set(["pnpm-workspace.yaml"])),
    "full"
  );
  assert.equal(
    safePullRequestScope("changed", new Set(["package-lock.json"])),
    "full"
  );
  assert.equal(
    safePullRequestScope("changed", new Set(["src/main.ts"])),
    "changed"
  );
  assert.equal(
    safePullRequestScope("lines", new Set(["package.json"])),
    "lines"
  );
  assert.equal(
    safePullRequestScope(
      "changed",
      new Set(["packages/shared/src/service.ts"]),
      "packages/app"
    ),
    "full"
  );
  assert.equal(
    safePullRequestScope(
      "changed",
      new Set(["packages/app/src/service.ts"]),
      "packages/app"
    ),
    "changed"
  );
});
