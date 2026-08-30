import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { runProcess } from "../src/internal/process.js";

const runNode = (source: string, maxOutputBytes?: number) =>
  Effect.runPromise(
    runProcess({
      arguments: ["--eval", source],
      cwd: process.cwd(),
      engine: "effect-doctor",
      executable: process.execPath,
      maxOutputBytes,
    }).pipe(Effect.provide(NodeServices.layer))
  );

describe.sequential("runProcess", () => {
  it("does not inherit unrelated parent credentials", async () => {
    const key = "EFFECT_DOCTOR_PROCESS_SECRET";
    const previous = process.env[key];
    process.env[key] = "sensitive";

    try {
      const result = await runNode(
        `process.stdout.write(process.env.${key} ?? "missing")`
      );

      expect(result.stdout).toBe("missing");
    } finally {
      if (previous === undefined) {
        delete process.env.EFFECT_DOCTOR_PROCESS_SECRET;
      } else {
        process.env[key] = previous;
      }
    }
  });

  it("fails closed when analyzer output crosses its byte limit", async () => {
    await expect(
      runNode('process.stdout.write("x".repeat(64))', 32)
    ).rejects.toMatchObject({
      _tag: "AnalyzerFailure",
      engine: "effect-doctor",
    });
  });
});
