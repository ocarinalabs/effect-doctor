import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { PINNED_TOOLCHAIN } from "@effect-doctor/core";
import { Data, Effect, FileSystem, Path, Schema, Struct } from "effect";

import { AnalyzerFailure } from "../../errors.js";

export type ToolchainVersions = {
  readonly effect: string;
  readonly oxlint: string;
  readonly oxlintPlugins: string;
  readonly tsgo: string;
  readonly tsgoPlatform: string;
  readonly typescript: string;
};

type Platform = {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
};

export type ToolchainPaths = {
  readonly tsgoExecutable: string;
  readonly tsgoMode: "native";
  readonly oxlintCli: string;
  readonly doctorPlugin: string;
  readonly versions: ToolchainVersions;
};

class ToolchainError extends Data.TaggedError("ToolchainError")<{
  readonly message: string;
}> {}

const toolchainError = (message: string) => new ToolchainError({ message });

const isFile = (fs: FileSystem.FileSystem, path: string) =>
  fs.stat(path).pipe(
    Effect.map((info) => info.type === "File"),
    Effect.orElseSucceed(() => false)
  );

const resolveDoctorPlugin = Effect.fn("resolveDoctorPlugin")(function* (
  fs: FileSystem.FileSystem
) {
  if (import.meta.url.endsWith(".ts")) {
    return fileURLToPath(
      new URL("../analyzers/doctor-plugin.ts", import.meta.url)
    );
  }

  const candidates = [
    new URL("internal/doctor-plugin.js", import.meta.url),
    new URL("../internal/doctor-plugin.js", import.meta.url),
    new URL("doctor-plugin.js", import.meta.url),
  ].map((candidate) => fileURLToPath(candidate));
  for (const candidate of candidates) {
    if (yield* isFile(fs, candidate)) {
      return candidate;
    }
  }
  return yield* toolchainError(
    "The packaged Effect Doctor Oxlint plugin is missing"
  );
});

const PackageMetadataSchema = Schema.Struct({
  gitHead: Schema.optional(Schema.NonEmptyString),
  name: Schema.NonEmptyString,
  version: Schema.NonEmptyString,
});
type PackageMetadata = typeof PackageMetadataSchema.Type;

const TypeScriptComponentSchema = Schema.Struct({
  gitHead: Schema.NonEmptyString,
});

const UpstreamMetadataSchema = Schema.Struct({
  components: Schema.Struct({
    typescript: Schema.Record(Schema.String, TypeScriptComponentSchema),
  }),
  schemaVersion: Schema.Literals([4, 5]),
  tags: Schema.optional(
    Schema.Struct({
      typescript: Schema.optional(
        Schema.Struct({ latest: Schema.NonEmptyString })
      ),
    })
  ),
});
type UpstreamMetadata = typeof UpstreamMetadataSchema.Type;

const require = createRequire(import.meta.url);

const validateToolchainVersions = (installed: ToolchainVersions) => {
  for (const key of Struct.keys(PINNED_TOOLCHAIN)) {
    if (installed[key] !== PINNED_TOOLCHAIN[key]) {
      return Effect.fail(
        toolchainError(`Bundled analyzer version mismatch for ${key}`)
      );
    }
  }
  return Effect.succeed(Object.freeze({ ...installed }));
};

const readJsonFile = Effect.fn("readJsonFile")(function* (
  fs: FileSystem.FileSystem,
  path: string
) {
  const text = yield* fs.readFileString(path);
  return yield* Effect.try({
    catch: () => toolchainError(`Metadata is not valid JSON: ${path}`),
    try: (): unknown => JSON.parse(text),
  });
});

const decodeMetadata = <T>(
  schema: Schema.ConstraintDecoder<T>,
  path: string,
  value: unknown
) =>
  Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError(() =>
      toolchainError(`Metadata has an unexpected shape: ${path}`)
    )
  );

const readPackageMetadata = Effect.fn("readPackageMetadata")(function* (
  fs: FileSystem.FileSystem,
  path: string
) {
  const value = yield* readJsonFile(fs, path);
  return yield* decodeMetadata(PackageMetadataSchema, path, value);
});

const readUpstreamMetadata = Effect.fn("readUpstreamMetadata")(function* (
  fs: FileSystem.FileSystem,
  path: string
) {
  const value = yield* readJsonFile(fs, path);
  return yield* decodeMetadata(UpstreamMetadataSchema, path, value);
});

const requireExecutableInside = Effect.fn("requireExecutableInside")(function* (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  packageRoot: string,
  candidate: string
) {
  const executable = yield* fs.realPath(candidate);
  const relativePath = path.relative(packageRoot, executable);
  if (
    relativePath === "" ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return yield* toolchainError(
      `Native compiler escapes its platform package: ${candidate}`
    );
  }
  const info = yield* fs.stat(executable);
  if (info.type !== "File") {
    return yield* toolchainError(
      `Native compiler is not a regular file: ${candidate}`
    );
  }
  return executable;
});

const requireTypeScriptGitHead = (typescriptPackage: PackageMetadata) =>
  typescriptPackage.gitHead === undefined
    ? Effect.fail(
        toolchainError(
          "Installed TypeScript package is missing gitHead metadata"
        )
      )
    : Effect.succeed(typescriptPackage.gitHead);

const requireMatchingPlatformVersion = (
  platformPackageName: string,
  platformPackage: PackageMetadata,
  tsgoPackage: PackageMetadata
) =>
  platformPackage.version === tsgoPackage.version
    ? Effect.void
    : Effect.fail(
        toolchainError(
          `${platformPackageName} ${platformPackage.version} does not match @effect/tsgo ${tsgoPackage.version}`
        )
      );

const requireMatchingComponent = (
  upstream: UpstreamMetadata,
  typescriptVersion: string,
  typescriptGitHead: string
) => {
  const component = upstream.components.typescript[typescriptVersion];
  return component === undefined || component.gitHead !== typescriptGitHead
    ? Effect.fail(
        toolchainError(
          `No packaged Effect TypeScript compiler matches TypeScript ${typescriptVersion} (${typescriptGitHead})`
        )
      )
    : Effect.void;
};

const compilerExecutableName = (): string =>
  process.platform === "win32" ? "tsc.exe" : "tsc";

const resolveCompilerLayout = (
  { fs, path }: Platform,
  platformRoot: string,
  upstream: UpstreamMetadata,
  typescriptVersion: string
) => {
  const executableName = compilerExecutableName();
  const artifact = path.join(
    platformRoot,
    "artifacts",
    "typescript",
    typescriptVersion,
    executableName
  );
  const hasLibraryLayout =
    upstream.schemaVersion === 5 &&
    upstream.tags?.typescript?.latest === typescriptVersion;
  return requireExecutableInside(fs, path, platformRoot, artifact).pipe(
    Effect.catchIf(
      () => hasLibraryLayout,
      () =>
        requireExecutableInside(
          fs,
          path,
          platformRoot,
          path.join(platformRoot, "lib", executableName)
        )
    )
  );
};

type NativeTsgo = {
  readonly executable: string;
  readonly platformVersion: string;
  readonly tsgoVersion: string;
  readonly typescriptVersion: string;
};

const resolveNativeTsgo = Effect.fn("resolveNativeTsgo")(function* (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  tsgoPackagePath: string
) {
  const requireFromTsgo = createRequire(tsgoPackagePath);
  const tsgoPackage = yield* readPackageMetadata(fs, tsgoPackagePath);
  const typescriptPackagePath = require.resolve("typescript/package.json");
  const typescriptPackage = yield* readPackageMetadata(
    fs,
    typescriptPackagePath
  );
  const typescriptGitHead = yield* requireTypeScriptGitHead(typescriptPackage);

  const platformPackageName = `@effect/tsgo-${process.platform}-${process.arch}`;
  const platformPackagePath = requireFromTsgo.resolve(
    `${platformPackageName}/package.json`
  );
  const platformPackage = yield* readPackageMetadata(fs, platformPackagePath);
  yield* requireMatchingPlatformVersion(
    platformPackageName,
    platformPackage,
    tsgoPackage
  );

  const platformRoot = path.dirname(platformPackagePath);
  const upstream = yield* readUpstreamMetadata(
    fs,
    path.join(platformRoot, "lib", "upstream.json")
  );
  yield* requireMatchingComponent(
    upstream,
    typescriptPackage.version,
    typescriptGitHead
  );
  const executable = yield* resolveCompilerLayout(
    { fs, path },
    platformRoot,
    upstream,
    typescriptPackage.version
  );
  return {
    executable,
    platformVersion: platformPackage.version,
    tsgoVersion: tsgoPackage.version,
    typescriptVersion: typescriptPackage.version,
  } satisfies NativeTsgo;
});

const resolvePaths = Effect.fn("resolvePaths")(function* (
  fs: FileSystem.FileSystem,
  path: Path.Path
) {
  const tsgoPackage = require.resolve("@effect/tsgo/package.json");
  const oxlintPackage = require.resolve("oxlint/package.json");
  const nativeTsgo = yield* resolveNativeTsgo(fs, path, tsgoPackage);
  const oxlintPluginsPackage = path.join(
    path.dirname(require.resolve("@oxlint/plugins")),
    "package.json"
  );
  const effectPackage = yield* readPackageMetadata(
    fs,
    require.resolve("effect/package.json")
  );
  const oxlint = yield* readPackageMetadata(fs, oxlintPackage);
  const oxlintPlugins = yield* readPackageMetadata(fs, oxlintPluginsPackage);
  const versions = yield* validateToolchainVersions({
    effect: effectPackage.version,
    oxlint: oxlint.version,
    oxlintPlugins: oxlintPlugins.version,
    tsgo: nativeTsgo.tsgoVersion,
    tsgoPlatform: nativeTsgo.platformVersion,
    typescript: nativeTsgo.typescriptVersion,
  });
  const doctorPlugin = yield* resolveDoctorPlugin(fs);
  return {
    doctorPlugin,
    oxlintCli: path.join(path.dirname(oxlintPackage), "bin", "oxlint"),
    tsgoExecutable: nativeTsgo.executable,
    tsgoMode: "native",
    versions,
  } satisfies ToolchainPaths;
});

const PATH_SEPARATOR = /[\\/]/u;

const toolchainDetail = (message: string): string =>
  PATH_SEPARATOR.test(message) ? "" : ` ${message}`;

export const resolveToolchain = Effect.fn("resolveToolchain")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* resolvePaths(fs, path).pipe(
    Effect.mapError(
      (error) =>
        new AnalyzerFailure({
          engine: "effect-doctor",
          message: `Bundled analyzer toolchain could not be validated.${toolchainDetail(error.message)}`,
          exitCode: null,
          reason: "toolchain",
          stderr: "",
        })
    )
  );
});
