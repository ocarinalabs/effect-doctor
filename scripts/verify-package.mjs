#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = realpathSync(
  dirname(fileURLToPath(new URL("../package.json", import.meta.url)))
);
const manifest = JSON.parse(
  readFileSync(join(projectRoot, "package.json"), "utf-8")
);
const timestamp = new Date().toISOString().replaceAll(/[:.]/gu, "-");
const evidenceDirectory = join(
  projectRoot,
  ".verification",
  "effect-doctor",
  `${timestamp}-${process.pid}`
);
const temporaryRoot = realpathSync(tmpdir());
const workspacePrefix = join(temporaryRoot, "effect-doctor-verification-");
const workspace = realpathSync(mkdtempSync(workspacePrefix));
const normalizedTemporaryRoot = `${temporaryRoot}${sep}`;

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const writeJson = (path, value) => {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

const createActionDirectory = ({
  arguments: arguments_,
  command,
  expectedExit,
  label,
}) => {
  const actionDirectory = join(evidenceDirectory, "actions", label);
  mkdirSync(actionDirectory, { recursive: true });
  writeJson(join(actionDirectory, "command.json"), {
    arguments: arguments_,
    command,
    expectedExit,
  });
  return actionDirectory;
};

const execute = ({ arguments: arguments_, command, cwd }) =>
  spawnSync(command, arguments_, {
    cwd,
    encoding: "utf-8",
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
    maxBuffer: 16 * 1024 * 1024,
    timeout: 120_000,
  });

const recordResult = (actionDirectory, result) => {
  writeFileSync(join(actionDirectory, "stdout.txt"), result.stdout ?? "");
  writeFileSync(join(actionDirectory, "stderr.txt"), result.stderr ?? "");
  writeJson(join(actionDirectory, "result.json"), {
    signal: result.signal,
    status: result.status,
  });
};

const run = (request) => {
  const actionDirectory = createActionDirectory(request);
  const result = execute(request);
  recordResult(actionDirectory, result);
  if (result.error !== undefined) {
    throw result.error;
  }
  assert(
    result.status === request.expectedExit,
    `${request.label} exited ${result.status ?? "without a status"}; expected ${request.expectedExit}`
  );
  return result.stdout;
};

const filesUnder = (root) => {
  const entries = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) {
        visit(path);
      } else {
        entries.push(path);
      }
    }
  };
  visit(root);
  return entries;
};

const treeDigest = (root) => {
  const hash = createHash("sha256");
  for (const path of filesUnder(root)) {
    hash.update(relative(root, path));
    hash.update("\0");
    hash.update(readFileSync(path));
    hash.update("\0");
  }
  return hash.digest("hex");
};

mkdirSync(evidenceDirectory, { recursive: true });

let verification;
let verificationError;

try {
  const tarballDirectory = join(workspace, "tarball");
  const consumerDirectory = join(workspace, "consumer");
  const projectsDirectory = join(consumerDirectory, "projects");
  mkdirSync(tarballDirectory);
  mkdirSync(projectsDirectory, { recursive: true });

  for (const fixture of ["clean", "invalid", "invalid-config"]) {
    cpSync(
      join(projectRoot, "tests", "fixtures", fixture),
      join(projectsDirectory, fixture),
      { recursive: true }
    );
  }
  writeJson(join(consumerDirectory, "package.json"), {
    name: "effect-doctor-verification-consumer",
    private: true,
    type: "module",
  });

  const packOutput = run({
    arguments: [
      "pack",
      "--silent",
      "--json",
      "--pack-destination",
      tarballDirectory,
    ],
    command: "npm",
    cwd: projectRoot,
    expectedExit: 0,
    label: "pack",
  });
  const [packed] = JSON.parse(packOutput);
  assert(packed.name === manifest.name, "The tarball package name changed");
  assert(packed.version === manifest.version, "The tarball version changed");
  const packageFiles = packed.files.map((file) => file.path);
  for (const requiredFile of [
    "CHANGELOG.md",
    "LICENSE",
    "README.md",
    "SECURITY.md",
    "docs/README.md",
    "docs/release.md",
    "docs/research/README.md",
  ]) {
    assert(
      packageFiles.includes(requiredFile),
      `The tarball does not include ${requiredFile}`
    );
  }
  assert(
    packageFiles.every((file) => !file.endsWith(".map")),
    "The tarball contains source maps without packaged source"
  );
  const archive = join(tarballDirectory, packed.filename);

  run({
    arguments: [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      archive,
      `effect@${manifest.dependencies.effect}`,
    ],
    command: "npm",
    cwd: consumerDirectory,
    expectedExit: 0,
    label: "install",
  });

  const executable = join(
    consumerDirectory,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "effect-doctor.cmd" : "effect-doctor"
  );
  assert(existsSync(executable), "The installed package has no CLI shim");
  const cliCommand =
    process.platform === "win32" ? process.execPath : executable;
  const cliArguments = (arguments_) =>
    process.platform === "win32"
      ? [
          join(
            consumerDirectory,
            "node_modules",
            "@ocarinalabs",
            "effect-doctor",
            "dist",
            "bin.js"
          ),
          ...arguments_,
        ]
      : arguments_;
  const projectsBefore = treeDigest(projectsDirectory);
  const version = run({
    arguments: cliArguments(["--version"]),
    command: cliCommand,
    cwd: consumerDirectory,
    expectedExit: 0,
    label: "version",
  }).trim();
  assert(
    version === `effect-doctor v${manifest.version}`,
    "The packaged CLI version differs from package.json"
  );

  const scan = JSON.parse(
    run({
      arguments: cliArguments([
        join(projectsDirectory, "clean"),
        "--format",
        "json",
      ]),
      command: cliCommand,
      cwd: consumerDirectory,
      expectedExit: 0,
      label: "scan-clean",
    })
  );
  assert(scan.schema === "effect-doctor/scan/v1", "Unexpected scan schema");
  assert(scan.findings.length === 0, "The clean project has findings");
  assert(scan.engines.length === 3, "The scan did not run all three engines");
  assert(
    scan.engines.every((engine) => engine.complete),
    "A scan engine was incomplete"
  );

  const comparison = JSON.parse(
    run({
      arguments: cliArguments([
        "compare",
        join(projectsDirectory, "clean"),
        join(projectsDirectory, "invalid"),
        "--format",
        "json",
      ]),
      command: cliCommand,
      cwd: consumerDirectory,
      expectedExit: 1,
      label: "compare-clean-invalid",
    })
  );
  const introduced = comparison.introduced.map((finding) => finding.ruleId);
  assert(
    comparison.schema === "effect-doctor/comparison/v1",
    "Unexpected comparison schema"
  );
  assert(
    introduced.length === 2 &&
      introduced.includes("effect/floating-effect") &&
      introduced.includes("effect/no-unbounded-retry"),
    "The comparison did not report the two expected findings"
  );

  const rules = run({
    arguments: cliArguments(["rules", "list"]),
    command: cliCommand,
    cwd: consumerDirectory,
    expectedExit: 0,
    label: "rules-list",
  })
    .trim()
    .split("\n");
  assert(rules.length === 155, "The packaged rule catalog is incomplete");

  const libraryExports = JSON.parse(
    run({
      arguments: [
        "--input-type=module",
        "--eval",
        'const api = await import("@ocarinalabs/effect-doctor"); console.log(JSON.stringify(Object.keys(api).sort()))',
      ],
      command: process.execPath,
      cwd: consumerDirectory,
      expectedExit: 0,
      label: "library-import",
    })
  );
  for (const exportName of [
    "AnalyzerFailure",
    "ComparisonReportSchema",
    "InvalidAnalyzerOutput",
    "ProjectFailure",
    "ScanReportSchema",
    "compareProjects",
    "knownRules",
    "scanProject",
  ]) {
    assert(
      libraryExports.includes(exportName),
      `The package does not export ${exportName}`
    );
  }

  const projectsAfter = treeDigest(projectsDirectory);
  assert(
    projectsAfter === projectsBefore,
    "Effect Doctor edited a target project"
  );
  verification = {
    comparison: {
      introduced,
      resolved: comparison.resolved.length,
      schema: comparison.schema,
    },
    libraryExports,
    package: {
      filename: packed.filename,
      fileCount: packageFiles.length,
      integrity: packed.integrity,
      name: packed.name,
      version: packed.version,
    },
    projectsDigest: projectsAfter,
    ruleCount: rules.length,
    scan: {
      engines: scan.engines.map((engine) => engine.engine),
      schema: scan.schema,
      summary: scan.summary,
    },
    schema: "effect-doctor/verification/v1",
    status: "passed",
  };
} catch (error) {
  verificationError = error;
}

try {
  assert(
    workspace.startsWith(normalizedTemporaryRoot) &&
      workspace.startsWith(workspacePrefix),
    `Refusing to clean unexpected verification workspace ${workspace}`
  );
  rmSync(workspace, { force: true, recursive: true });
} catch (error) {
  verificationError ??= error;
}

if (verificationError !== undefined) {
  writeJson(join(evidenceDirectory, "failure.json"), {
    message:
      verificationError instanceof Error
        ? verificationError.message
        : String(verificationError),
    schema: "effect-doctor/verification/v1",
    status: "failed",
  });
  throw verificationError;
}

assert(verification !== undefined, "Verification produced no result");
writeJson(join(evidenceDirectory, "verification.json"), verification);
process.stdout.write(`${evidenceDirectory}\n`);
