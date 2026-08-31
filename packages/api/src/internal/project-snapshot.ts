import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

import { compareCodeUnits, sha256 } from "@effect-doctor/core";
import type { ScanTarget } from "@effect-doctor/core";
import { Effect, Schema } from "effect";

import { ProjectFailure } from "../errors.js";
import { runProcess } from "./process.js";
import { projectRelativePath } from "./project-path.js";

export type SnapshotFile = {
  readonly absolute: string;
  readonly relative: string;
  readonly source: string;
  readonly digest: string;
};

export type ResolvedEntryProject = {
  readonly entry: string;
  readonly tsconfig: string;
};

export type ProjectSnapshot = {
  readonly configuration: {
    readonly inputDigest: string;
    readonly planDigest: string;
  };
  readonly root: string;
  readonly target: ScanTarget;
  readonly tsconfig: string;
  readonly files: readonly SnapshotFile[];
};

type ProjectFilePlan = {
  readonly configurationDigest: string;
  readonly digest: string;
  readonly files: readonly string[];
  readonly projects: readonly string[];
};

type ConfigPlan = {
  readonly config: string;
  readonly files: readonly string[];
  readonly output: string;
  readonly references: readonly string[];
};

type ProjectFailureCode = ProjectFailure["code"];

class ProjectPlanError extends Error {
  readonly code: ProjectFailureCode;

  constructor(code: ProjectFailureCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ProjectPlanError";
  }
}

const isAnalyzableSource = (file: string): boolean =>
  /\.[cm]?tsx?$/u.test(file);

const ProjectConfigPlanSchema = Schema.Struct({
  files: Schema.optional(Schema.Array(Schema.NonEmptyString)),
  references: Schema.optional(
    Schema.Array(Schema.Struct({ path: Schema.NonEmptyString }))
  ),
});

const planFailure = (
  root: string,
  error: Error,
  fallbackCode: ProjectFailureCode = "project-invalid",
  fallbackMessage = "The selected project configuration could not be analyzed."
): ProjectFailure =>
  new ProjectFailure({
    code: error instanceof ProjectPlanError ? error.code : fallbackCode,
    message:
      error instanceof ProjectPlanError ? error.message : fallbackMessage,
    root,
  });

const requireInsideRoot = (
  root: string,
  absolute: string,
  message: string
): string => {
  try {
    return projectRelativePath(root, absolute);
  } catch {
    throw new ProjectPlanError("outside-root", message);
  }
};

const resolveReferenceConfig = (
  root: string,
  config: string,
  reference: string
): string => {
  const unresolved = resolve(dirname(config), reference);
  const candidates = [unresolved];
  if (extname(unresolved) === "") {
    candidates.push(`${unresolved}.json`);
  }

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }
    const selected = statSync(candidate).isDirectory()
      ? join(candidate, "tsconfig.json")
      : candidate;
    if (!(existsSync(selected) && statSync(selected).isFile())) {
      continue;
    }
    const canonical = realpathSync(selected);
    requireInsideRoot(
      root,
      canonical,
      "A project reference resolves outside the project root."
    );
    return canonical;
  }

  throw new ProjectPlanError(
    "reference-invalid",
    "A referenced project configuration does not exist or cannot be resolved."
  );
};

const showConfig = Effect.fn("showConfig")(function* (
  root: string,
  config: string,
  plannerExecutable: string
) {
  const result = yield* runProcess({
    arguments: ["--showConfig", "--project", config],
    cwd: dirname(config),
    engine: "effect-doctor",
    executable: plannerExecutable,
    timeout: "10 seconds",
  });
  if (result.exitCode !== 0) {
    return yield* new ProjectFailure({
      code: "project-invalid",
      message: "The selected project configuration could not be analyzed.",
      root,
    });
  }

  return yield* Effect.try({
    catch: (error) =>
      planFailure(
        root,
        error instanceof Error
          ? error
          : new Error("Unknown project configuration failure")
      ),
    try: () => {
      const output = Schema.decodeUnknownSync(ProjectConfigPlanSchema)(
        JSON.parse(result.stdout)
      );
      const files = (output.files ?? []).map((file) =>
        resolve(dirname(config), file)
      );
      const references = (output.references ?? [])
        .map(({ path }) => resolveReferenceConfig(root, config, path))
        .sort((left, right) =>
          compareCodeUnits(
            projectRelativePath(root, left),
            projectRelativePath(root, right)
          )
        );
      return {
        config,
        files,
        output: result.stdout,
        references,
      } satisfies ConfigPlan;
    },
  });
});

const requireAcyclicGraph = (
  root: string,
  plans: ReadonlyMap<string, ConfigPlan>
): void => {
  const active = new Set<string>();
  const complete = new Set<string>();

  const visit = (config: string): void => {
    if (complete.has(config)) {
      return;
    }
    if (active.has(config)) {
      throw new ProjectPlanError(
        "reference-cycle",
        "The selected project graph contains a reference cycle."
      );
    }
    active.add(config);
    const plan = plans.get(config);
    if (plan === undefined) {
      throw new ProjectPlanError(
        "reference-invalid",
        "The selected project graph contains an unresolved reference."
      );
    }
    for (const reference of plan.references) {
      requireInsideRoot(
        root,
        reference,
        "A project reference resolves outside the project root."
      );
      visit(reference);
    }
    active.delete(config);
    complete.add(config);
  };

  for (const config of plans.keys()) {
    visit(config);
  }
};

const finalizePlan = (
  root: string,
  plans: ReadonlyMap<string, ConfigPlan>
): ProjectFilePlan => {
  requireAcyclicGraph(root, plans);
  const orderedPlans = [...plans.values()].sort((left, right) =>
    compareCodeUnits(
      projectRelativePath(root, left.config),
      projectRelativePath(root, right.config)
    )
  );
  const owners = new Map<string, string>();
  for (const plan of orderedPlans) {
    for (const discovered of plan.files.filter(isAnalyzableSource)) {
      const absolute = realpathSync(discovered);
      requireInsideRoot(
        root,
        absolute,
        "A project source resolves outside the project root."
      );
      const owner = owners.get(absolute);
      if (owner !== undefined && owner !== plan.config) {
        throw new ProjectPlanError(
          "duplicate-source",
          "Two project configurations own the same source file."
        );
      }
      owners.set(absolute, plan.config);
    }
  }
  if (owners.size === 0) {
    throw new ProjectPlanError(
      "empty-project",
      "The selected project graph has no analyzable source files."
    );
  }

  const projectRecords = orderedPlans.map((plan) => ({
    config: projectRelativePath(root, plan.config),
    output: plan.output,
    references: plan.references.map((reference) =>
      projectRelativePath(root, reference)
    ),
    source: readFileSync(plan.config, "utf-8"),
  }));
  return {
    configurationDigest: sha256(
      JSON.stringify(
        projectRecords.map(({ config, source }) => ({ config, source }))
      )
    ),
    digest: sha256(JSON.stringify(projectRecords)),
    files: [...owners.keys()],
    projects: orderedPlans.map((plan) => plan.config),
  };
};

const discoverProjectFiles = Effect.fn("discoverProjectFiles")(function* (
  root: string,
  entry: ResolvedEntryProject,
  plannerExecutable: string
) {
  const pending = [entry.tsconfig];
  const plans = new Map<string, ConfigPlan>();
  while (pending.length > 0) {
    const config = pending.shift();
    if (config === undefined || plans.has(config)) {
      continue;
    }
    const plan = yield* showConfig(root, config, plannerExecutable);
    plans.set(config, plan);
    for (const reference of plan.references) {
      if (!plans.has(reference)) {
        pending.push(reference);
      }
    }
  }

  return yield* Effect.try({
    catch: (error) =>
      planFailure(
        root,
        error instanceof Error
          ? error
          : new Error("Unknown project graph failure")
      ),
    try: () => finalizePlan(root, plans),
  });
});

const makeInventory = (
  root: string,
  discoveredFiles: readonly string[]
): readonly { readonly absolute: string; readonly relative: string }[] => {
  const inventory = discoveredFiles
    .map((absolute) => ({
      absolute,
      relative: projectRelativePath(root, absolute),
    }))
    .sort((left, right) => compareCodeUnits(left.relative, right.relative));
  if (
    new Set(inventory.map((file) => file.absolute)).size !== inventory.length
  ) {
    throw new ProjectPlanError(
      "duplicate-source",
      "The project source inventory contains duplicate files."
    );
  }
  return inventory;
};

const createSnapshot = (
  root: string,
  entry: ResolvedEntryProject,
  plan: ProjectFilePlan
): ProjectSnapshot => {
  const inventory = makeInventory(root, plan.files);
  const files = inventory.map(({ absolute, relative }) => {
    const source = readFileSync(absolute, "utf-8");
    return Object.freeze({
      absolute,
      digest: sha256(source),
      relative,
      source,
    });
  });
  return Object.freeze({
    configuration: Object.freeze({
      inputDigest: plan.configurationDigest,
      planDigest: plan.digest,
    }),
    files: Object.freeze(files),
    root,
    target: Object.freeze({
      entry: entry.entry,
      projects: Object.freeze(
        plan.projects
          .map((config) =>
            config === entry.tsconfig
              ? entry.entry
              : projectRelativePath(root, config)
          )
          .sort(compareCodeUnits)
      ),
    }),
    tsconfig: entry.tsconfig,
  });
};

export const makeProjectSnapshot = Effect.fn("makeProjectSnapshot")(function* (
  root: string,
  entry: ResolvedEntryProject,
  plannerExecutable: string
) {
  const plan = yield* discoverProjectFiles(root, entry, plannerExecutable);
  return yield* Effect.try({
    catch: (error) =>
      planFailure(
        root,
        error instanceof Error
          ? error
          : new Error("Unknown project snapshot failure")
      ),
    try: () => createSnapshot(root, entry, plan),
  });
});

export const verifyProjectSnapshot = Effect.fn("verifyProjectSnapshot")(
  function* (snapshot: ProjectSnapshot, plannerExecutable: string) {
    const selectedConfig = yield* Effect.try({
      catch: () =>
        new ProjectFailure({
          code: "project-changed",
          message: "The project graph changed during analysis.",
          root: snapshot.root,
        }),
      try: () => realpathSync(resolve(snapshot.root, snapshot.target.entry)),
    });
    if (selectedConfig !== snapshot.tsconfig) {
      return yield* new ProjectFailure({
        code: "project-changed",
        message: "The project graph changed during analysis.",
        root: snapshot.root,
      });
    }
    const finalPlan = yield* discoverProjectFiles(
      snapshot.root,
      { entry: snapshot.target.entry, tsconfig: selectedConfig },
      plannerExecutable
    ).pipe(
      Effect.mapError(
        () =>
          new ProjectFailure({
            code: "project-changed",
            message: "The project graph changed during analysis.",
            root: snapshot.root,
          })
      )
    );
    return yield* Effect.try({
      catch: () =>
        new ProjectFailure({
          code: "project-changed",
          message: "The project graph changed during analysis.",
          root: snapshot.root,
        }),
      try: () => {
        const finalInventory = makeInventory(snapshot.root, finalPlan.files);
        const initialInventory = snapshot.files.map((file) => ({
          absolute: file.absolute,
          relative: file.relative,
        }));
        const finalProjects = finalPlan.projects
          .map((config) =>
            config === selectedConfig
              ? snapshot.target.entry
              : projectRelativePath(snapshot.root, config)
          )
          .sort(compareCodeUnits);
        if (
          JSON.stringify(finalInventory) !== JSON.stringify(initialInventory) ||
          JSON.stringify(finalProjects) !==
            JSON.stringify(snapshot.target.projects) ||
          finalPlan.digest !== snapshot.configuration.planDigest ||
          finalPlan.configurationDigest !== snapshot.configuration.inputDigest
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
