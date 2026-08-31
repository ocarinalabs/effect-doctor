import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import { compareCodeUnits, sha256 } from "@effect-doctor/core";
import { Effect, Schema } from "effect";

import { ProjectFailure } from "../errors.js";
import { runProcess } from "./process.js";

export type SnapshotFile = {
  readonly absolute: string;
  readonly relative: string;
  readonly source: string;
  readonly digest: string;
};

export type ProjectSnapshot = {
  readonly configuration: {
    readonly inputDigest: string;
    readonly planDigest: string;
  };
  readonly root: string;
  readonly tsconfig: string;
  readonly files: readonly SnapshotFile[];
};

type ProjectFilePlan = {
  readonly digest: string;
  readonly files: readonly string[];
};

const isAnalyzableSource = (file: string): boolean =>
  /\.[cm]?tsx?$/u.test(file);

const ProjectFilePlanSchema = Schema.Struct({
  files: Schema.Array(Schema.NonEmptyString),
});

const projectRelativePath = (root: string, absolute: string): string => {
  const projectPath = relative(root, absolute);
  if (
    projectPath === "" ||
    projectPath === ".." ||
    projectPath.startsWith("../") ||
    projectPath.startsWith("..\\") ||
    isAbsolute(projectPath)
  ) {
    throw new Error(`Project source is outside the root: ${absolute}`);
  }
  return projectPath.replaceAll("\\", "/");
};

const discoverProjectFiles = Effect.fn("discoverProjectFiles")(function* (
  root: string,
  tsconfig: string,
  plannerExecutable: string
) {
  const result = yield* runProcess({
    arguments: ["--showConfig", "--project", tsconfig],
    cwd: root,
    engine: "effect-doctor",
    executable: plannerExecutable,
    timeout: "10 seconds",
  });
  if (result.exitCode !== 0) {
    return yield* new ProjectFailure({
      message: "Project configuration could not be analyzed.",
      root,
    });
  }

  return yield* Effect.try({
    catch: () =>
      new ProjectFailure({
        message: "Project configuration could not be analyzed.",
        root,
      }),
    try: () => {
      const plan = Schema.decodeUnknownSync(ProjectFilePlanSchema)(
        JSON.parse(result.stdout)
      );
      return {
        digest: sha256(result.stdout),
        files: plan.files.map((file) => resolve(root, file)),
      } satisfies ProjectFilePlan;
    },
  });
});

const makeInventory = (
  root: string,
  discoveredFiles: readonly string[]
): readonly { readonly absolute: string; readonly relative: string }[] => {
  const inventory = discoveredFiles
    .filter(isAnalyzableSource)
    .map((file) => realpathSync(file))
    .map((absolute) => ({
      absolute,
      relative: projectRelativePath(root, absolute),
    }))
    .sort((left, right) => compareCodeUnits(left.relative, right.relative));
  if (inventory.length === 0) {
    throw new Error(
      "Project tsconfig does not include analyzable source files"
    );
  }
  if (
    new Set(inventory.map((file) => file.absolute)).size !== inventory.length
  ) {
    throw new Error("Project source inventory contains duplicate files");
  }
  return inventory;
};

const createSnapshot = (
  root: string,
  tsconfig: string,
  plan: ProjectFilePlan
): ProjectSnapshot => {
  const inventory = makeInventory(root, plan.files);
  const files = inventory.map(({ absolute, relative: relativePath }) => {
    const source = readFileSync(absolute, "utf-8");
    return Object.freeze({
      absolute,
      digest: sha256(source),
      relative: relativePath,
      source,
    });
  });
  return Object.freeze({
    configuration: Object.freeze({
      inputDigest: sha256(readFileSync(tsconfig, "utf-8")),
      planDigest: plan.digest,
    }),
    files: Object.freeze(files),
    root,
    tsconfig,
  });
};

export const makeProjectSnapshot = Effect.fn("makeProjectSnapshot")(function* (
  root: string,
  tsconfig: string,
  plannerExecutable: string
) {
  const plan = yield* discoverProjectFiles(root, tsconfig, plannerExecutable);
  return yield* Effect.try({
    catch: () =>
      new ProjectFailure({
        message: "Project source inventory could not be created.",
        root,
      }),
    try: () => createSnapshot(root, tsconfig, plan),
  });
});

export const verifyProjectSnapshot = Effect.fn("verifyProjectSnapshot")(
  function* (snapshot: ProjectSnapshot, plannerExecutable: string) {
    const finalPlan = yield* discoverProjectFiles(
      snapshot.root,
      snapshot.tsconfig,
      plannerExecutable
    );
    return yield* Effect.try({
      catch: () =>
        new ProjectFailure({
          message: "Project changed during analysis.",
          root: snapshot.root,
        }),
      try: () => {
        const finalInventory = makeInventory(snapshot.root, finalPlan.files);
        const initialInventory = snapshot.files.map((file) => ({
          absolute: file.absolute,
          relative: file.relative,
        }));
        if (
          JSON.stringify(finalInventory) !== JSON.stringify(initialInventory) ||
          finalPlan.digest !== snapshot.configuration.planDigest ||
          sha256(readFileSync(snapshot.tsconfig, "utf-8")) !==
            snapshot.configuration.inputDigest
        ) {
          throw new Error("Project configuration or inventory changed");
        }
        for (const file of snapshot.files) {
          const current = readFileSync(file.absolute, "utf-8");
          if (sha256(current) !== file.digest) {
            throw new Error(`Source changed during analysis: ${file.relative}`);
          }
        }
      },
    });
  }
);
