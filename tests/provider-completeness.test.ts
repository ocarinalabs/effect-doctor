import { Buffer } from "node:buffer";
import { join, resolve } from "node:path";

import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { normalizeOxlintFindings } from "../src/internal/oxlint.js";
import type { ProjectSnapshot } from "../src/internal/project-snapshot.js";
import { validateProviderReceipts } from "../src/internal/provider-receipt.js";
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
  tsconfig: join(projectRoot, "tsconfig.json"),
} satisfies ProjectSnapshot;

const v4Files = [
  {
    detectedEffect: "v4",
    file: sourceFile,
    supportedEffect: "v4",
  },
] as const;

describe("provider completeness", () => {
  it("rejects a first-party plugin receipt with missing file canaries", async () => {
    await expect(
      Effect.runPromise(
        validateProviderReceipts(snapshot, [
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
      snapshot.files,
      v4Files
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
      snapshot.files,
      v4Files
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
      snapshot.files,
      v4Files
    ).pipe(Effect.provide(NodeServices.layer));

    await expect(Effect.runPromise(effect)).rejects.toMatchObject({
      _tag: "InvalidAnalyzerOutput",
      engine: "effect-oxlint",
    });
  });

  it("does not report a v4-only Oxlint rule for a v3 file", async () => {
    const effect = normalizeOxlintFindings(
      projectRoot,
      {
        diagnostics: [
          {
            code: "effect-doctor(consistent-effect-fn-name)",
            filename: sourceFile,
            labels: [
              {
                span: { column: 1, length: 6, line: 1, offset: 0 },
              },
            ],
            message: "Keep the Effect.fn name consistent.",
            pass: "primary",
            severity: "warning",
          },
        ],
      },
      snapshot.files,
      [
        {
          detectedEffect: "v3",
          file: sourceFile,
          supportedEffect: "v3",
        },
      ]
    ).pipe(Effect.provide(NodeServices.layer));

    await expect(Effect.runPromise(effect)).resolves.toEqual([]);
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
      unicodeSnapshot.files,
      v4Files
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

  it("rejects a disabled Oxlint diagnostic", async () => {
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
      snapshot.files,
      v4Files
    ).pipe(Effect.provide(NodeServices.layer));

    await expect(Effect.runPromise(effect)).rejects.toMatchObject({
      _tag: "InvalidAnalyzerOutput",
      engine: "effect-oxlint",
    });
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
      snapshot.files,
      v4Files
    ).pipe(Effect.provide(NodeServices.layer));

    await expect(Effect.runPromise(effect)).rejects.toMatchObject({
      _tag: "InvalidAnalyzerOutput",
      engine: "effect-oxlint",
    });
  });
});
