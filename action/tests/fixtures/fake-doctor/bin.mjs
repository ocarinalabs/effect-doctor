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
const scan = {
  doctorVersion: "0.1.0",
  findings: [],
  kind: "scan",
  schema: "effect-doctor/scan/v1",
  target,
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
      }
    : scan;

process.stdout.write(`${JSON.stringify(report)}\n`);
