import { readFileSync } from "node:fs";

const [resultPath] = process.argv.slice(2);

const incomplete = (message) => {
  console.error(message);
  process.exitCode = 2;
};

const readResult = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (error) {
    incomplete(
      `Effect Doctor Action result could not be read: ${error instanceof Error ? error.message : String(error)}`
    );
    return undefined;
  }
};

if (resultPath === undefined || resultPath === "") {
  incomplete("Effect Doctor Action did not produce a result");
} else {
  const result = readResult(resultPath);
  if (result === undefined || result.completed !== true) {
    process.exitCode = 2;
  } else if (result.blocked === true) {
    process.exitCode = 1;
  }
}
