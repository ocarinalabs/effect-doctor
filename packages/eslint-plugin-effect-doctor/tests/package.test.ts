import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { ESLint as EslintApi, Linter } from "eslint";
import { describe, expect, it } from "vitest";

const packageRoot = realpathSync(
  dirname(fileURLToPath(new URL("../package.json", import.meta.url)))
);
const repositoryRoot = realpathSync(join(packageRoot, "../.."));
const oxlintPluginRoot = realpathSync(
  join(packageRoot, "../oxlint-plugin-effect-doctor")
);
const typescriptCli = join(
  repositoryRoot,
  "node_modules",
  "typescript",
  "bin",
  "tsc"
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

const pack = (packageDirectory: string, archiveDirectory: string): string => {
  const packed = spawnSync(
    npmCommand,
    npmArguments(["pack", "--json", "--pack-destination", archiveDirectory]),
    {
      cwd: packageDirectory,
      encoding: "utf-8",
      timeout: 30_000,
    }
  );
  expect(packed.error).toBeUndefined();
  expect(packed.status, packed.stderr).toBe(0);
  const [{ filename }] = JSON.parse(packed.stdout) as readonly [
    { readonly filename: string },
  ];
  return join(archiveDirectory, filename);
};

describe.sequential.each(["9.39.5", "10.9.1"])(
  "the installed plugin with ESLint %s",
  (eslintVersion) => {
    it("exports its flat config and reports an Effect finding", async () => {
      const workspace = realpathSync(
        mkdtempSync(join(tmpdir(), "effect-doctor-eslint-plugin-"))
      );
      try {
        const archiveDirectory = join(workspace, "archive");
        mkdirSync(archiveDirectory);
        const oxlintPluginArchive = pack(oxlintPluginRoot, archiveDirectory);
        const eslintPluginArchive = pack(packageRoot, archiveDirectory);

        writeFileSync(
          join(workspace, "package.json"),
          JSON.stringify({ name: "fixture", private: true, type: "module" })
        );
        const installed = spawnSync(
          npmCommand,
          npmArguments([
            "install",
            "--ignore-scripts",
            "--no-audit",
            "--no-fund",
            "--no-package-lock",
            `eslint@${eslintVersion}`,
            "effect@4.0.0-rc.113",
            oxlintPluginArchive,
            eslintPluginArchive,
          ]),
          { cwd: workspace, encoding: "utf-8", timeout: 45_000 }
        );
        expect(installed.error).toBeUndefined();
        expect(installed.status, installed.stderr).toBe(0);

        const fixtureRequire = createRequire(join(workspace, "package.json"));
        const pluginEntry = fixtureRequire.resolve(
          "eslint-plugin-effect-doctor"
        );
        const eslintEntry = fixtureRequire.resolve("eslint");
        const { default: effectDoctor, recommended } = (await import(
          pathToFileURL(pluginEntry).href
        )) as {
          readonly default: {
            readonly configs: {
              readonly recommended: Linter.Config;
            };
            readonly meta: { readonly name: string; readonly version: string };
            readonly rules: Readonly<
              Record<
                string,
                {
                  readonly meta: {
                    readonly docs: { readonly url: string };
                  };
                }
              >
            >;
          };
          readonly recommended: Linter.Config;
        };
        const { ESLint } = (await import(pathToFileURL(eslintEntry).href)) as {
          readonly ESLint: typeof EslintApi;
        };
        expect(ESLint.version).toBe(eslintVersion);
        expect(effectDoctor.meta).toEqual({
          name: "effect-doctor",
          version: "0.1.0",
        });
        expect(Object.keys(effectDoctor.rules)).toHaveLength(24);
        expect(effectDoctor.configs.recommended).toBe(recommended);
        expect(recommended.plugins?.["effect-doctor"]).toBe(effectDoctor);
        expect(Object.keys(recommended.rules ?? {}).toSorted()).toEqual(
          Object.keys(effectDoctor.rules)
            .map((ruleName) => `effect-doctor/${ruleName}`)
            .toSorted()
        );
        expect(new Set(Object.values(recommended.rules ?? {}))).toEqual(
          new Set(["warn"])
        );
        expect(
          new Set(
            Object.values(effectDoctor.rules).map((rule) => rule.meta.docs.url)
          )
        ).toEqual(
          new Set([
            "https://github.com/ocarinalabs/effect-doctor/tree/main/packages/oxlint-plugin-effect-doctor#available-rules",
          ])
        );
        const consumer = join(workspace, "consumer.ts");
        writeFileSync(
          consumer,
          'import effectDoctor, { recommended } from "eslint-plugin-effect-doctor";\nimport type { Linter } from "eslint";\nconst configs: readonly Linter.Config[] = [effectDoctor.configs.recommended, recommended];\nvoid configs;\n'
        );
        const typechecked = spawnSync(
          process.execPath,
          [
            typescriptCli,
            "--module",
            "NodeNext",
            "--moduleResolution",
            "NodeNext",
            "--noEmit",
            "--strict",
            "--target",
            "ES2024",
            consumer,
          ],
          { cwd: workspace, encoding: "utf-8", timeout: 30_000 }
        );
        expect(typechecked.error).toBeUndefined();
        expect(
          typechecked.status,
          `${typechecked.stdout}\n${typechecked.stderr}`
        ).toBe(0);
        const eslint = new ESLint({
          cwd: workspace,
          overrideConfig: [recommended],
          overrideConfigFile: true,
        });
        const [result] = await eslint.lintText(
          'import { Config } from "effect";\nexport const token = Config.String("API_TOKEN");\n',
          { filePath: "source.mjs" }
        );

        expect(result?.messages).toEqual([
          expect.objectContaining({
            message: "Use Config.Redacted for secret configuration API_TOKEN.",
            ruleId: "effect-doctor/prefer-config-redacted",
            severity: 1,
          }),
        ]);
      } finally {
        rmSync(workspace, { force: true, recursive: true });
      }
    }, 60_000);
  }
);
