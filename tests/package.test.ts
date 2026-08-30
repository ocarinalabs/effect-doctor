import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DOCTOR_VERSION } from "../src/version.js";

const projectRoot = realpathSync(
  dirname(fileURLToPath(new URL("../package.json", import.meta.url)))
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
const fixture = realpathSync(
  fileURLToPath(new URL("fixtures/clean", import.meta.url))
);
const packageManifest = JSON.parse(
  readFileSync(join(projectRoot, "package.json"), "utf-8")
) as {
  readonly bin: Readonly<Record<string, string>>;
  readonly private?: boolean;
  readonly publishConfig?: {
    readonly access?: string;
    readonly registry?: string;
  };
  readonly repository?: {
    readonly type?: string;
    readonly url?: string;
  };
  readonly scripts: Readonly<Record<string, string>>;
  readonly version: string;
};
const runPackagedCli = (
  packagedCli: string,
  extractedPackage: string,
  arguments_: readonly string[]
) =>
  spawnSync(process.execPath, [packagedCli, ...arguments_], {
    cwd: extractedPackage,
    encoding: "utf-8",
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
    timeout: 8000,
  });

const withPackedCli = <A>(
  use: (packagedCli: string, extractedPackage: string) => A
): A => {
  const workspace = realpathSync(
    mkdtempSync(join(tmpdir(), "effect-doctor-package-"))
  );
  const workspaceRoot = realpathSync(dirname(workspace));
  if (!workspace.startsWith(join(workspaceRoot, "effect-doctor-package-"))) {
    throw new Error(`Unexpected package-test workspace: ${workspace}`);
  }

  try {
    const extractedPackage = join(workspace, "package");
    const packagedCli = join(extractedPackage, "dist", "bin.js");
    const packDirectory = join(workspace, "tarball");
    mkdirSync(packDirectory);
    const packed = spawnSync(
      npmCommand,
      npmArguments(["pack", "--json", "--pack-destination", packDirectory]),
      {
        cwd: projectRoot,
        encoding: "utf-8",
        timeout: 30_000,
      }
    );
    expect(packed.error).toBeUndefined();
    expect(packed.status).toBe(0);
    const [{ filename }] = JSON.parse(packed.stdout) as readonly [
      { readonly filename: string },
    ];
    const archive = join(packDirectory, filename);
    const extracted = spawnSync("tar", ["-xzf", archive, "-C", workspace], {
      encoding: "utf-8",
      timeout: 10_000,
    });
    expect(extracted.error).toBeUndefined();
    expect(extracted.status).toBe(0);
    expect(
      existsSync(join(extractedPackage, "dist", "internal", "doctor.js"))
    ).toBe(false);
    symlinkSync(
      join(projectRoot, "node_modules"),
      join(extractedPackage, "node_modules"),
      process.platform === "win32" ? "junction" : "dir"
    );
    return use(packagedCli, extractedPackage);
  } finally {
    rmSync(workspace, { force: true, recursive: true });
  }
};

describe.sequential("the packed CLI", () => {
  it("is configured for the initial public release", () => {
    expect(packageManifest).toMatchObject({
      bin: { "effect-doctor": "dist/bin.js" },
      publishConfig: {
        access: "public",
        registry: "https://registry.npmjs.org/",
      },
      repository: {
        type: "git",
        url: "git+https://github.com/ocarinalabs/effect-doctor.git",
      },
    });
    expect(packageManifest.private).toBeUndefined();
    expect(packageManifest.version).not.toBe("0.0.0");
    expect(DOCTOR_VERSION).toBe(packageManifest.version);
  });

  it("checks catalog drift in local and package verification", () => {
    expect(packageManifest.scripts.check).toMatch(/^bun run catalog:check/u);
    expect(packageManifest.scripts.prepack).toMatch(/^bun run catalog:check/u);
  });

  it("explains a catalog rule from the archive", () => {
    withPackedCli((packagedCli, extractedPackage) => {
      const result = runPackagedCli(packagedCli, extractedPackage, [
        "rules",
        "explain",
        "effect-doctor/prefer-config-redacted",
      ]);

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Enabled: yes");
      expect(result.stdout).toContain("Status: advisory");
    });
  }, 45_000);

  it("scans with the first-party plugin shipped in the archive", () => {
    withPackedCli((packagedCli, extractedPackage) => {
      const result = runPackagedCli(packagedCli, extractedPackage, [
        fixture,
        "--format",
        "json",
      ]);

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      const report = JSON.parse(result.stdout) as {
        readonly engines: readonly { readonly complete: boolean }[];
        readonly schema: string;
        readonly summary: unknown;
      };
      expect(report).toMatchObject({
        schema: "effect-doctor/scan/v1",
        summary: { advice: 0, errors: 0, warnings: 0 },
      });
      expect(report.engines.every((engine) => engine.complete)).toBe(true);
      expect(readFileSync(packagedCli, "utf-8")).toContain(
        "NodeRuntime.runMain"
      );
    });
  }, 45_000);
});
