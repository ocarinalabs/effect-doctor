import { Buffer } from "node:buffer";
import { join, resolve } from "node:path";

import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { validateAnalyzerRuns } from "../src/internal/analyzer-run.js";
import { normalizeOxlintFindings } from "../src/internal/oxlint.js";
import type { ProjectSnapshot } from "../src/internal/project-snapshot.js";
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
            engine: "effect-oxlint",
            version: "0.11.0",
          },
          {
            analyzedFiles: ["src/main.ts"],
            complete: true,
            engine: "effect-tsgo",
            version: "0.38.0",
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
      engine: "effect-oxlint",
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
            code: "effect(noUnboundedRetry)",
            filename: sourceFile,
            labels: [
              {
                span: { column: 1, length: 1, line: 1, offset: 99 },
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
      engine: "effect-oxlint",
    });
  });

  it("accepts Oxlint byte columns after Unicode text", async () => {
    const prefix = "/* 😀 */ ";
    const source = `${prefix}Effect.void`;
    const unicodeSnapshot = {
      ...snapshot,
      files: [
        {
          absolute: sourceFile,
          digest: "digest",
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
            code: "effect(noUnboundedRetry)",
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
            severity: "error",
          },
        ],
      },
      unicodeSnapshot.files
    ).pipe(Effect.provide(NodeServices.layer));

    await expect(Effect.runPromise(effect)).resolves.toMatchObject([
      {
        evidence: "Effect",
        location: {
          end: { column: Buffer.byteLength(prefix) + 7, line: 1 },
          start: { column: Buffer.byteLength(prefix) + 1, line: 1 },
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
            code: "effect(noAsyncFunction)",
            filename: sourceFile,
            labels: [
              {
                span: { column: 1, length: 6, line: 1, offset: 0 },
              },
            ],
            message: "Avoid async functions.",
            pass: "primary",
            severity: "warning",
          },
        ],
      },
      snapshot.files
    ).pipe(Effect.provide(NodeServices.layer));

    await expect(Effect.runPromise(effect)).resolves.toMatchObject([
      {
        ruleId: "effect/no-async-function",
        severity: "advice",
      },
    ]);
  });

  it("rejects an Oxlint severity that differs from policy", async () => {
    const effect = normalizeOxlintFindings(
      projectRoot,
      {
        diagnostics: [
          {
            code: "effect(noUnboundedRetry)",
            filename: sourceFile,
            labels: [
              {
                span: { column: 1, length: 6, line: 1, offset: 0 },
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
      engine: "effect-oxlint",
    });
  });
});
