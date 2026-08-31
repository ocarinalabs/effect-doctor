import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

const rerunCommand = (output: string): string => {
  const line = output.split("\n").find((value) => value.startsWith("Rerun: "));
  expect(line).toBeDefined();
  return line?.slice("Rerun: ".length) ?? "";
};

const executeRerun = (
  command: string,
  workspace: string
): readonly string[] => {
  const bin = join(workspace, "bin");
  const trace = join(workspace, "rerun-arguments.json");
  const executable = join(bin, "effect-doctor");
  mkdirSync(bin);
  writeFileSync(
    executable,
    [
      "#!/usr/bin/env node",
      'import { writeFileSync } from "node:fs";',
      "writeFileSync(process.env.EFFECT_DOCTOR_RERUN_TRACE, JSON.stringify(process.argv.slice(2)));",
      "",
    ].join("\n")
  );
  chmodSync(executable, 0o755);
  const result = spawnSync("/bin/sh", ["-c", command], {
    cwd: workspace,
    encoding: "utf-8",
    env: {
      ...process.env,
      EFFECT_DOCTOR_RERUN_TRACE: trace,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
    },
  });
  expect(
    result.status,
    [result.stdout, result.stderr].filter(Boolean).join("\n")
  ).toBe(0);
  return JSON.parse(readFileSync(trace, "utf-8")) as readonly string[];
};

describe("Effect Doctor CLI", () => {
  it("returns one when a finding crosses the blocking threshold", () => {
    const result = runCli(fixture("invalid"));
    const report = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(report).toEqual(
      expect.objectContaining({
        applicability: expect.objectContaining({
          normalizedDiagnosticCount: expect.any(Number),
          notApplicable: expect.objectContaining({ total: expect.any(Number) }),
        }),
        policy: expect.objectContaining({
          activeRuleCount: 150,
          id: "effect-v4/default",
          revision: 1,
        }),
        schema: "effect-doctor/scan/v1",
        summary: expect.objectContaining({ errors: 2 }),
      })
    );
    expect(
      report.findings.length + report.applicability.notApplicable.total
    ).toBe(report.applicability.normalizedDiagnosticCount);
  }, 30_000);

  it("does not expose project paths or compiler stderr in failure JSON", () => {
    const root = fixture("invalid-config");
    const result = runCli(root);
    const report = JSON.parse(result.stdout) as {
      readonly error: {
        readonly code: string;
        readonly message: string;
        readonly tag: string;
      };
    };

    expect(result.status).toBe(2);
    expect(report.error).toMatchObject({
      code: "project-invalid",
      tag: "ProjectFailure",
    });
    expect(report.error.message.length).toBeGreaterThan(0);
    expect(result.stdout).not.toContain('"root"');
    expect(result.stdout).not.toContain('"stderr"');
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
        expect.stringMatching(/^Applicability: /u),
        expect.stringMatching(/^Provider fix: /u),
        expect.stringMatching(/^Description: /u),
      ])
    );
    expect(result.stdout).not.toMatch(
      /^(?:Enabled|Selection|Effect versions):/mu
    );
  });

  it.skipIf(process.platform === "win32")(
    "renders an executable, injection-safe handoff for coding agents",
    () => {
      const workspace = mkdtempSync(
        join(
          fileURLToPath(new URL("../../api/tests/fixtures/", import.meta.url)),
          "effect-doctor-cli-"
        )
      );
      const root = join(workspace, "invalid '$(touch sentinel)'");
      cpSync(fixture("invalid"), root, { recursive: true });
      renameSync(join(root, "tsconfig.json"), join(root, "--config.json"));

      try {
        const arguments_ = [
          root,
          "--project=--config.json",
          "--format",
          "agent",
          "--blocking",
          "never",
        ];
        const result = runCliArguments(arguments_);

        expect(result.status).toBe(0);
        expect(result.stdout).toContain(
          "Effect Doctor agent handoff (Effect v4)"
        );
        expect(result.stdout).toContain("150 active rules");
        expect(result.stdout).toContain("diagnostics not applicable");
        expect(result.stdout).toContain("Project: --config.json");
        expect(result.stdout).toContain("Scan receipt:");
        expect(result.stdout).toMatch(
          /Policy: effect-v4\/default@1 [a-f0-9]{64}/u
        );
        expect(result.stdout).toContain("Do not suppress rules");
        expect(result.stdout).toMatch(/Fingerprint: [a-f0-9]{64}/u);
        expect(executeRerun(rerunCommand(result.stdout), workspace)).toEqual([
          root,
          "--project=--config.json",
          "--format",
          "agent",
          "--blocking",
          "never",
        ]);
        expect(existsSync(join(workspace, "sentinel"))).toBe(false);
        const repeated = runCliArguments(arguments_);
        expect(repeated.stdout).toBe(result.stdout);
      } finally {
        rmSync(workspace, { force: true, recursive: true });
      }
    },
    30_000
  );

  it.skipIf(process.platform === "win32")(
    "preserves one normalized project selector in comparison handoffs",
    () => {
      const workspace = mkdtempSync(join(tmpdir(), "effect-doctor-compare-"));
      const baseline = fixture("invalid");
      const candidate = fixture("invalid");
      try {
        const result = runCliArguments([
          "compare",
          baseline,
          candidate,
          "--project",
          "./src/../tsconfig.json",
          "--format",
          "agent",
          "--blocking",
          "never",
        ]);

        expect(result.status).toBe(0);
        expect(result.stdout).toContain("Project: tsconfig.json");
        expect(result.stdout).toContain("Introduced findings: 0");
        expect(result.stdout).toMatch(
          /Candidate receipt: 150 active rules; [1-9]\d* applicable findings;/u
        );
        expect(executeRerun(rerunCommand(result.stdout), workspace)).toEqual([
          "compare",
          baseline,
          candidate,
          "--project=tsconfig.json",
          "--format",
          "agent",
          "--blocking",
          "never",
        ]);
      } finally {
        rmSync(workspace, { force: true, recursive: true });
      }
    },
    30_000
  );
});
