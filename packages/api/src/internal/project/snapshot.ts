import { compareCodeUnits, sha256 } from "@effect-doctor/core";
import type { ScanTarget } from "@effect-doctor/core";
import { Data, Effect, FileSystem, Path, Predicate, Schema } from "effect";
import { PlatformError } from "effect/PlatformError";

import { ProjectFailure } from "../../errors.js";
import { runProcess } from "../analyzers/process.js";
import { projectRelativePath } from "./path.js";

export type SnapshotFile = {
  readonly absolute: string;
  readonly bomLength: number;
  readonly relative: string;
  readonly source: string;
  readonly digest: string;
};

type ResolvedEntryProject = {
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

type ProjectRecord = {
  readonly config: string;
  readonly output: string;
  readonly references: readonly string[];
  readonly source: string;
};

type ConfigPlan = {
  readonly config: string;
  readonly files: readonly string[];
  readonly output: string;
  readonly references: readonly string[];
};

type Platform = {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
};

type ProjectFailureCode = ProjectFailure["code"];

class ProjectPlanError extends Data.TaggedError("ProjectPlanError")<{
  readonly code: ProjectFailureCode;
  readonly message: string;
}> {}

const platform = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return { fs, path } satisfies Platform;
});

const isAnalyzableSource = (file: string): boolean =>
  /\.[cm]?tsx?$/u.test(file);

const BYTE_ORDER_MARK = "﻿";
const BYTE_ORDER_MARK_LENGTH = 3;
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

type SourceText = {
  readonly bomLength: number;
  readonly digest: string;
  readonly source: string;
};

const decodeSource = (bytes: Uint8Array, relative: string) =>
  Effect.try({
    catch: () =>
      new ProjectPlanError({
        code: "source-invalid",
        message: `A project source is not valid UTF-8: ${relative}`,
      }),
    try: () => utf8.decode(bytes),
  });

const readSourceText = Effect.fn("readSourceText")(function* (
  fs: FileSystem.FileSystem,
  absolute: string,
  relative: string
) {
  const decoded = yield* decodeSource(yield* fs.readFile(absolute), relative);
  const hasBom = decoded.startsWith(BYTE_ORDER_MARK);
  return {
    bomLength: hasBom ? BYTE_ORDER_MARK_LENGTH : 0,
    digest: sha256(decoded),
    source: hasBom ? decoded.slice(1) : decoded,
  } satisfies SourceText;
});

const ProjectConfigPlanSchema = Schema.Struct({
  files: Schema.optional(Schema.Array(Schema.NonEmptyString)),
  references: Schema.optional(
    Schema.Array(Schema.Struct({ path: Schema.NonEmptyString }))
  ),
});

const hasErrorCode = (
  error: Error
): error is Error & { readonly code: string } =>
  Predicate.hasProperty(error, "code") && Predicate.isString(error.code);

const pathFreeFailureDetail = (error: Error): string => {
  if (error instanceof PlatformError) {
    return ` A referenced path could not be read (${error.reason._tag}).`;
  }
  if (hasErrorCode(error)) {
    return ` A referenced path could not be read (${error.code}).`;
  }
  if (error instanceof SyntaxError) {
    return " The TypeScript compiler returned configuration output that is not valid JSON.";
  }
  if (Schema.isSchemaError(error)) {
    return " The TypeScript compiler returned configuration output with an unexpected shape.";
  }
  return "";
};

const planFailure = (
  root: string,
  error: Error,
  fallbackCode: ProjectFailureCode = "project-invalid",
  fallbackMessage = "The selected project configuration could not be analyzed."
): ProjectFailure =>
  new ProjectFailure({
    code: error instanceof ProjectPlanError ? error.code : fallbackCode,
    message:
      error instanceof ProjectPlanError
        ? error.message
        : `${fallbackMessage}${pathFreeFailureDetail(error)}`,
    root,
  });

const toError = (error: unknown, fallback: string): Error =>
  error instanceof Error ? error : new Error(fallback);

const relativeInsideRoot = (
  root: string,
  absolute: string,
  message: string
): string => {
  try {
    return projectRelativePath(root, absolute);
  } catch {
    throw new ProjectPlanError({ code: "outside-root", message });
  }
};

const requireInsideRoot = (root: string, absolute: string, message: string) =>
  Effect.try({
    catch: () => new ProjectPlanError({ code: "outside-root", message }),
    try: () => projectRelativePath(root, absolute),
  });

const selectReferenceFile = Effect.fn("selectReferenceFile")(function* (
  { fs, path }: Platform,
  candidate: string
) {
  if (!(yield* fs.exists(candidate))) {
    return undefined;
  }
  const info = yield* fs.stat(candidate);
  const selected =
    info.type === "Directory"
      ? path.join(candidate, "tsconfig.json")
      : candidate;
  if (!(yield* fs.exists(selected))) {
    return undefined;
  }
  const selectedInfo = yield* fs.stat(selected);
  return selectedInfo.type === "File" ? selected : undefined;
});

const resolveReferenceConfig = Effect.fn("resolveReferenceConfig")(function* (
  services: Platform,
  root: string,
  config: string,
  reference: string
) {
  const { fs, path } = services;
  const unresolved = path.resolve(path.dirname(config), reference);
  const candidates =
    path.extname(unresolved) === ""
      ? [unresolved, `${unresolved}.json`]
      : [unresolved];

  for (const candidate of candidates) {
    const selected = yield* selectReferenceFile(services, candidate);
    if (selected === undefined) {
      continue;
    }
    const canonical = yield* fs.realPath(selected);
    yield* requireInsideRoot(
      root,
      canonical,
      "A project reference resolves outside the project root."
    );
    return canonical;
  }

  return yield* new ProjectPlanError({
    code: "reference-invalid",
    message:
      "A referenced project configuration does not exist or cannot be resolved.",
  });
});

const sortByProjectPath = (root: string, paths: readonly string[]) =>
  [...paths].sort((left, right) =>
    compareCodeUnits(
      projectRelativePath(root, left),
      projectRelativePath(root, right)
    )
  );

const showConfig = Effect.fn("showConfig")(function* (
  services: Platform,
  root: string,
  config: string,
  plannerExecutable: string
) {
  const { path } = services;
  const result = yield* runProcess({
    arguments: ["--showConfig", "--project", config],
    cwd: path.dirname(config),
    engine: "effect-doctor",
    executable: plannerExecutable,
    timeout: "10 seconds",
  });
  if (result.exitCode !== 0) {
    return yield* new ProjectFailure({
      code: "project-invalid",
      message: `The TypeScript compiler could not read the selected project configuration (exit code ${result.exitCode}).`,
      root,
    });
  }

  const configurationFailure = (error: unknown) =>
    planFailure(root, toError(error, "Unknown project configuration failure"));
  const parsed = yield* Effect.try({
    catch: configurationFailure,
    try: (): unknown => JSON.parse(result.stdout),
  });
  const output = yield* Schema.decodeUnknownEffect(ProjectConfigPlanSchema)(
    parsed
  ).pipe(Effect.mapError(configurationFailure));
  const files = (output.files ?? []).map((file) =>
    path.resolve(path.dirname(config), file)
  );
  const references: string[] = [];
  for (const reference of output.references ?? []) {
    references.push(
      yield* resolveReferenceConfig(
        services,
        root,
        config,
        reference.path
      ).pipe(Effect.mapError(configurationFailure))
    );
  }
  return {
    config,
    files,
    output: result.stdout,
    references: sortByProjectPath(root, references),
  } satisfies ConfigPlan;
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
      throw new ProjectPlanError({
        code: "reference-cycle",
        message: "The selected project graph contains a reference cycle.",
      });
    }
    active.add(config);
    const plan = plans.get(config);
    if (plan === undefined) {
      throw new ProjectPlanError({
        code: "reference-invalid",
        message: "The selected project graph contains an unresolved reference.",
      });
    }
    for (const reference of plan.references) {
      relativeInsideRoot(
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

const requireSingleOwner = (
  owners: ReadonlyMap<string, string>,
  absolute: string,
  config: string
) => {
  const owner = owners.get(absolute);
  return owner !== undefined && owner !== config
    ? Effect.fail(
        new ProjectPlanError({
          code: "duplicate-source",
          message: "Two project configurations own the same source file.",
        })
      )
    : Effect.void;
};

const requireOnePath = (
  root: string,
  paths: ReadonlyMap<string, string>,
  absolute: string,
  discovered: string
) => {
  const known = paths.get(absolute);
  return known !== undefined && known !== discovered
    ? Effect.fail(
        new ProjectPlanError({
          code: "duplicate-source",
          message: `Two project sources are the same file: ${projectRelativePath(root, known)} and ${projectRelativePath(root, discovered)}.`,
        })
      )
    : Effect.void;
};

const collectOwners = Effect.fn("collectOwners")(function* (
  fs: FileSystem.FileSystem,
  root: string,
  plans: readonly ConfigPlan[]
) {
  const owners = new Map<string, string>();
  const paths = new Map<string, string>();
  for (const plan of plans) {
    for (const discovered of plan.files.filter(isAnalyzableSource)) {
      const absolute = yield* fs.realPath(discovered);
      yield* requireInsideRoot(
        root,
        absolute,
        "A project source resolves outside the project root."
      );
      yield* requireOnePath(root, paths, absolute, discovered);
      yield* requireSingleOwner(owners, absolute, plan.config);
      paths.set(absolute, discovered);
      owners.set(absolute, plan.config);
    }
  }
  return owners;
});

const graphFailure = (error: unknown): ProjectPlanError =>
  error instanceof ProjectPlanError
    ? error
    : new ProjectPlanError({
        code: "project-invalid",
        message: "The selected project graph could not be analyzed.",
      });

const finalizePlan = Effect.fn("finalizePlan")(function* (
  fs: FileSystem.FileSystem,
  root: string,
  plans: ReadonlyMap<string, ConfigPlan>
) {
  yield* Effect.try({
    catch: graphFailure,
    try: () => requireAcyclicGraph(root, plans),
  });
  const orderedPlans = [...plans.values()].sort((left, right) =>
    compareCodeUnits(
      projectRelativePath(root, left.config),
      projectRelativePath(root, right.config)
    )
  );
  const owners = yield* collectOwners(fs, root, orderedPlans);
  if (owners.size === 0) {
    return yield* new ProjectPlanError({
      code: "empty-project",
      message: "The selected project graph has no analyzable source files.",
    });
  }

  const projectRecords: ProjectRecord[] = [];
  for (const plan of orderedPlans) {
    projectRecords.push({
      config: projectRelativePath(root, plan.config),
      output: plan.output,
      references: plan.references.map((reference) =>
        projectRelativePath(root, reference)
      ),
      source: yield* fs.readFileString(plan.config),
    });
  }
  return {
    configurationDigest: sha256(
      JSON.stringify(
        projectRecords.map(({ config, source }) => ({ config, source }))
      )
    ),
    digest: sha256(JSON.stringify(projectRecords)),
    files: [...owners.keys()],
    projects: orderedPlans.map((plan) => plan.config),
  } satisfies ProjectFilePlan;
});

const discoverProjectFiles = Effect.fn("discoverProjectFiles")(function* (
  services: Platform,
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
    const plan = yield* showConfig(services, root, config, plannerExecutable);
    plans.set(config, plan);
    for (const reference of plan.references) {
      if (!plans.has(reference)) {
        pending.push(reference);
      }
    }
  }

  return yield* finalizePlan(services.fs, root, plans).pipe(
    Effect.mapError((error) =>
      planFailure(root, toError(error, "Unknown project graph failure"))
    )
  );
});

const makeInventory = (root: string, discoveredFiles: readonly string[]) => {
  const inventory = discoveredFiles
    .map((absolute) => ({
      absolute,
      relative: projectRelativePath(root, absolute),
    }))
    .sort((left, right) => compareCodeUnits(left.relative, right.relative));
  return new Set(inventory.map((file) => file.absolute)).size ===
    inventory.length
    ? Effect.succeed(inventory)
    : Effect.fail(
        new ProjectPlanError({
          code: "duplicate-source",
          message: "The project source inventory contains duplicate files.",
        })
      );
};

const createSnapshot = Effect.fn("createSnapshot")(function* (
  fs: FileSystem.FileSystem,
  root: string,
  entry: ResolvedEntryProject,
  plan: ProjectFilePlan
) {
  const inventory = yield* makeInventory(root, plan.files);
  const files: SnapshotFile[] = [];
  for (const { absolute, relative } of inventory) {
    const text = yield* readSourceText(fs, absolute, relative);
    files.push(
      Object.freeze({
        absolute,
        bomLength: text.bomLength,
        digest: text.digest,
        relative,
        source: text.source,
      })
    );
  }
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
  }) satisfies ProjectSnapshot;
});

export const makeProjectSnapshot = Effect.fn("makeProjectSnapshot")(function* (
  root: string,
  entry: ResolvedEntryProject,
  plannerExecutable: string
) {
  const services = yield* platform;
  const plan = yield* discoverProjectFiles(
    services,
    root,
    entry,
    plannerExecutable
  );
  return yield* createSnapshot(services.fs, root, entry, plan).pipe(
    Effect.mapError((error) =>
      planFailure(root, toError(error, "Unknown project snapshot failure"))
    )
  );
});

const projectChanged = (root: string, detail?: string): ProjectFailure =>
  new ProjectFailure({
    code: "project-changed",
    message:
      detail === undefined || detail.length === 0
        ? "The project graph changed during analysis."
        : `The project changed during analysis: ${detail}`,
    root,
  });

const changeDetail = (error: unknown): string | undefined => {
  if (error instanceof ProjectPlanError) {
    return error.message;
  }
  if (error instanceof PlatformError) {
    return `A project file could not be read (${error.reason._tag}).`;
  }
  return undefined;
};

const assertUnchangedPlan = Effect.fn("assertUnchangedPlan")(function* (
  snapshot: ProjectSnapshot,
  selectedConfig: string,
  finalPlan: ProjectFilePlan
) {
  const finalInventory = yield* makeInventory(snapshot.root, finalPlan.files);
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
    return yield* new ProjectPlanError({
      code: "project-changed",
      message: "Project configuration or inventory changed",
    });
  }
});

const assertUnchangedSources = Effect.fn("assertUnchangedSources")(function* (
  fs: FileSystem.FileSystem,
  snapshot: ProjectSnapshot
) {
  for (const file of snapshot.files) {
    const text = yield* readSourceText(fs, file.absolute, file.relative);
    if (text.digest !== file.digest) {
      return yield* new ProjectPlanError({
        code: "project-changed",
        message: `Source changed during analysis: ${file.relative}`,
      });
    }
  }
});

export const verifyProjectSnapshot = Effect.fn("verifyProjectSnapshot")(
  function* (snapshot: ProjectSnapshot, plannerExecutable: string) {
    const services = yield* platform;
    const selectedConfig = yield* services.fs
      .realPath(services.path.resolve(snapshot.root, snapshot.target.entry))
      .pipe(Effect.mapError(() => projectChanged(snapshot.root)));
    if (selectedConfig !== snapshot.tsconfig) {
      return yield* projectChanged(snapshot.root);
    }
    const finalPlan = yield* discoverProjectFiles(
      services,
      snapshot.root,
      { entry: snapshot.target.entry, tsconfig: selectedConfig },
      plannerExecutable
    ).pipe(Effect.mapError(() => projectChanged(snapshot.root)));
    yield* assertUnchangedPlan(snapshot, selectedConfig, finalPlan).pipe(
      Effect.mapError((error) =>
        projectChanged(snapshot.root, changeDetail(error))
      )
    );
    yield* assertUnchangedSources(services.fs, snapshot).pipe(
      Effect.mapError((error) =>
        projectChanged(snapshot.root, changeDetail(error))
      )
    );
  }
);
