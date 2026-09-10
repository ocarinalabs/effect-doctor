import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  makeProjectSnapshot,
  verifyProjectSnapshot,
} from "../src/internal/project/snapshot.js";
import { resolveToolchain } from "../src/internal/project/toolchain.js";

const fixture = (name: "clean" | "solution") =>
  fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));

const withWorkspace = async <A>(
  use: (root: string) => Promise<A>,
  name: "clean" | "solution" = "clean"
): Promise<A> => {
  const workspace = realpathSync(
    mkdtempSync(join(tmpdir(), "effect-doctor-snapshot-"))
  );
  cpSync(fixture(name), workspace, { recursive: true });
  try {
    return await use(workspace);
  } finally {
    rmSync(workspace, { force: true, recursive: true });
  }
};

const runWithNode = <A, E>(
  effect: Effect.Effect<A, E, NodeServices.NodeServices>
) => Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));

describe("ProjectSnapshot final verification", () => {
  it("rejects a source added after the initial project plan", () =>
    withWorkspace(async (root) => {
      const toolchain = await runWithNode(resolveToolchain());
      const snapshot = await runWithNode(
        makeProjectSnapshot(
          root,
          { entry: "tsconfig.json", tsconfig: join(root, "tsconfig.json") },
          toolchain.tsgoExecutable
        )
      );
      writeFileSync(
        join(root, "src", "added.ts"),
        "export const added = true;\n"
      );

      await expect(
        runWithNode(verifyProjectSnapshot(snapshot, toolchain.tsgoExecutable))
      ).rejects.toMatchObject({ _tag: "ProjectFailure" });
    }));

  it("rejects a source removed after the initial project plan", () =>
    withWorkspace(async (root) => {
      const toolchain = await runWithNode(resolveToolchain());
      const snapshot = await runWithNode(
        makeProjectSnapshot(
          root,
          { entry: "tsconfig.json", tsconfig: join(root, "tsconfig.json") },
          toolchain.tsgoExecutable
        )
      );
      rmSync(join(root, "src", "main.ts"));

      await expect(
        runWithNode(verifyProjectSnapshot(snapshot, toolchain.tsgoExecutable))
      ).rejects.toMatchObject({ _tag: "ProjectFailure" });
    }));

  it("rejects tsconfig changes that preserve the file inventory", () =>
    withWorkspace(async (root) => {
      const tsconfig = join(root, "tsconfig.json");
      const toolchain = await runWithNode(resolveToolchain());
      const snapshot = await runWithNode(
        makeProjectSnapshot(
          root,
          { entry: "tsconfig.json", tsconfig },
          toolchain.tsgoExecutable
        )
      );
      writeFileSync(tsconfig, `${readFileSync(tsconfig, "utf-8")}\n`);

      await expect(
        runWithNode(verifyProjectSnapshot(snapshot, toolchain.tsgoExecutable))
      ).rejects.toMatchObject({ _tag: "ProjectFailure" });
    }));

  it("rejects changes in an extended config that preserve the inventory", () =>
    withWorkspace(async (root) => {
      const baseConfig = join(root, "tsconfig.base.json");
      const tsconfig = join(root, "tsconfig.json");
      writeFileSync(
        baseConfig,
        JSON.stringify({ compilerOptions: { strict: true } })
      );
      writeFileSync(
        tsconfig,
        JSON.stringify({
          extends: "./tsconfig.base.json",
          include: ["src/**/*.ts"],
        })
      );
      const toolchain = await runWithNode(resolveToolchain());
      const snapshot = await runWithNode(
        makeProjectSnapshot(
          root,
          { entry: "tsconfig.json", tsconfig },
          toolchain.tsgoExecutable
        )
      );
      writeFileSync(
        baseConfig,
        JSON.stringify({ compilerOptions: { strict: false } })
      );

      await expect(
        runWithNode(verifyProjectSnapshot(snapshot, toolchain.tsgoExecutable))
      ).rejects.toMatchObject({ _tag: "ProjectFailure" });
    }));

  it("rejects a referenced config changed after graph planning", () =>
    withWorkspace(async (root) => {
      const tsconfig = join(root, "tsconfig.json");
      const referenced = join(root, "packages", "shared", "tsconfig.json");
      const toolchain = await runWithNode(resolveToolchain());
      const snapshot = await runWithNode(
        makeProjectSnapshot(
          root,
          { entry: "tsconfig.json", tsconfig },
          toolchain.tsgoExecutable
        )
      );
      writeFileSync(referenced, `${readFileSync(referenced, "utf-8")}\n`);

      await expect(
        runWithNode(verifyProjectSnapshot(snapshot, toolchain.tsgoExecutable))
      ).rejects.toMatchObject({
        _tag: "ProjectFailure",
        code: "project-changed",
      });
    }, "solution"));

  it("rejects a selected config symlink retargeted after planning", () =>
    withWorkspace(async (root) => {
      const alias = join(root, "alias.json");
      const replacement = join(root, "replacement.json");
      cpSync(join(root, "tsconfig.json"), replacement);
      symlinkSync("tsconfig.json", alias);
      const toolchain = await runWithNode(resolveToolchain());
      const snapshot = await runWithNode(
        makeProjectSnapshot(
          root,
          { entry: "alias.json", tsconfig: realpathSync(alias) },
          toolchain.tsgoExecutable
        )
      );
      rmSync(alias);
      symlinkSync("replacement.json", alias);

      await expect(
        runWithNode(verifyProjectSnapshot(snapshot, toolchain.tsgoExecutable))
      ).rejects.toMatchObject({
        _tag: "ProjectFailure",
        code: "project-changed",
      });
    }));
});

describe("ProjectSnapshot planning failures", () => {
  it("names the compiler failure without repeating project paths", () =>
    withWorkspace(async (root) => {
      const tsconfig = join(root, "tsconfig.json");
      writeFileSync(
        tsconfig,
        JSON.stringify({
          compilerOptions: {},
          files: ["src/effectDoctorMissingSource.ts"],
        })
      );
      const toolchain = await runWithNode(resolveToolchain());

      const failure = await runWithNode(
        makeProjectSnapshot(
          root,
          { entry: "tsconfig.json", tsconfig },
          toolchain.tsgoExecutable
        ).pipe(Effect.flip)
      );

      expect(failure).toMatchObject({
        _tag: "ProjectFailure",
        code: "project-invalid",
      });
      expect(failure.message).toMatch(/exit code \d+|ENOENT|NotFound/u);
      expect(failure.message).not.toContain("effectDoctorMissingSource");
      expect(failure.message).not.toContain(root);
    }));
});

describe("ProjectSnapshot reference graph", () => {
  it("visits a diamond reference once", () =>
    withWorkspace(async (root) => {
      const tsconfig = join(root, "tsconfig.json");
      writeFileSync(
        tsconfig,
        JSON.stringify({
          files: [],
          references: [{ path: "packages/app" }, { path: "packages/shared" }],
        })
      );
      const toolchain = await runWithNode(resolveToolchain());
      const snapshot = await runWithNode(
        makeProjectSnapshot(
          root,
          { entry: "tsconfig.json", tsconfig },
          toolchain.tsgoExecutable
        )
      );

      expect(snapshot.target.projects).toEqual([
        "packages/app/tsconfig.json",
        "packages/shared/tsconfig.json",
        "tsconfig.json",
      ]);
      expect(snapshot.files.map((file) => file.relative)).toEqual([
        "packages/app/src/main.ts",
        "packages/shared/src/shared.ts",
      ]);
    }, "solution"));

  it("rejects a project reference cycle", () =>
    withWorkspace(async (root) => {
      const shared = join(root, "packages", "shared", "tsconfig.json");
      const config = JSON.parse(readFileSync(shared, "utf-8"));
      writeFileSync(
        shared,
        JSON.stringify({ ...config, references: [{ path: "../app" }] })
      );
      const toolchain = await runWithNode(resolveToolchain());

      await expect(
        runWithNode(
          makeProjectSnapshot(
            root,
            { entry: "tsconfig.json", tsconfig: join(root, "tsconfig.json") },
            toolchain.tsgoExecutable
          )
        )
      ).rejects.toMatchObject({
        _tag: "ProjectFailure",
        code: "reference-cycle",
      });
    }, "solution"));

  it("rejects source ownership shared by distinct projects", () =>
    withWorkspace(async (root) => {
      const other = join(root, "packages", "other");
      mkdirSync(other);
      writeFileSync(
        join(other, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            composite: true,
            module: "NodeNext",
            moduleResolution: "NodeNext",
            strict: true,
            target: "ES2024",
          },
          files: ["../shared/src/shared.ts"],
        })
      );
      writeFileSync(
        join(root, "tsconfig.json"),
        JSON.stringify({
          files: [],
          references: [{ path: "packages/app" }, { path: "packages/other" }],
        })
      );
      const toolchain = await runWithNode(resolveToolchain());

      await expect(
        runWithNode(
          makeProjectSnapshot(
            root,
            { entry: "tsconfig.json", tsconfig: join(root, "tsconfig.json") },
            toolchain.tsgoExecutable
          )
        )
      ).rejects.toMatchObject({
        _tag: "ProjectFailure",
        code: "duplicate-source",
      });
    }, "solution"));
});
