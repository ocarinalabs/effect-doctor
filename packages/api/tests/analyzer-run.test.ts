import { Buffer } from "node:buffer";
import { join, resolve } from "node:path";

import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { normalizeOxlintFindings } from "../src/internal/analyzers/oxlint.js";
import type { ProjectSnapshot } from "../src/internal/project/snapshot.js";
import { validateAnalyzerRuns } from "../src/internal/report/analyzer-run.js";
import { DOCTOR_VERSION } from "../src/version.js";

const projectRoot = resolve("/project");
const sourceFile = join(projectRoot, "src", "main.ts");

const snapshot = {
  configuration: {
    inputDigest: "input-digest",
    planDigest: "plan-digest",
  },
  files: [
    {
      absolute: sourceFile,
      digest: "digest",
      bomLength: 0,
      relative: "src/main.ts",
      source: "Effect.void",
    },
  ],
  root: projectRoot,
  target: {
    entry: "tsconfig.json",
    projects: ["tsconfig.json"],
  },
  tsconfig: join(projectRoot, "tsconfig.json"),
} satisfies ProjectSnapshot;

describe("Analyzer Run completeness", () => {
  it("rejects a first-party Analyzer Run with missing file canaries", async () => {
    await expect(
      Effect.runPromise(
        validateAnalyzerRuns(snapshot, [
          {
            analyzedFiles: [],
            complete: false,
            engine: "effect-doctor",
            version: DOCTOR_VERSION,
          },
          {
            analyzedFiles: ["src/main.ts"],
            complete: true,
            engine: "effect-tsgo",
            version: "0.45.0",
          },
        ])
      )
    ).rejects.toMatchObject({
      _tag: "InvalidAnalyzerOutput",
      engine: "effect-doctor",
    });
  });

  it("rejects Oxlint diagnostics absent from the pinned catalog", async () => {
    const effect = normalizeOxlintFindings(
      projectRoot,
      {
        diagnostics: [
          {
            code: "effect(futureUnknownRule)",
            filename: sourceFile,
            labels: [
              {
                span: { column: 1, length: 6, line: 1, offset: 0 },
              },
            ],
            message: "Unknown future diagnostic.",
            pass: "primary",
            severity: "warning",
          },
        ],
      },
      snapshot.files
    ).pipe(Effect.provide(NodeServices.layer));

    await expect(Effect.runPromise(effect)).rejects.toMatchObject({
      _tag: "InvalidAnalyzerOutput",
      engine: "effect-doctor",
    });
  });

  it("preserves first-party provenance for unknown plugin diagnostics", async () => {
    const effect = normalizeOxlintFindings(
      projectRoot,
      {
        diagnostics: [
          {
            code: "effect-doctor(future-unknown-rule)",
            filename: sourceFile,
            labels: [
              {
                span: { column: 1, length: 6, line: 1, offset: 0 },
              },
            ],
            message: "Unknown future first-party diagnostic.",
            pass: "primary",
            severity: "warning",
          },
        ],
      },
      snapshot.files
    ).pipe(Effect.provide(NodeServices.layer));

    await expect(Effect.runPromise(effect)).rejects.toMatchObject({
      _tag: "InvalidAnalyzerOutput",
      engine: "effect-doctor",
    });
  });

  it("rejects an Oxlint span outside the snapshotted source", async () => {
    const effect = normalizeOxlintFindings(
      projectRoot,
      {
        diagnostics: [
          {
            code: "effect-doctor(prefer-catch-tag)",
            filename: sourceFile,
            labels: [
              {
                span: { column: 1, length: 1, line: 1, offset: 99 },
              },
            ],
            message: "Bound retry attempts or elapsed time.",
            pass: "primary",
            severity: "warning",
          },
        ],
      },
      snapshot.files
    ).pipe(Effect.provide(NodeServices.layer));

    await expect(Effect.runPromise(effect)).rejects.toMatchObject({
      _tag: "InvalidAnalyzerOutput",
      engine: "effect-doctor",
    });
  });

  it("names the first file an Analyzer Run failed to cover", async () => {
    await expect(
      Effect.runPromise(
        validateAnalyzerRuns(snapshot, [
          {
            analyzedFiles: ["src/main.ts"],
            complete: true,
            engine: "effect-doctor",
            version: DOCTOR_VERSION,
          },
          {
            analyzedFiles: [],
            complete: true,
            engine: "effect-tsgo",
            version: "0.45.0",
          },
        ])
      )
    ).rejects.toMatchObject({
      _tag: "InvalidAnalyzerOutput",
      engine: "effect-tsgo",
      message: expect.stringContaining("missing src/main.ts"),
    });
  });

  it("converts Oxlint byte columns after Unicode text to UTF-16 columns", async () => {
    const prefix = "/* 😀 */ ";
    const source = `${prefix}Effect.void`;
    const unicodeSnapshot = {
      ...snapshot,
      files: [
        {
          absolute: sourceFile,
          digest: "digest",
          bomLength: 0,
          relative: "src/main.ts",
          source,
        },
      ],
    };
    const effect = normalizeOxlintFindings(
      projectRoot,
      {
        diagnostics: [
          {
            code: "effect-doctor(prefer-catch-tag)",
            filename: sourceFile,
            labels: [
              {
                span: {
                  column: Buffer.byteLength(prefix) + 1,
                  length: Buffer.byteLength("Effect"),
                  line: 1,
                  offset: Buffer.byteLength(prefix),
                },
              },
            ],
            message: "Bound retry attempts or elapsed time.",
            pass: "primary",
            severity: "warning",
          },
        ],
      },
      unicodeSnapshot.files
    ).pipe(Effect.provide(NodeServices.layer));

    expect(Buffer.byteLength(prefix)).not.toBe(prefix.length);
    await expect(Effect.runPromise(effect)).resolves.toMatchObject([
      {
        evidence: "Effect",
        location: {
          end: { column: prefix.length + 7, line: 1 },
          start: { column: prefix.length + 1, line: 1 },
        },
      },
    ]);
  });

  it("normalizes every cataloged Oxlint rule as active", async () => {
    const effect = normalizeOxlintFindings(
      projectRoot,
      {
        diagnostics: [
          {
            code: "effect-doctor(prefer-catch-tag)",
            filename: sourceFile,
            labels: [
              {
                span: { column: 1, length: 6, line: 1, offset: 0 },
              },
            ],
            message: "Use Effect.catchTag for tagged failures.",
            pass: "primary",
            severity: "warning",
          },
        ],
      },
      snapshot.files
    ).pipe(Effect.provide(NodeServices.layer));

    await expect(Effect.runPromise(effect)).resolves.toMatchObject([
      {
        ruleId: "effect-doctor/prefer-catch-tag",
        severity: "warning",
      },
    ]);
  });

  it("rejects an Oxlint severity that differs from policy", async () => {
    const effect = normalizeOxlintFindings(
      projectRoot,
      {
        diagnostics: [
          {
            code: "effect-doctor(prefer-catch-tag)",
            filename: sourceFile,
            labels: [
              {
                span: { column: 1, length: 6, line: 1, offset: 0 },
              },
            ],
            message: "Bound retry attempts or elapsed time.",
            pass: "primary",
            severity: "error",
          },
        ],
      },
      snapshot.files
    ).pipe(Effect.provide(NodeServices.layer));

    await expect(Effect.runPromise(effect)).rejects.toMatchObject({
      _tag: "InvalidAnalyzerOutput",
      engine: "effect-doctor",
    });
  });
});
