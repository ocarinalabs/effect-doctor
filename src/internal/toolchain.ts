import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect } from "effect";

import { AnalyzerFailure } from "../errors.js";

export type ToolchainPaths = {
  readonly packageRoot: string;
  readonly tsgoCli: string;
  readonly oxlintCli: string;
  readonly effectPlugin: string;
};

const require = createRequire(import.meta.url);

const resolvePaths = (): ToolchainPaths => {
  const tsgoPackage = require.resolve("@effect/tsgo/package.json");
  const oxlintPackage = require.resolve("oxlint/package.json");

  return {
    effectPlugin: fileURLToPath(
      import.meta.resolve("oxlint-plugin-effect/plugin")
    ),
    oxlintCli: join(dirname(oxlintPackage), "bin", "oxlint"),
    packageRoot: fileURLToPath(new URL("../../", import.meta.url)),
    tsgoCli: join(dirname(tsgoPackage), "dist", "effect-tsgo.cjs"),
  };
};

export const resolveToolchain = Effect.fn("resolveToolchain")(function* () {
  return yield* Effect.try({
    catch: (cause) =>
      new AnalyzerFailure({
        engine: "effect-doctor",
        message: `Unable to resolve the bundled analyzer toolchain: ${String(cause)}`,
        exitCode: null,
        stderr: "",
      }),
    try: resolvePaths,
  });
});
