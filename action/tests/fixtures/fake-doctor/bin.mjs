#!/usr/bin/env node

import { appendFileSync } from "node:fs";

const args = process.argv.slice(2);
const projectIndex = args.indexOf("--project");
const inlineProject = args.find((argument) =>
  argument.startsWith("--project=")
);
let entry;
if (inlineProject === undefined) {
  entry = projectIndex === -1 ? undefined : args[projectIndex + 1];
} else {
  entry = inlineProject.slice("--project=".length);
}
if (entry === undefined) {
  process.stderr.write("Expected a --project argument\n");
  process.exit(2);
}

if (process.env.EFFECT_DOCTOR_TEST_TRACE !== undefined) {
  appendFileSync(
    process.env.EFFECT_DOCTOR_TEST_TRACE,
    `${JSON.stringify(args)}\n`
  );
}

if (process.env.EFFECT_DOCTOR_TEST_FAIL === "1") {
  process.stderr.write("Deliberate analyzer failure\n");
  process.exit(3);
}

const target = { entry, projects: [entry] };
const policy = {
  activeRuleCount: 157,
  digest: "6e0f588e8d06811cce35190d3adc31f2eca4932912144b77822b393cbe09cd23",
  id: "effect-v4/default",
  revision: 3,
};
const applicability = {
  files: [
    {
      directEffectModuleReference: false,
      file: "src/main.ts",
    },
  ],
  normalizedDiagnosticCount: 0,
  notApplicable: { groups: [], total: 0 },
};
const scan = {
  applicability,
  doctorVersion: "0.1.0",
  engines: [
    {
      analyzedFiles: ["src/main.ts"],
      complete: true,
      engine: "effect-doctor",
      version: "0.1.0",
    },
    {
      analyzedFiles: ["src/main.ts"],
      complete: true,
      engine: "effect-tsgo",
      version: "0.40.0",
    },
  ],
  findings: [],
  kind: "scan",
  policy,
  root: ".",
  schema: "effect-doctor/scan/v1",
  summary: { errors: 0, warnings: 0 },
  target,
  toolchain: {
    effect: "4.0.0-rc.113",
    oxlint: "1.80.0",
    tsgo: "0.40.0",
    typescript: "7.0.2",
  },
};
const report =
  args[0] === "compare"
    ? {
        baseline: scan,
        candidate: scan,
        doctorVersion: "0.1.0",
        introduced: [],
        kind: "comparison",
        resolved: [],
        schema: "effect-doctor/comparison/v1",
        unchangedCount: 0,
      }
    : scan;

process.stdout.write(`${JSON.stringify(report)}\n`);
