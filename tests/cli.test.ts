import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const cli = fileURLToPath(new URL("../src/bin.ts", import.meta.url));
const fixture = (name: "clean" | "invalid"): string =>
  fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));

const runCli = (root: string) =>
  spawnSync("bun", [cli, root, "--format", "json"], {
    encoding: "utf-8",
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
  });

describe("Effect Doctor CLI", () => {
  it("returns zero and a complete report for a clean project", () => {
    const result = runCli(fixture("clean"));

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(
      expect.objectContaining({
        engines: expect.arrayContaining([
          expect.objectContaining({ complete: true, engine: "effect-tsgo" }),
          expect.objectContaining({ complete: true, engine: "effect-oxlint" }),
          expect.objectContaining({ complete: true, engine: "effect-doctor" }),
        ]),
        schema: "effect-doctor/scan/v1",
        summary: { advice: 0, errors: 0, warnings: 0 },
      })
    );
  }, 30_000);

  it("returns one when a finding crosses the blocking threshold", () => {
    const result = runCli(fixture("invalid"));

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual(
      expect.objectContaining({
        schema: "effect-doctor/scan/v1",
        summary: expect.objectContaining({ errors: 1 }),
      })
    );
  }, 30_000);

  it("returns two and a versioned error when analysis cannot start", () => {
    const result = runCli("/effect-doctor/does-not-exist");

    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toEqual(
      expect.objectContaining({
        schema: "effect-doctor/error/v1",
        status: "failed",
      })
    );
  }, 30_000);
});
