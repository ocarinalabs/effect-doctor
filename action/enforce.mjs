import { readFileSync } from "node:fs";

const [resultPath] = process.argv.slice(2);
if (resultPath === undefined) {
  console.error("Effect Doctor Action did not produce a result");
  process.exitCode = 2;
} else {
  const result = JSON.parse(readFileSync(resultPath, "utf-8"));
  if (!result.completed) {
    process.exitCode = 2;
  } else if (result.blocked) {
    process.exitCode = 1;
  }
}
