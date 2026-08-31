import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

type CommandResult = {
  readonly label: string;
  readonly status: number | null;
  readonly stderr: string;
  readonly stdout: string;
};

type SlopsiftReport = {
  readonly messages?: readonly unknown[];
};

const run = (
  label: string,
  command: string,
  args: readonly string[]
): CommandResult => {
  const result = spawnSync(command, args, {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    return {
      label,
      status: null,
      stderr: result.error.message,
      stdout: "",
    };
  }

  return {
    label,
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
};

const markdownFiles = (): readonly string[] => {
  const result = run("git", "git", [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    "*.md",
  ]);

  if (result.status !== 0) {
    throw new Error(result.stderr || "git could not list Markdown files");
  }

  return [...new Set(result.stdout.split("\n"))]
    .filter((path) => path.length > 0 && existsSync(path))
    .toSorted();
};

const parseJson = <T>(result: CommandResult): T | undefined => {
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    return undefined;
  }
};

const failures: CommandResult[] = [];
const files = markdownFiles();

if (files.length === 0) {
  throw new Error("no Markdown files found");
}

const vale = run("vale", "vale", ["--output=JSON", ...files]);
const report = parseJson<Record<string, readonly unknown[]>>(vale);
const findings = report
  ? Object.values(report).reduce((count, alerts) => count + alerts.length, 0)
  : -1;

if (vale.status !== 0 || findings !== 0) {
  failures.push(vale);
} else {
  console.log("vale: 0 findings");
}

const sloplint = run("sloplint", "python3", ["-m", "sloplint", ...files]);
if (sloplint.status !== 0 || sloplint.stdout.trim().length > 0) {
  failures.push(sloplint);
} else {
  console.log("sloplint: 0 findings");
}

const slopscore = run("slopscore", "python3", [
  "-m",
  "slopscore.cli",
  "scan",
  ...files,
  "--profile",
  "technical",
  "--format",
  "console",
  "--fail-on",
  "low",
]);
if (slopscore.status === 0) {
  console.log("slopscore: 0 findings");
} else {
  failures.push(slopscore);
}

const slopsift = run("slopsift", "slopsift", [
  ...files,
  "--format",
  "json",
  "--level",
  "info",
]);
const slopsiftReport = parseJson<readonly SlopsiftReport[]>(slopsift);
const slopsiftFindings = slopsiftReport
  ? slopsiftReport.reduce(
      (count, report) => count + (report.messages?.length ?? 0),
      0
    )
  : -1;

if (slopsift.status !== 0 || slopsiftFindings !== 0) {
  failures.push(slopsift);
} else {
  console.log("slopsift: 0 findings");
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`\n${failure.label} failed:`);
    console.error(
      failure.stdout.trim() || failure.stderr.trim() || "no output"
    );
  }
  process.exitCode = 1;
}
