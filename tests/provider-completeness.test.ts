import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { normalizeOxlintFindings } from "../src/internal/oxlint.js";
import type { ProjectSnapshot } from "../src/internal/project-snapshot.js";
import { validateProviderReceipts } from "../src/internal/provider-receipt.js";
import { DOCTOR_VERSION } from "../src/version.js";

const snapshot = {
  configuration: {
    inputDigest: "input-digest",
    planDigest: "plan-digest",
  },
  files: [
    {
      absolute: "/project/src/main.ts",
      digest: "digest",
      relative: "src/main.ts",
      source: "Effect.void",
    },
  ],
  root: "/project",
  tsconfig: "/project/tsconfig.json",
} satisfies ProjectSnapshot;

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
      "/project",
      {
        diagnostics: [
          {
            code: "effect(futureUnknownRule)",
            filename: "/project/src/main.ts",
            labels: [
              {
                span: { column: 1, length: 6, line: 1, offset: 0 },
              },
            ],
            message: "Unknown future diagnostic.",
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
      "/project",
      {
        diagnostics: [
          {
            code: "effect-doctor(future-unknown-rule)",
            filename: "/project/src/main.ts",
            labels: [
              {
                span: { column: 1, length: 6, line: 1, offset: 0 },
              },
            ],
            message: "Unknown future first-party diagnostic.",
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
});
