import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const projectRoot = realpathSync(join(import.meta.dirname, ".."));
const cli = join(projectRoot, "dist", "bin.js");

const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
};

const integerAfter = (flag) => {
  const raw = valueAfter(flag);
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new TypeError(`${flag} must be an integer`);
  }
  return value;
};

const positiveInteger = (flag, fallback) => {
  const value = integerAfter(flag);
  if (value === undefined) {
    return fallback;
  }
  if (value < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return value;
};

const nonNegativeInteger = (flag, fallback) => {
  const value = integerAfter(flag);
  if (value === undefined) {
    return fallback;
  }
  if (value < 0) {
    throw new Error(`${flag} must be a non-negative integer`);
  }
  return value;
};

const runs = positiveInteger("--runs", 7);
const warmups = nonNegativeInteger("--warmup", 2);

const runSelfScan = () =>
  spawnSync(
    process.execPath,
    [cli, projectRoot, "--format", "json", "--blocking", "never"],
    {
      cwd: projectRoot,
      encoding: "utf-8",
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        LC_ALL: "C",
        NO_COLOR: "1",
        TZ: "UTC",
      },
      timeout: 30_000,
    }
  );

const requireSuccessfulScan = (result) => {
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Packaged self-scan failed with ${result.status}: ${result.stderr || result.stdout}`
    );
  }
  return result.stdout;
};

const requireScanReport = (output) => {
  const report = JSON.parse(output);
  if (report.schema !== "effect-doctor/scan/v1") {
    throw new Error("Packaged self-scan returned an unexpected report schema");
  }
};

const scanOnce = () => {
  const started = performance.now();
  const output = requireSuccessfulScan(runSelfScan());
  requireScanReport(output);
  const elapsed = performance.now() - started;
  return elapsed;
};

for (let index = 0; index < warmups; index += 1) {
  scanOnce();
}

const samples = Array.from({ length: runs }, scanOnce).sort(
  (left, right) => left - right
);
const p50 = samples[Math.floor(samples.length / 2)];

process.stdout.write(
  `${JSON.stringify({
    command: "node dist/bin.js . --format json --blocking never",
    p50Milliseconds: Number(p50.toFixed(1)),
    runs,
    samplesMilliseconds: samples.map((sample) => Number(sample.toFixed(1))),
    warmups,
  })}\n`
);
