import { execFileSync } from "node:child_process";
import { realpathSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";

const projectRoot = realpathSync(resolve(import.meta.dirname, ".."));
const outputDirectory = resolve(projectRoot, "dist");

if (
  dirname(outputDirectory) !== projectRoot ||
  basename(outputDirectory) !== "dist"
) {
  throw new Error(
    `Refusing to clean unexpected build output: ${outputDirectory}`
  );
}

rmSync(outputDirectory, { force: true, recursive: true });

const require = createRequire(import.meta.url);
const typescriptRoot = dirname(require.resolve("typescript/package.json"));
const compiler = join(typescriptRoot, "bin", "tsc");
execFileSync(process.execPath, [compiler, "-p", "tsconfig.build.json"], {
  cwd: projectRoot,
  stdio: "inherit",
});
