import {
  cpSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
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
} from "../src/internal/project-snapshot.js";
import { resolveToolchain } from "../src/internal/toolchain.js";

const fixture = fileURLToPath(new URL("fixtures/clean", import.meta.url));

const withWorkspace = async <A>(
  use: (root: string) => Promise<A>
): Promise<A> => {
  const workspace = realpathSync(
    mkdtempSync(join(tmpdir(), "effect-doctor-snapshot-"))
  );
  cpSync(fixture, workspace, { recursive: true });
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
      const toolchain = await Effect.runPromise(resolveToolchain());
      const snapshot = await runWithNode(
        makeProjectSnapshot(
          root,
          join(root, "tsconfig.json"),
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
      const toolchain = await Effect.runPromise(resolveToolchain());
      const snapshot = await runWithNode(
        makeProjectSnapshot(
          root,
          join(root, "tsconfig.json"),
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
      const toolchain = await Effect.runPromise(resolveToolchain());
      const snapshot = await runWithNode(
        makeProjectSnapshot(root, tsconfig, toolchain.tsgoExecutable)
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
      const toolchain = await Effect.runPromise(resolveToolchain());
      const snapshot = await runWithNode(
        makeProjectSnapshot(root, tsconfig, toolchain.tsgoExecutable)
      );
      writeFileSync(
        baseConfig,
        JSON.stringify({ compilerOptions: { strict: false } })
      );

      await expect(
        runWithNode(verifyProjectSnapshot(snapshot, toolchain.tsgoExecutable))
      ).rejects.toMatchObject({ _tag: "ProjectFailure" });
    }));
});
