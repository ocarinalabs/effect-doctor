const HUNK = /^@@ -\d+(?:,\d+)? \+(?<startLine>\d+)(?:,(?<lineCount>\d+))? @@/u;

const unquoteGitPath = (value) => {
  const trimmed = value.trim();
  if (!(trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed.slice(1, -1);
  }
};

const candidateFile = (line) => {
  const candidate = unquoteGitPath(line.slice(4));
  return candidate === "/dev/null" ? undefined : candidate;
};

const hunkStart = (line) => {
  const match = HUNK.exec(line);
  return match === null
    ? undefined
    : Math.trunc(Number(match.groups.startLine));
};

const isAddedLine = (line) => line.startsWith("+") && !line.startsWith("+++");

const advancesCandidateLine = (line) =>
  !(line.startsWith("-") || line.startsWith("\\"));

const recordChangedLine = (changed, file, line) => {
  const lines = changed.get(file) ?? new Set();
  lines.add(line);
  changed.set(file, lines);
};

export const parseChangedLines = (patch) => {
  const changed = new Map();
  let file;
  let nextLine;

  for (const line of patch.split("\n")) {
    if (line.startsWith("+++ ")) {
      file = candidateFile(line);
      nextLine = undefined;
      continue;
    }
    const start = hunkStart(line);
    if (start !== undefined) {
      nextLine = start;
      continue;
    }
    if (file === undefined || nextLine === undefined) {
      continue;
    }
    if (isAddedLine(line)) {
      recordChangedLine(changed, file, nextLine);
      nextLine += 1;
      continue;
    }
    if (advancesCandidateLine(line)) {
      nextLine += 1;
    }
  }
  return changed;
};

export const selectFindings = ({
  changedFiles,
  changedLines,
  findings,
  scope,
}) => {
  if (scope === "full" || scope === "changed") {
    return findings;
  }
  if (scope === "files") {
    return findings.filter((finding) =>
      changedFiles.has(finding.location.file)
    );
  }
  if (scope === "lines") {
    return findings.filter((finding) =>
      changedLines.get(finding.location.file)?.has(finding.location.start.line)
    );
  }
  throw new Error(`Unsupported scope: ${scope}`);
};

export const withinDirectory = (repositoryFile, prefix) => {
  const normalizedPrefix = prefix.replaceAll("\\", "/").replace(/\/$/u, "");
  if (normalizedPrefix === "" || normalizedPrefix === ".") {
    return repositoryFile;
  }
  return repositoryFile.startsWith(`${normalizedPrefix}/`)
    ? repositoryFile.slice(normalizedPrefix.length + 1)
    : undefined;
};

export const rebaseChangedLines = (changedLines, prefix) => {
  const result = new Map();
  for (const [file, lines] of changedLines) {
    const relative = withinDirectory(file, prefix);
    if (relative !== undefined) {
      result.set(relative, lines);
    }
  }
  return result;
};

export const effectiveScope = (requestedScope, eventName) =>
  eventName === "pull_request" ? requestedScope : "full";

const dependencyFiles = new Set([
  ".npmrc",
  ".yarnrc.yml",
  "bun.lock",
  "bun.lockb",
  "deno.lock",
  "lerna.json",
  "npm-shrinkwrap.json",
  "nx.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "yarn.lock",
]);

export const changesDependencyGraph = (repositoryFiles) =>
  [...repositoryFiles].some((file) => {
    const name = file.split("/").at(-1);
    return name === "package.json" || dependencyFiles.has(name);
  });

const changesOutsideDirectory = (repositoryFiles, prefix) =>
  prefix !== "." &&
  [...repositoryFiles].some(
    (file) => withinDirectory(file, prefix) === undefined
  );

export const safePullRequestScope = (
  requestedScope,
  repositoryFiles,
  prefix = "."
) =>
  requestedScope === "changed" &&
  (changesDependencyGraph(repositoryFiles) ||
    changesOutsideDirectory(repositoryFiles, prefix))
    ? "full"
    : requestedScope;
