import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  effectiveScope,
  parseChangedLines,
  rebaseChangedLines,
  safePullRequestScope,
  selectFindings,
  withinDirectory,
} from "./diff.mjs";
import {
  annotationCommand,
  metricsFor,
  messageCommand,
  outputValues,
  parseReportShape,
  renderSummary,
} from "./report.mjs";

const workspace = realpathSync(process.env.GITHUB_WORKSPACE ?? process.cwd());
const runnerTemp = process.env.RUNNER_TEMP ?? os.tmpdir();
const outputFile = process.env.GITHUB_OUTPUT;
const summaryFile = process.env.GITHUB_STEP_SUMMARY;

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: "utf-8",
    maxBuffer: 128 * 1024 * 1024,
    timeout: 10 * 60 * 1000,
    ...options,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  return result;
};

const git = (root, args, options = {}) =>
  run("git", ["-C", root, ...args], options);

const checkedGit = (root, args) => {
  const result = git(root, args);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args[0]} failed`);
  }
  return result.stdout.trim();
};

const input = (name, fallback) => {
  const value = process.env[`INPUT_${name.replaceAll("-", "_").toUpperCase()}`];
  return value === undefined || value === "" ? fallback : value;
};

const normalizeChoice = (value, choices, name) => {
  const normalized = value.toLowerCase();
  if (!choices.includes(normalized)) {
    throw new Error(
      `${name} must be one of: ${choices.join(", ")}; received ${value}`
    );
  }
  return normalized;
};

const packageSpec = (version) => {
  if (
    version.startsWith("file:") ||
    version.startsWith("./") ||
    version.startsWith("../") ||
    path.isAbsolute(version) ||
    /^https?:\/\//u.test(version) ||
    version.startsWith("git+")
  ) {
    return version;
  }
  if (version.startsWith("dr-effect@")) {
    return version;
  }
  return `dr-effect@${version}`;
};

const installDoctor = (version) => {
  const spec = packageSpec(version);
  const identity = createHash("sha256").update(spec).digest("hex").slice(0, 16);
  const prefix = path.join(runnerTemp, `effect-doctor-toolchain-${identity}`);
  const executable = path.join(
    prefix,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "effect-doctor.cmd" : "effect-doctor"
  );
  if (!existsSync(executable)) {
    mkdirSync(prefix, { recursive: true });
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const installation = run(npm, [
      "install",
      "--prefix",
      prefix,
      "--no-save",
      "--no-audit",
      "--no-fund",
      "--ignore-scripts",
      spec,
    ]);
    if (installation.status !== 0) {
      throw new Error(
        installation.stderr.trim() || `Could not install ${spec}`
      );
    }
  }
  return executable;
};

const ensureCommit = (root, sha) => {
  if (git(root, ["cat-file", "-e", `${sha}^{commit}`]).status === 0) {
    return;
  }
  const fetched = git(root, ["fetch", "--no-tags", "--depth=1", "origin", sha]);
  if (
    fetched.status !== 0 ||
    git(root, ["cat-file", "-e", `${sha}^{commit}`]).status !== 0
  ) {
    throw new Error(
      "The pull request base commit is unavailable. Configure actions/checkout with fetch-depth: 0."
    );
  }
};

const scanPrefix = (repositoryRoot, directory) => {
  const relative = path
    .relative(repositoryRoot, directory)
    .replaceAll(path.sep, "/");
  if (relative.startsWith("../") || path.isAbsolute(relative)) {
    throw new Error("directory must be inside the checked-out Git repository");
  }
  return relative || ".";
};

const changedState = (repositoryRoot, prefix, baseSha) => {
  ensureCommit(repositoryRoot, baseSha);
  const range = `${baseSha}...HEAD`;
  const pathspec = prefix === "." ? "." : prefix;
  const namesResult = git(repositoryRoot, [
    "diff",
    "--name-only",
    "-z",
    "--diff-filter=AMR",
    range,
  ]);
  if (namesResult.status !== 0) {
    throw new Error(
      namesResult.stderr.trim() || "Could not read changed files"
    );
  }
  const repositoryChangedFiles = new Set(
    namesResult.stdout.split("\0").filter(Boolean)
  );
  const changedFiles = new Set(
    [...repositoryChangedFiles]
      .map((file) => withinDirectory(file, prefix))
      .filter((file) => file !== undefined)
  );
  const patchResult = git(repositoryRoot, [
    "-c",
    "core.quotePath=false",
    "diff",
    "--no-ext-diff",
    "--no-prefix",
    "--unified=0",
    "--diff-filter=AMR",
    range,
    "--",
    pathspec,
  ]);
  if (patchResult.status !== 0) {
    throw new Error(
      patchResult.stderr.trim() || "Could not read changed lines"
    );
  }
  return {
    changedFiles,
    changedLines: rebaseChangedLines(
      parseChangedLines(patchResult.stdout),
      prefix
    ),
    repositoryChangedFiles,
  };
};

const linkDirectory = (source, destination) => {
  if (!(existsSync(source) && !existsSync(destination))) {
    return;
  }
  mkdirSync(path.dirname(destination), { recursive: true });
  symlinkSync(
    source,
    destination,
    process.platform === "win32" ? "junction" : "dir"
  );
};

const makeBaseline = (repositoryRoot, candidate, prefix, baseSha) => {
  const holder = path.join(
    runnerTemp,
    `effect-doctor-baseline-${process.pid}-${Date.now()}`
  );
  mkdirSync(holder, { recursive: true });
  const baselineRoot = path.join(holder, "checkout");
  const addition = git(repositoryRoot, [
    "worktree",
    "add",
    "--detach",
    baselineRoot,
    baseSha,
  ]);
  if (addition.status !== 0) {
    rmSync(holder, { force: true, recursive: true });
    throw new Error(
      addition.stderr.trim() || "Could not create baseline worktree"
    );
  }

  const baseline =
    prefix === "." ? baselineRoot : path.join(baselineRoot, prefix);
  linkDirectory(
    path.join(repositoryRoot, "node_modules"),
    path.join(baselineRoot, "node_modules")
  );
  if (candidate !== repositoryRoot) {
    linkDirectory(
      path.join(candidate, "node_modules"),
      path.join(baseline, "node_modules")
    );
  }
  return {
    baseline,
    cleanup: () => {
      git(repositoryRoot, ["worktree", "remove", "--force", baselineRoot]);
      rmSync(holder, { force: true, recursive: true });
    },
  };
};

const runDoctor = (executable, args) => {
  const result = run(executable, [...args, "--format", "json"], {
    env: {
      ...process.env,
      NO_COLOR: "1",
    },
  });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(
      result.stdout.trim() ||
        result.stderr.trim() ||
        `Effect Doctor exited with code ${result.status}`
    );
  }
  return result.stdout;
};

const appendOutput = (name, value) => {
  if (outputFile !== undefined) {
    writeFileSync(outputFile, `${name}=${value}\n`, { flag: "a" });
  }
};

const emptyMetrics = () => ({
  affectedFiles: 0,
  errorCount: 0,
  resolvedCount: 0,
  totalCount: 0,
  warningCount: 0,
});

const serializeChangedLines = (lines) =>
  Object.fromEntries(
    [...lines].map(([file, values]) => [
      file,
      [...values].sort((a, b) => a - b),
    ])
  );

const emitResult = (result) => {
  const resultPath = path.join(
    runnerTemp,
    `effect-doctor-action-${process.env.GITHUB_RUN_ID ?? process.pid}.json`
  );
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  appendOutput("result-file", resultPath);
  appendOutput("completed", String(result.completed));
  for (const [name, value] of Object.entries(outputValues(result))) {
    appendOutput(name, value);
  }

  const summary = renderSummary(result);
  if (summaryFile !== undefined) {
    writeFileSync(summaryFile, `${summary}\n`, { flag: "a" });
  }
  if (result.completed) {
    for (const finding of result.findings.slice(0, 100)) {
      console.log(annotationCommand(finding, result.directory, workspace));
    }
    if (result.findings.length > 100) {
      console.log(
        messageCommand(
          "notice",
          `Effect Doctor omitted ${result.findings.length - 100} workflow annotations; the summary still includes their counts.`
        )
      );
    }
  } else {
    console.log(messageCommand("error", result.errorMessage));
  }
};

const readActionRequest = () => ({
  directoryInput: input("directory", "."),
  projectInput: input("project", "tsconfig.json"),
  requestedScope: normalizeChoice(
    input("scope", "changed"),
    ["changed", "files", "lines", "full"],
    "scope"
  ),
  reviewComments: input("review-comments", "true").toLowerCase() === "true",
  version: input("version", "0.1.0"),
});

const projectEntry = (directory, projectInput) => {
  if (path.isAbsolute(projectInput) || projectInput.includes("\\")) {
    throw new Error("project must be a POSIX path relative to directory");
  }
  const project = path.resolve(directory, projectInput);
  const relative = path.relative(directory, project);
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("project must name a file inside directory");
  }
  return relative.replaceAll(path.sep, "/");
};

const resolveProject = (directoryInput, projectInput) => {
  const requestedDirectory = path.resolve(workspace, directoryInput);
  const directory = existsSync(requestedDirectory)
    ? realpathSync(requestedDirectory)
    : requestedDirectory;
  if (!existsSync(directory)) {
    throw new Error(`Project directory does not exist: ${directoryInput}`);
  }
  const repositoryRoot = realpathSync(
    checkedGit(directory, ["rev-parse", "--show-toplevel"])
  );
  return {
    directory,
    prefix: scanPrefix(repositoryRoot, directory),
    repositoryRoot,
    targetEntry: projectEntry(directory, projectInput),
  };
};

const emptyChanges = (scope) => ({
  changedFiles: new Set(),
  changedLines: new Map(),
  repositoryChangedFiles: new Set(),
  scope,
});

const comparisonChanges = ({ baseSha, prefix, repositoryRoot, scope }) => {
  const changes = changedState(repositoryRoot, prefix, baseSha);
  const safeScope = safePullRequestScope(
    scope,
    changes.repositoryChangedFiles,
    prefix
  );
  if (safeScope !== scope) {
    console.log(
      messageCommand(
        "warning",
        "Effect Doctor found changes outside the selected project or in dependency metadata and is using full scope instead of a hybrid baseline."
      )
    );
  }
  return { ...changes, scope: safeScope };
};

const reviewChanges = ({ baseSha, prefix, repositoryRoot, scope }) => {
  try {
    return { ...changedState(repositoryRoot, prefix, baseSha), scope };
  } catch (error) {
    console.log(
      messageCommand(
        "warning",
        `Effect Doctor could not locate changed lines for review comments: ${error instanceof Error ? error.message : String(error)}`
      )
    );
    return emptyChanges(scope);
  }
};

const resolveChanges = ({
  baseSha,
  eventName,
  prefix,
  repositoryRoot,
  requestedScope,
  reviewComments,
}) => {
  const scope = effectiveScope(requestedScope, eventName);
  if (eventName !== "pull_request") {
    return emptyChanges(scope);
  }
  if (scope !== "full") {
    if (!baseSha) {
      throw new Error("The pull request base SHA is unavailable");
    }
    return comparisonChanges({ baseSha, prefix, repositoryRoot, scope });
  }
  if (!(reviewComments && baseSha)) {
    return emptyChanges(scope);
  }
  return reviewChanges({ baseSha, prefix, repositoryRoot, scope });
};

const analyzeProject = ({
  baseSha,
  directory,
  executable,
  prefix,
  repositoryRoot,
  scope,
  targetEntry,
}) => {
  if (scope !== "changed") {
    return {
      reportSource: runDoctor(executable, [
        directory,
        `--project=${targetEntry}`,
      ]),
      scope,
    };
  }
  const baseline = makeBaseline(repositoryRoot, directory, prefix, baseSha);
  try {
    if (!existsSync(path.join(baseline.baseline, targetEntry))) {
      return {
        reportSource: runDoctor(executable, [
          directory,
          `--project=${targetEntry}`,
        ]),
        scope: "full",
      };
    }
    return {
      reportSource: runDoctor(executable, [
        "compare",
        baseline.baseline,
        directory,
        `--project=${targetEntry}`,
      ]),
      scope,
    };
  } finally {
    baseline.cleanup();
  }
};

const completedResult = ({ changes, directoryInput, parsed, prefix }) => {
  const findings = selectFindings({
    changedFiles: changes.changedFiles,
    changedLines: changes.changedLines,
    findings: parsed.findings,
    scope: changes.scope,
  });
  const resolved = changes.scope === "changed" ? parsed.resolved : [];
  const metrics = metricsFor(findings, resolved);
  return {
    blocked: metrics.totalCount > 0,
    changedLines: serializeChangedLines(changes.changedLines),
    completed: true,
    directory: directoryInput,
    doctorVersion: parsed.report.doctorVersion,
    engines: parsed.engines,
    findings,
    applicability: parsed.applicability,
    metrics,
    policy: parsed.policy,
    repositoryPrefix: prefix,
    resolved,
    scope: changes.scope,
    target: parsed.target,
    toolchain: parsed.toolchain,
  };
};

const main = () => {
  const request = readActionRequest();
  const project = resolveProject(request.directoryInput, request.projectInput);
  let result;
  try {
    const baseSha = process.env.GITHUB_BASE_SHA;
    const changes = resolveChanges({
      baseSha,
      eventName: process.env.GITHUB_EVENT_NAME,
      prefix: project.prefix,
      repositoryRoot: project.repositoryRoot,
      requestedScope: request.requestedScope,
      reviewComments: request.reviewComments,
    });
    const executable = installDoctor(request.version);
    const analysis = analyzeProject({
      baseSha,
      directory: project.directory,
      executable,
      prefix: project.prefix,
      repositoryRoot: project.repositoryRoot,
      scope: changes.scope,
      targetEntry: project.targetEntry,
    });
    const parsed = parseReportShape(analysis.reportSource);
    result = completedResult({
      changes: { ...changes, scope: analysis.scope },
      directoryInput: request.directoryInput,
      parsed,
      prefix: project.prefix,
    });
  } catch (error) {
    result = {
      blocked: true,
      changedLines: {},
      completed: false,
      directory: request.directoryInput,
      doctorVersion: undefined,
      errorMessage: error instanceof Error ? error.message : String(error),
      findings: [],
      metrics: emptyMetrics(),
      repositoryPrefix: project.prefix,
      resolved: [],
      scope: request.requestedScope,
      target: {
        entry: project.targetEntry,
        projects: [project.targetEntry],
      },
    };
  }
  emitResult(result);
};

const fallbackTarget = () => {
  const entry = path.posix.normalize(
    input("project", "tsconfig.json").replaceAll("\\", "/")
  );
  return { entry, projects: [entry] };
};

const fallbackDirectory = () =>
  path.posix.normalize(input("directory", ".").replaceAll("\\", "/"));

try {
  main();
} catch (error) {
  emitResult({
    blocked: true,
    changedLines: {},
    completed: false,
    directory: input("directory", "."),
    doctorVersion: undefined,
    errorMessage: error instanceof Error ? error.message : String(error),
    findings: [],
    metrics: emptyMetrics(),
    repositoryPrefix: fallbackDirectory(),
    resolved: [],
    scope: input("scope", "changed"),
    target: fallbackTarget(),
  });
}
