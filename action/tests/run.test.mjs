import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const action = fileURLToPath(new URL("../run.mjs", import.meta.url));
const fakeDoctor = fileURLToPath(
  new URL("fixtures/fake-doctor", import.meta.url)
);

const git = (root, ...args) =>
  execFileSync("git", ["-C", root, ...args], { encoding: "utf-8" }).trim();

const makeRepository = ({
  baselineHasProject,
  directory = ".",
  project = "configs/effect.json",
  symlinkTarget,
}) => {
  const holder = mkdtempSync(join(tmpdir(), "effect-doctor-action-run-"));
  const repository = join(holder, "repository");
  const runnerTemp = join(holder, "runner");
  const projectRoot = join(repository, directory);
  const projectPath = join(projectRoot, project);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(join(projectPath, ".."), { recursive: true });
  mkdirSync(runnerTemp, { recursive: true });
  writeFileSync(join(projectRoot, "src", "main.ts"), "export const n = 1;\n");
  if (baselineHasProject) {
    if (symlinkTarget === undefined) {
      writeFileSync(projectPath, "{}\n");
    } else {
      writeFileSync(join(projectRoot, symlinkTarget), "{}\n");
      symlinkSync(symlinkTarget, projectPath);
    }
  }
  git(repository, "init", "--quiet");
  git(repository, "config", "user.email", "action@example.com");
  git(repository, "config", "user.name", "Effect Doctor Action");
  git(repository, "add", ".");
  git(repository, "commit", "--quiet", "-m", "base");
  const baseSha = git(repository, "rev-parse", "HEAD");

  if (!baselineHasProject) {
    writeFileSync(projectPath, "{}\n");
  }
  writeFileSync(join(projectRoot, "src", "main.ts"), "export const n = 2;\n");
  git(repository, "add", ".");
  git(repository, "commit", "--quiet", "-m", "candidate");

  return {
    baseSha,
    holder,
    repository: realpathSync(repository),
    runnerTemp: realpathSync(runnerTemp),
  };
};

const readResultPath = (outputFile) => {
  const line = readFileSync(outputFile, "utf-8")
    .split("\n")
    .find((candidate) => candidate.startsWith("result-file="));
  assert.notEqual(line, undefined);
  return line.slice("result-file=".length);
};

const optionValue = (arguments_, flag) => {
  const inline = arguments_.find((argument) => argument.startsWith(`${flag}=`));
  if (inline !== undefined) {
    return inline.slice(flag.length + 1);
  }
  const index = arguments_.indexOf(flag);
  return index === -1 ? undefined : arguments_[index + 1];
};

const runAction = ({
  baselineHasProject,
  directory = ".",
  fail = false,
  project = "configs/effect.json",
  projectInput = "configs/./effect.json",
  symlinkTarget,
}) => {
  const repositoryState = makeRepository({
    baselineHasProject,
    directory,
    project,
    symlinkTarget,
  });
  const { baseSha, holder, repository, runnerTemp } = repositoryState;
  const outputFile = join(holder, "output.txt");
  const summaryFile = join(holder, "summary.md");
  const traceFile = join(holder, "doctor-args.jsonl");
  writeFileSync(outputFile, "");
  writeFileSync(summaryFile, "");
  writeFileSync(traceFile, "");

  const execution = spawnSync(process.execPath, [action], {
    cwd: repository,
    encoding: "utf-8",
    env: {
      ...process.env,
      EFFECT_DOCTOR_TEST_FAIL: fail ? "1" : "0",
      EFFECT_DOCTOR_TEST_TRACE: traceFile,
      GITHUB_BASE_SHA: baseSha,
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_OUTPUT: outputFile,
      GITHUB_STEP_SUMMARY: summaryFile,
      GITHUB_WORKSPACE: repository,
      INPUT_BLOCKING: "none",
      INPUT_DIRECTORY: directory,
      INPUT_PROJECT: projectInput,
      INPUT_REVIEW_COMMENTS: "false",
      INPUT_SCOPE: "changed",
      INPUT_VERSION: `file:${fakeDoctor}`,
      RUNNER_TEMP: runnerTemp,
    },
  });
  assert.equal(
    execution.status,
    0,
    [execution.stdout, execution.stderr].filter(Boolean).join("\n")
  );
  const result = JSON.parse(readFileSync(readResultPath(outputFile), "utf-8"));
  const invocations = readFileSync(traceFile, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return {
    cleanup: () => rmSync(holder, { force: true, recursive: true }),
    invocations,
    repository,
    result,
    summary: readFileSync(summaryFile, "utf-8"),
  };
};

test("the selected project is shared by baseline and candidate scans", () => {
  const execution = runAction({ baselineHasProject: true });
  try {
    assert.equal(execution.invocations.length, 1);
    const [args] = execution.invocations;
    assert.equal(args[0], "compare");
    assert.notEqual(args[1], execution.repository);
    assert.equal(args[2], execution.repository);
    assert.equal(optionValue(args, "--project"), "configs/effect.json");
    assert.deepEqual(execution.result.target, {
      entry: "configs/effect.json",
      projects: ["configs/effect.json"],
    });
  } finally {
    execution.cleanup();
  }
});

test("a project absent from the baseline falls back to a candidate scan", () => {
  const execution = runAction({ baselineHasProject: false });
  try {
    assert.equal(execution.invocations.length, 1);
    const [args] = execution.invocations;
    assert.equal(args[0], execution.repository);
    assert.equal(optionValue(args, "--project"), "configs/effect.json");
    assert.equal(execution.result.completed, true);
    assert.equal(execution.result.scope, "full");
    assert.match(execution.summary, /full scope/u);
  } finally {
    execution.cleanup();
  }
});

test("an option-like project name remains one CLI argument", () => {
  const execution = runAction({
    baselineHasProject: true,
    project: "--config.json",
    projectInput: "--config.json",
  });
  try {
    assert.equal(execution.invocations.length, 1);
    assert.equal(
      optionValue(execution.invocations[0], "--project"),
      "--config.json"
    );
    assert.equal(
      execution.invocations[0].includes("--project=--config.json"),
      true
    );
    assert.equal(execution.result.target.entry, "--config.json");
  } finally {
    execution.cleanup();
  }
});

test("an analyzer failure keeps the canonical directory and lexical target", () => {
  const execution = runAction({
    baselineHasProject: true,
    directory: "packages/app/",
    fail: true,
    project: "linked.json",
    projectInput: "./linked.json",
    symlinkTarget: "tsconfig.json",
  });
  try {
    assert.equal(execution.result.completed, false);
    assert.equal(execution.result.repositoryPrefix, "packages/app");
    assert.deepEqual(execution.result.target, {
      entry: "linked.json",
      projects: ["linked.json"],
    });
    assert.match(execution.summary, /packages\/app\/linked\.json/u);
    assert.doesNotMatch(execution.summary, /packages\/app\/\/linked/u);
  } finally {
    execution.cleanup();
  }
});
