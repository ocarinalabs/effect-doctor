import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const cli = fileURLToPath(new URL("../src/bin.ts", import.meta.url));
const fixture = (name: "clean" | "invalid" | "invalid-config"): string =>
  fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));

const runCli = (root: string) =>
  spawnSync("bun", [cli, root, "--format", "json"], {
    encoding: "utf-8",
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
    timeout: 8000,
  });

const runCliArguments = (arguments_: readonly string[]) =>
  spawnSync("bun", [cli, ...arguments_], {
    encoding: "utf-8",
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
    timeout: 8000,
  });

describe("Effect Doctor CLI", () => {
  it("returns zero and a complete report for a clean project", () => {
    const result = runCli(fixture("clean"));

    expect(result.error).toBeUndefined();
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
        summary: expect.objectContaining({ errors: 2 }),
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

  it("does not expose project paths or compiler stderr in failure JSON", () => {
    const root = fixture("invalid-config");
    const result = runCli(root);
    const report = JSON.parse(result.stdout) as {
      readonly error: { readonly message: string };
    };

    expect(result.status).toBe(2);
    expect(report.error.message).toBe(
      "Project configuration could not be analyzed."
    );
    expect(result.stdout).not.toContain(root);
    expect(result.stdout).not.toContain("effectDoctorPrivateMarker.ts");
  }, 30_000);

  it("lists the exhaustive rule policy", () => {
    const result = runCliArguments(["rules", "list"]);

    expect(result.status).toBe(0);
    expect(result.stdout.trim().split("\n")).toHaveLength(141);
    expect(result.stdout).toContain(
      "effect/no-unbounded-retry\terror\tenabled\tblocking\tenforce\teffect-oxlint"
    );
    expect(result.stdout).toContain(
      "effect/no-ternary\tadvice\tdisabled\tdisabled\treject\teffect-oxlint"
    );
  });

  it("explains rule policy and intent", () => {
    const result = runCliArguments([
      "rules",
      "explain",
      "effect-doctor/prefer-config-redacted",
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Enabled: yes");
    expect(result.stdout).toContain("Status: advisory");
    expect(result.stdout).toContain("Selection: advise");
    expect(result.stdout).toContain("Category: security");
    expect(result.stdout).toContain("Description: Prefer Config.redacted");
  });
});
