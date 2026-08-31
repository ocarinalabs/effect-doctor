import {
  accessSync,
  constants,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { PINNED_TOOLCHAIN } from "@effect-doctor/core";
import { Effect, Schema } from "effect";

import { AnalyzerFailure } from "../errors.js";

export type ToolchainVersions = {
  readonly effect: string;
  readonly effectOxlint: string;
  readonly oxlint: string;
  readonly oxlintPlugins: string;
  readonly tsgo: string;
  readonly tsgoPlatform: string;
  readonly typescript: string;
};

export type ToolchainPaths = {
  readonly tsgoExecutable: string;
  readonly tsgoMode: "native";
  readonly oxlintCli: string;
  readonly effectPlugin: string;
  readonly doctorPlugin: string;
  readonly versions: ToolchainVersions;
};

const resolveDoctorPlugin = (): string => {
  if (import.meta.url.endsWith(".ts")) {
    return fileURLToPath(new URL("doctor-plugin.ts", import.meta.url));
  }

  const candidates = [
    new URL("internal/doctor-plugin.js", import.meta.url),
    new URL("../internal/doctor-plugin.js", import.meta.url),
    new URL("doctor-plugin.js", import.meta.url),
  ];
  for (const candidate of candidates) {
    const path = fileURLToPath(candidate);
    try {
      if (statSync(path).isFile()) {
        return path;
      }
    } catch {
      continue;
    }
  }
  throw new Error("The packaged Effect Doctor Oxlint plugin is missing");
};

const PackageMetadataSchema = Schema.Struct({
  gitHead: Schema.optional(Schema.NonEmptyString),
  name: Schema.NonEmptyString,
  version: Schema.NonEmptyString,
});

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

const require = createRequire(import.meta.url);

const validateToolchainVersions = (
  installed: ToolchainVersions
): ToolchainVersions => {
  for (const key of Object.keys(
    PINNED_TOOLCHAIN
  ) as readonly (keyof ToolchainVersions)[]) {
    if (installed[key] !== PINNED_TOOLCHAIN[key]) {
      throw new Error(`Bundled analyzer version mismatch for ${key}`);
    }
  }
  return Object.freeze({ ...installed });
};

const readJson = <S extends Schema.ConstraintDecoder<unknown>>(
  path: string,
  schema: S
): S["Type"] =>
  Schema.decodeUnknownSync(schema)(JSON.parse(readFileSync(path, "utf-8")));

const requireExecutableInside = (
  packageRoot: string,
  candidate: string
): string => {
  const executable = realpathSync(candidate);
  const relativePath = relative(packageRoot, executable);
  if (
    relativePath === "" ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(
      `Native compiler escapes its platform package: ${candidate}`
    );
  }
  if (!statSync(executable).isFile()) {
    throw new Error(`Native compiler is not a regular file: ${candidate}`);
  }
  accessSync(executable, constants.X_OK);
  return executable;
};

const requireTypeScriptGitHead = (
  typescriptPackage: typeof PackageMetadataSchema.Type
): string => {
  if (typescriptPackage.gitHead === undefined) {
    throw new Error("Installed TypeScript package is missing gitHead metadata");
  }
  return typescriptPackage.gitHead;
};

const requireMatchingPlatformVersion = (
  platformPackageName: string,
  platformPackage: typeof PackageMetadataSchema.Type,
  tsgoPackage: typeof PackageMetadataSchema.Type
): void => {
  if (platformPackage.version !== tsgoPackage.version) {
    throw new Error(
      `${platformPackageName} ${platformPackage.version} does not match @effect/tsgo ${tsgoPackage.version}`
    );
  }
};

const requireMatchingComponent = (
  upstream: typeof UpstreamMetadataSchema.Type,
  typescriptVersion: string,
  typescriptGitHead: string
): void => {
  const component = upstream.components.typescript[typescriptVersion];
  if (component === undefined || component.gitHead !== typescriptGitHead) {
    throw new Error(
      `No packaged Effect TypeScript compiler matches TypeScript ${typescriptVersion} (${typescriptGitHead})`
    );
  }
};

const compilerExecutableName = (): string =>
  process.platform === "win32" ? "tsc.exe" : "tsc";

const resolveCompilerLayout = (
  platformRoot: string,
  upstream: typeof UpstreamMetadataSchema.Type,
  typescriptVersion: string
): string => {
  const executableName = compilerExecutableName();
  const artifact = join(
    platformRoot,
    "artifacts",
    "typescript",
    typescriptVersion,
    executableName
  );
  try {
    return requireExecutableInside(platformRoot, artifact);
  } catch (error) {
    if (
      upstream.schemaVersion !== 5 ||
      upstream.tags?.typescript?.latest !== typescriptVersion
    ) {
      throw error;
    }
    return requireExecutableInside(
      platformRoot,
      join(platformRoot, "lib", executableName)
    );
  }
};

const resolveNativeTsgo = (
  tsgoPackagePath: string
): {
  readonly executable: string;
  readonly platformVersion: string;
  readonly tsgoVersion: string;
  readonly typescriptVersion: string;
} => {
  const requireFromTsgo = createRequire(tsgoPackagePath);
  const tsgoPackage = readJson(tsgoPackagePath, PackageMetadataSchema);
  const typescriptPackagePath = require.resolve("typescript/package.json");
  const typescriptPackage = readJson(
    typescriptPackagePath,
    PackageMetadataSchema
  );
  const typescriptGitHead = requireTypeScriptGitHead(typescriptPackage);

  const platformPackageName = `@effect/tsgo-${process.platform}-${process.arch}`;
  const platformPackagePath = requireFromTsgo.resolve(
    `${platformPackageName}/package.json`
  );
  const platformPackage = readJson(platformPackagePath, PackageMetadataSchema);
  requireMatchingPlatformVersion(
    platformPackageName,
    platformPackage,
    tsgoPackage
  );

  const platformRoot = dirname(platformPackagePath);
  const upstream = readJson(
    join(platformRoot, "lib", "upstream.json"),
    UpstreamMetadataSchema
  );
  requireMatchingComponent(
    upstream,
    typescriptPackage.version,
    typescriptGitHead
  );
  return {
    executable: resolveCompilerLayout(
      platformRoot,
      upstream,
      typescriptPackage.version
    ),
    platformVersion: platformPackage.version,
    tsgoVersion: tsgoPackage.version,
    typescriptVersion: typescriptPackage.version,
  };
};

const resolvePaths = (): ToolchainPaths => {
  const tsgoPackage = require.resolve("@effect/tsgo/package.json");
  const oxlintPackage = require.resolve("oxlint/package.json");
  const effectPlugin = fileURLToPath(
    import.meta.resolve("oxlint-plugin-effect/plugin")
  );
  const nativeTsgo = resolveNativeTsgo(tsgoPackage);
  const effectOxlintPackage = join(
    dirname(dirname(effectPlugin)),
    "package.json"
  );
  const oxlintPluginsPackage = join(
    dirname(require.resolve("@oxlint/plugins")),
    "package.json"
  );
  const versions = validateToolchainVersions({
    effect: readJson(
      require.resolve("effect/package.json"),
      PackageMetadataSchema
    ).version,
    effectOxlint: readJson(effectOxlintPackage, PackageMetadataSchema).version,
    oxlint: readJson(oxlintPackage, PackageMetadataSchema).version,
    oxlintPlugins: readJson(oxlintPluginsPackage, PackageMetadataSchema)
      .version,
    tsgo: nativeTsgo.tsgoVersion,
    tsgoPlatform: nativeTsgo.platformVersion,
    typescript: nativeTsgo.typescriptVersion,
  });
  return {
    doctorPlugin: resolveDoctorPlugin(),
    effectPlugin,
    oxlintCli: join(dirname(oxlintPackage), "bin", "oxlint"),
    tsgoExecutable: nativeTsgo.executable,
    tsgoMode: "native",
    versions,
  };
};

export const resolveToolchain = Effect.fn("resolveToolchain")(function* () {
  return yield* Effect.try({
    catch: () =>
      new AnalyzerFailure({
        engine: "effect-doctor",
        message: "Bundled analyzer toolchain could not be validated.",
        exitCode: null,
        reason: "toolchain",
        stderr: "",
      }),
    try: resolvePaths,
  });
});
