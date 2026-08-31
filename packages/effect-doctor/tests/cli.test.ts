import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const cli = fileURLToPath(new URL("../src/bin.ts", import.meta.url));
const fixture = (name: "invalid" | "invalid-config"): string =>
  fileURLToPath(new URL(`../../api/tests/fixtures/${name}`, import.meta.url));

const runCli = (root: string, format: "agent" | "json" = "json") =>
  spawnSync("bun", [cli, root, "--format", format], {
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

  it("explains a rule through the documented fields", () => {
    const ruleId = "effect-doctor/prefer-config-redacted";
    const result = runCliArguments(["rules", "explain", ruleId]);
    const lines = result.stdout.trim().split("\n");

    expect(result.status).toBe(0);
    expect(lines[0]).toBe(ruleId);
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Status: /u),
        expect.stringMatching(/^Category: /u),
        expect.stringMatching(/^Provider fix: /u),
        expect.stringMatching(/^Description: /u),
      ])
    );
    expect(result.stdout).not.toMatch(
      /^(?:Enabled|Selection|Effect versions):/mu
    );
  });

  it("renders a deterministic handoff for coding agents", () => {
    const root = fixture("invalid");
    const arguments_ = [root, "--format", "agent", "--blocking", "never"];
    const result = runCliArguments(arguments_);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Effect Doctor agent handoff (Effect v4)");
    expect(result.stdout).toContain("Do not suppress rules");
    expect(result.stdout).toMatch(/Fingerprint: [a-f0-9]{64}/u);
    expect(result.stdout).toContain(
      `Rerun: effect-doctor ${JSON.stringify(root)} --format agent --blocking never`
    );
    const repeated = runCliArguments(arguments_);
    expect(repeated.stdout).toBe(result.stdout);
  });
});
