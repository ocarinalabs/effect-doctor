import { Buffer } from "node:buffer";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { compareProjects, scanProject } from "../src/index.js";

const fixture = (name: "clean" | "doctor" | "invalid" | "solution"): string =>
  fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));

const copyFixture = (
  name: "clean" | "invalid" | "solution",
  prefix: string
) => {
  const holder = mkdtempSync(
    join(fileURLToPath(new URL("fixtures/", import.meta.url)), prefix)
  );
  const root = join(holder, name);
  cpSync(fixture(name), root, { recursive: true });
  return { holder, root };
};

describe("scanProject", () => {
  it("scans a solution config through its recursive project references", async () => {
    const report = await Effect.runPromise(
      scanProject({ root: fixture("solution") })
    );

    expect(report.target).toEqual({
      entry: "tsconfig.json",
      projects: [
        "packages/app/tsconfig.json",
        "packages/shared/tsconfig.json",
        "tsconfig.json",
      ],
    });
    expect(report.engines[0]?.analyzedFiles).toEqual([
      "packages/app/src/main.ts",
      "packages/shared/src/shared.ts",
    ]);
    expect(
      report.engines.every(
        (engine) =>
          JSON.stringify(engine.analyzedFiles) ===
          JSON.stringify(report.engines[0]?.analyzedFiles)
      )
    ).toBe(true);
  }, 30_000);

  it("selects a nested entry while keeping sibling references inside the root", async () => {
    const report = await Effect.runPromise(
      scanProject({
        project: "packages/app/tsconfig.json",
        root: fixture("solution"),
      })
    );

    expect(report.target).toEqual({
      entry: "packages/app/tsconfig.json",
      projects: ["packages/app/tsconfig.json", "packages/shared/tsconfig.json"],
    });
    expect(report.engines[0]?.analyzedFiles).toEqual([
      "packages/app/src/main.ts",
      "packages/shared/src/shared.ts",
    ]);
  }, 30_000);

  it("matches diagnostics emitted through a symlinked project reference", async () => {
    const workspace = copyFixture("solution", "symlink-reference-");
    const packages = join(workspace.root, "packages");
    const shared = join(packages, "shared");
    const sharedReal = join(packages, "shared-real");
    renameSync(shared, sharedReal);
    symlinkSync("shared-real", shared, "dir");
    writeFileSync(
      join(sharedReal, "src", "shared.ts"),
      [
        'import { Effect } from "effect";',
        "",
        'Effect.succeed("unused");',
        'export const shared = Effect.succeed("shared");',
        "",
      ].join("\n")
    );

    try {
      const report = await Effect.runPromise(
        scanProject({ root: workspace.root })
      );
      expect(report.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            location: expect.objectContaining({
              file: "packages/shared-real/src/shared.ts",
            }),
            provenance: expect.objectContaining({ engine: "effect-tsgo" }),
            ruleId: "effect/floating-effect",
          }),
        ])
      );
    } finally {
      rmSync(workspace.holder, { force: true, recursive: true });
    }
  }, 30_000);

  it("rejects a referenced project with no proven Effect v4 version", async () => {
    const workspace = copyFixture("solution", "neutral-reference-");
    const neutral = join(workspace.root, "packages", "neutral");
    mkdirSync(join(neutral, "src"), { recursive: true });
    writeFileSync(
      join(neutral, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          composite: true,
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          target: "ES2024",
        },
        include: ["src/**/*.ts"],
      })
    );
    writeFileSync(
      join(neutral, "src", "neutral.ts"),
      "export const neutral = true;\n"
    );
    const rootConfig = join(workspace.root, "tsconfig.json");
    const config = JSON.parse(readFileSync(rootConfig, "utf-8"));
    writeFileSync(
      rootConfig,
      JSON.stringify({
        ...config,
        references: [...config.references, { path: "packages/neutral" }],
      })
    );

    try {
      await expect(
        Effect.runPromise(scanProject({ root: workspace.root }))
      ).rejects.toMatchObject({
        _tag: "ProjectFailure",
        code: "effect-unsupported",
        message: expect.stringContaining("packages/neutral/src/neutral.ts"),
      });
    } finally {
      rmSync(workspace.holder, { force: true, recursive: true });
    }
  }, 30_000);

  it("reports the same findings with or without a byte order mark", async () => {
    const workspace = copyFixture("invalid", "bom-");
    const line =
      'import { Config, Effect } from "effect"; export const key = Config.String("API_KEY"); export const run = Effect.gen(function* () { Effect.succeed(1); yield* Effect.succeed(2); });\n';
    writeFileSync(join(workspace.root, "src", "plain.ts"), line);
    writeFileSync(join(workspace.root, "src", "bom.ts"), `\uFEFF${line}`);

    try {
      const report = await Effect.runPromise(
        scanProject({ root: workspace.root })
      );
      const findingsFor = (file: string) =>
        report.findings
          .filter((finding) => finding.location.file === file)
          .map(({ evidence, fingerprint, location, ruleId }) => ({
            column: location.start.column,
            evidence,
            fingerprint,
            line: location.start.line,
            ruleId,
          }));
      const plain = findingsFor("src/plain.ts");
      expect(plain).toContainEqual(
        expect.objectContaining({
          line: 1,
          ruleId: "effect-doctor/prefer-config-redacted",
        })
      );
      expect(plain).toContainEqual(
        expect.objectContaining({
          column: line.indexOf("Effect.succeed(1)") + 1,
          line: 1,
          ruleId: "effect/floating-effect",
        })
      );
      expect(findingsFor("src/bom.ts")).toEqual(plain);
    } finally {
      rmSync(workspace.holder, { force: true, recursive: true });
    }
  }, 30_000);

  it("counts carriage returns as line breaks like the analyzers", async () => {
    const workspace = copyFixture("invalid", "cr-");
    const lines = [
      'import { Config, Effect } from "effect";',
      "",
      'export const key = \rConfig.String("API_KEY");',
      "",
      "export const run = Effect.gen(function* () {",
      "  Effect.succeed(1);",
      "  return yield* Effect.succeed(2);",
      "});",
      "",
    ];
    writeFileSync(join(workspace.root, "src", "cr.ts"), lines.join("\r"));
    writeFileSync(join(workspace.root, "src", "stray.ts"), lines.join("\n"));

    try {
      const report = await Effect.runPromise(
        scanProject({ root: workspace.root })
      );
      const positions = (file: string) =>
        report.findings
          .filter((finding) => finding.location.file === file)
          .map((finding) => ({
            column: finding.location.start.column,
            line: finding.location.start.line,
            ruleId: finding.ruleId,
          }));
      expect(positions("src/cr.ts")).toEqual(
        expect.arrayContaining([
          {
            column: 1,
            line: 4,
            ruleId: "effect-doctor/prefer-config-redacted",
          },
          { column: 3, line: 7, ruleId: "effect/floating-effect" },
        ])
      );
      expect(positions("src/stray.ts")).toEqual(positions("src/cr.ts"));
    } finally {
      rmSync(workspace.holder, { force: true, recursive: true });
    }
  }, 30_000);

  it("rejects a source that is not valid UTF-8 and names it", async () => {
    const workspace = copyFixture("invalid", "latin1-");
    writeFileSync(
      join(workspace.root, "src", "latin1.ts"),
      Buffer.from('export const name = "caf\u00E9";\n', "latin1")
    );

    try {
      await expect(
        Effect.runPromise(scanProject({ root: workspace.root }))
      ).rejects.toMatchObject({
        _tag: "ProjectFailure",
        code: "source-invalid",
        message: expect.stringContaining("src/latin1.ts"),
      });
    } finally {
      rmSync(workspace.holder, { force: true, recursive: true });
    }
  }, 30_000);

  it("names both paths when a symlink duplicates a project source", async () => {
    const workspace = copyFixture("invalid", "alias-");
    symlinkSync("main.ts", join(workspace.root, "src", "alias.ts"));

    try {
      await expect(
        Effect.runPromise(scanProject({ root: workspace.root }))
      ).rejects.toMatchObject({
        _tag: "ProjectFailure",
        code: "duplicate-source",
        message: expect.stringContaining("src/alias.ts"),
      });
    } finally {
      rmSync(workspace.holder, { force: true, recursive: true });
    }
  }, 30_000);

  it("rejects a selected project outside the scan root", async () => {
    await expect(
      Effect.runPromise(
        scanProject({
          project: "../clean/tsconfig.json",
          root: fixture("solution"),
        })
      )
    ).rejects.toMatchObject({
      _tag: "ProjectFailure",
      code: "outside-root",
    });
  });

  it("rejects a selected project symlink that resolves outside the scan root", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "effect-doctor-project-"));
    const root = join(workspace, "root");
    const outside = join(workspace, "outside.json");
    mkdirSync(root);
    writeFileSync(outside, "{}\n");
    symlinkSync(outside, join(root, "linked.json"));

    try {
      await expect(
        Effect.runPromise(scanProject({ project: "linked.json", root }))
      ).rejects.toMatchObject({
        _tag: "ProjectFailure",
        code: "outside-root",
      });
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("includes project-local declaration files in every Analyzer Run", async () => {
    const report = await Effect.runPromise(
      scanProject({ root: fixture("clean") })
    );

    expect(report.engines.map((engine) => engine.engine)).toEqual([
      "effect-doctor",
      "effect-tsgo",
    ]);
    expect(report.engines.every((engine) => engine.complete)).toBe(true);
    expect(
      report.engines.every((engine) =>
        engine.analyzedFiles.includes("src/environment.d.ts")
      )
    ).toBe(true);
    expect(
      new Set(
        report.engines.map((engine) => JSON.stringify(engine.analyzedFiles))
      ).size
    ).toBe(1);
  }, 30_000);

  it("accounts for broad diagnostics without hiding specialized Effect defects", async () => {
    const workspace = copyFixture("clean", "applicability-");
    writeFileSync(
      join(workspace.root, "src", "plain.ts"),
      ["export const roll = () => Math.random();", ""].join("\n")
    );
    writeFileSync(
      join(workspace.root, "src", "effect-module.ts"),
      [
        'import { Effect } from "effect";',
        "",
        'export const program = Effect.succeed("ready");',
        "export const roll = () => Math.random();",
        "",
      ].join("\n")
    );
    for (const file of ["worker.test.ts", "client.generated.ts"]) {
      writeFileSync(
        join(workspace.root, "src", file),
        [
          'import { Effect } from "effect";',
          "",
          'Effect.succeed("unused");',
          "",
        ].join("\n")
      );
    }

    try {
      const report = await Effect.runPromise(
        scanProject({ root: workspace.root })
      );
      const profiles = new Map(
        report.applicability.files.map((profile) => [profile.file, profile])
      );

      expect(report.policy).toMatchObject({
        activeRuleCount: 118,
        id: "effect-v4/default",
        revision: 7,
      });
      expect(profiles.get("src/plain.ts")).toMatchObject({
        directEffectModuleReference: false,
      });
      expect(profiles.get("src/effect-module.ts")).toMatchObject({
        directEffectModuleReference: true,
      });
      expect(report.applicability.notApplicable.groups).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: "effect/global-random" }),
        ])
      );
      expect(
        report.findings.some(
          (finding) =>
            finding.location.file === "src/plain.ts" &&
            finding.ruleId === "effect/global-random"
        )
      ).toBe(false);
      expect(
        report.findings.some(
          (finding) =>
            finding.location.file === "src/effect-module.ts" &&
            finding.ruleId === "effect/global-random"
        )
      ).toBe(true);
      for (const file of ["src/worker.test.ts", "src/client.generated.ts"]) {
        expect(
          report.findings.some(
            (finding) =>
              finding.location.file === file &&
              finding.ruleId === "effect/floating-effect"
          )
        ).toBe(true);
      }
      expect(
        report.findings.length + report.applicability.notApplicable.total
      ).toBe(report.applicability.normalizedDiagnosticCount);
    } finally {
      rmSync(workspace.holder, { force: true, recursive: true });
    }
  }, 30_000);

  it("combines type-aware and structural Effect diagnostics", async () => {
    const report = await Effect.runPromise(
      scanProject({ root: fixture("invalid") })
    );

    expect(report.schema).toBe("effect-doctor/scan/v1");
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          location: expect.objectContaining({ file: "src/main.ts" }),
          provenance: {
            engine: "effect-tsgo",
            nativeRuleId: "floatingEffect",
          },
          ruleId: "effect/floating-effect",
          severity: "error",
        }),
        expect.objectContaining({
          location: expect.objectContaining({ file: "src/main.ts" }),
          provenance: {
            engine: "effect-doctor",
            nativeRuleId: "prefer-config-redacted",
          },
          ruleId: "effect-doctor/prefer-config-redacted",
          severity: "error",
        }),
      ])
    );
  }, 30_000);

  it("reports UTF-16 columns from every analyzer", async () => {
    const workspace = copyFixture("invalid", "unicode-columns-");
    writeFileSync(
      join(workspace.root, "src", "main.ts"),
      [
        'import { Config, Effect } from "effect";',
        "",
        '/* é */ export const key = Config.String("API_KEY");',
        "export const program = Effect.gen(function* () {",
        '  /* 😀 */ Effect.succeed("floating");',
        '  return yield* Effect.succeed("done");',
        "});",
        "",
      ].join("\n")
    );

    try {
      const report = await Effect.runPromise(
        scanProject({ root: workspace.root })
      );
      expect(report.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            evidence: 'Effect.succeed("floating")',
            location: expect.objectContaining({
              end: { column: 38, line: 5 },
              start: { column: 12, line: 5 },
            }),
            provenance: expect.objectContaining({ engine: "effect-tsgo" }),
            ruleId: "effect/floating-effect",
          }),
          expect.objectContaining({
            evidence: 'Config.String("API_KEY")',
            location: expect.objectContaining({
              end: { column: 52, line: 3 },
              start: { column: 28, line: 3 },
            }),
            provenance: expect.objectContaining({ engine: "effect-doctor" }),
            ruleId: "effect-doctor/prefer-config-redacted",
          }),
        ])
      );
    } finally {
      rmSync(workspace.holder, { force: true, recursive: true });
    }
  }, 30_000);

  it("stops when an analyzer exceeds the requested timeout", async () => {
    await expect(
      Effect.runPromise(
        scanProject({ analyzerTimeout: "1 millis", root: fixture("clean") })
      )
    ).rejects.toMatchObject({
      _tag: "AnalyzerFailure",
      reason: "timeout",
    });
  }, 30_000);

  it("runs every first-party rule without exposing the Oxlint canary", async () => {
    const report = await Effect.runPromise(
      scanProject({ root: fixture("doctor") })
    );
    const configFindings = report.findings.filter(
      (finding) => finding.ruleId === "effect-doctor/prefer-config-redacted"
    );

    const suppressionFindings = report.findings.filter(
      (finding) => finding.ruleId === "effect-doctor/diagnostic-suppression"
    );
    expect(suppressionFindings.map((finding) => finding.evidence)).toContain(
      "oxlint-disable effect-doctor/diagnostic-suppression"
    );
    expect(suppressionFindings.map((finding) => finding.evidence)).toContain(
      "oxlint-disable-line effect-doctor/diagnostic-suppression"
    );
    expect(
      suppressionFindings.some((finding) =>
        finding.evidence.includes("imaginary/lookalike")
      )
    ).toBe(false);
    expect(
      report.findings.some((finding) => finding.ruleId.includes("canary"))
    ).toBe(false);
    expect(
      configFindings.some((finding) =>
        finding.evidence.includes("PUBLIC_API_KEY")
      )
    ).toBe(false);
    expect(
      configFindings.some((finding) => finding.evidence.includes("CLIENT_ID"))
    ).toBe(false);
    expect(
      configFindings.some((finding) =>
        finding.evidence.includes("LOCAL_SECRET")
      )
    ).toBe(false);
  }, 30_000);
});

describe("scan report stability", () => {
  it("produces byte-stable report data for identical source", async () => {
    const first = await Effect.runPromise(
      scanProject({ root: fixture("clean") })
    );
    const second = await Effect.runPromise(
      scanProject({ root: fixture("clean") })
    );

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  }, 30_000);
});

describe("compareProjects", () => {
  it("reports only findings introduced by the candidate", async () => {
    const report = await Effect.runPromise(
      compareProjects({
        baselineRoot: fixture("clean"),
        candidateRoot: fixture("invalid"),
      })
    );

    expect(report.introduced.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining([
        "effect/floating-effect",
        "effect-doctor/prefer-config-redacted",
      ])
    );
    expect(report.resolved).toEqual([]);
  }, 30_000);

  it("uses one non-default project graph for both sides", async () => {
    const report = await Effect.runPromise(
      compareProjects({
        baselineRoot: fixture("solution"),
        candidateRoot: fixture("solution"),
        project: "packages/app/tsconfig.json",
      })
    );

    const target = {
      entry: "packages/app/tsconfig.json",
      projects: ["packages/app/tsconfig.json", "packages/shared/tsconfig.json"],
    };
    expect(report.baseline.target).toEqual(target);
    expect(report.candidate.target).toEqual(target);
    expect(report.introduced).toEqual([]);
    expect(report.resolved).toEqual([]);
  }, 30_000);

  it("preserves one lexical selector when only one side uses a symlink", async () => {
    const workspace = copyFixture("clean", "comparison-selector-");
    const candidate = join(workspace.holder, "candidate");
    cpSync(fixture("clean"), candidate, { recursive: true });
    symlinkSync("tsconfig.json", join(workspace.root, "alias.json"));
    cpSync(join(candidate, "tsconfig.json"), join(candidate, "alias.json"));

    try {
      const report = await Effect.runPromise(
        compareProjects({
          baselineRoot: workspace.root,
          candidateRoot: candidate,
          project: "alias.json",
        })
      );
      expect(report.baseline.target).toEqual({
        entry: "alias.json",
        projects: ["alias.json"],
      });
      expect(report.candidate.target).toEqual(report.baseline.target);
    } finally {
      rmSync(workspace.holder, { force: true, recursive: true });
    }
  }, 30_000);
});
