import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageRoot = realpathSync(
  dirname(fileURLToPath(new URL("../package.json", import.meta.url)))
);
const repositoryRoot = realpathSync(join(packageRoot, "../.."));
const oxlintCli = join(
  repositoryRoot,
  "node_modules",
  "oxlint",
  "bin",
  "oxlint"
);
const npmCli = join(
  dirname(process.execPath),
  "node_modules",
  "npm",
  "bin",
  "npm-cli.js"
);
const npmCommand = process.platform === "win32" ? process.execPath : "npm";
const npmArguments = (arguments_: readonly string[]): readonly string[] =>
  process.platform === "win32" ? [npmCli, ...arguments_] : arguments_;

describe.sequential("the packed Oxlint plugin", () => {
  it("loads from its npm archive in real Oxlint", () => {
    const workspace = realpathSync(
      mkdtempSync(join(tmpdir(), "effect-doctor-oxlint-plugin-"))
    );
    try {
      const archiveDirectory = join(workspace, "archive");
      mkdirSync(archiveDirectory);
      const packed = spawnSync(
        npmCommand,
        npmArguments([
          "pack",
          "--json",
          "--pack-destination",
          archiveDirectory,
        ]),
        {
          cwd: packageRoot,
          encoding: "utf-8",
          timeout: 30_000,
        }
      );
      expect(packed.error).toBeUndefined();
      expect(packed.status, packed.stderr).toBe(0);

      const [{ filename }] = JSON.parse(packed.stdout) as readonly [
        { readonly filename: string },
      ];
      const extractedPackage = join(workspace, "package");
      const extracted = spawnSync(
        "tar",
        ["-xzf", join(archiveDirectory, filename), "-C", workspace],
        { encoding: "utf-8", timeout: 10_000 }
      );
      expect(extracted.error).toBeUndefined();
      expect(extracted.status, extracted.stderr).toBe(0);
      expect(
        readFileSync(join(extractedPackage, "LICENSE.oxlint-plugins"), "utf-8")
      ).toContain("Copyright (c) 2024-present VoidZero Inc. & Contributors");

      const plugin = join(extractedPackage, "dist", "index.js");
      const source = join(workspace, "source.ts");
      writeFileSync(
        source,
        'import { Config } from "effect";\nexport const apiKey = Config.string("API_KEY");\n'
      );
      const config = join(workspace, "oxlint.config.json");
      writeFileSync(
        config,
        JSON.stringify({
          categories: {
            correctness: "off",
            nursery: "off",
            pedantic: "off",
            perf: "off",
            restriction: "off",
            style: "off",
            suspicious: "off",
          },
          jsPlugins: [{ name: "effect-doctor", specifier: plugin }],
          rules: { "effect-doctor/prefer-config-redacted": "warn" },
        })
      );
      const linted = spawnSync(
        process.execPath,
        [
          oxlintCli,
          "-c",
          config,
          "-f",
          "json",
          "--disable-nested-config",
          "--no-ignore",
          source,
        ],
        { encoding: "utf-8", timeout: 15_000 }
      );
      expect(linted.error).toBeUndefined();
      expect(linted.status, linted.stderr).toBe(0);
      const output = JSON.parse(linted.stdout) as {
        readonly diagnostics: readonly { readonly code: string }[];
        readonly number_of_files: number;
        readonly number_of_rules: number;
      };
      expect(output).toMatchObject({ number_of_files: 1, number_of_rules: 1 });
      expect(output.diagnostics).toEqual([
        expect.objectContaining({
          code: "effect-doctor(prefer-config-redacted)",
        }),
      ]);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  }, 45_000);
});
