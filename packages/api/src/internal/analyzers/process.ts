import { Buffer } from "node:buffer";
import { env } from "node:process";

import { Cause, Chunk, Effect, Schema, Stream } from "effect";
import type { Duration, PlatformError } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { AnalyzerFailure } from "../../errors.js";

const ProcessEngineSchema = Schema.Literals(["effect-tsgo", "effect-doctor"]);
type ProcessEngine = typeof ProcessEngineSchema.Type;

type ProcessRequest = {
  readonly engine: ProcessEngine;
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly cwd: string;
  readonly maxOutputBytes?: number | undefined;
  readonly timeout?: Duration.Input | undefined;
};

const DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

const CHILD_ENVIRONMENT = {
  APPDATA: env.APPDATA,
  COMSPEC: env.COMSPEC,
  FORCE_COLOR: "0",
  HOME: env.HOME,
  LC_ALL: "C",
  LOCALAPPDATA: env.LOCALAPPDATA,
  NO_COLOR: "1",
  PATH: env.PATH,
  PATHEXT: env.PATHEXT,
  SYSTEMROOT: env.SYSTEMROOT,
  TEMP: env.TEMP,
  TMP: env.TMP,
  TMPDIR: env.TMPDIR,
  TZ: "UTC",
  USERPROFILE: env.USERPROFILE,
  WINDIR: env.WINDIR,
};

const OUTPUT_LIMIT_ERROR = "Analyzer output exceeded its byte limit";

const MAX_EXCERPT_LENGTH = 4000;

export const outputExcerpt = (output: string): string => {
  const trimmed = output.trim();
  return trimmed.length <= MAX_EXCERPT_LENGTH
    ? trimmed
    : `${trimmed.slice(0, MAX_EXCERPT_LENGTH)}…`;
};

type OutputAccumulator = {
  readonly bytes: number;
  readonly chunks: Chunk.Chunk<Uint8Array>;
};

const emptyOutput = (): OutputAccumulator => ({
  bytes: 0,
  chunks: Chunk.empty(),
});

const appendOutput =
  (maxOutputBytes: number) =>
  (
    output: OutputAccumulator,
    bytes: Uint8Array
  ): Effect.Effect<OutputAccumulator, typeof OUTPUT_LIMIT_ERROR> => {
    const totalBytes = output.bytes + bytes.byteLength;
    return totalBytes > maxOutputBytes
      ? Effect.fail(OUTPUT_LIMIT_ERROR)
      : Effect.succeed({
          bytes: totalBytes,
          chunks: Chunk.append(output.chunks, bytes),
        });
  };

const decodeOutput = (output: OutputAccumulator): string =>
  Buffer.concat(Chunk.toReadonlyArray(output.chunks), output.bytes).toString(
    "utf-8"
  );

const collectOutput = <E, R>(
  stream: Stream.Stream<Uint8Array, E, R>,
  maxOutputBytes: number
): Effect.Effect<string, E | typeof OUTPUT_LIMIT_ERROR, R> =>
  Stream.runFoldEffect(stream, emptyOutput, appendOutput(maxOutputBytes)).pipe(
    Effect.map(decodeOutput)
  );

const makeProcessFailure = (
  request: ProcessRequest,
  error:
    | Cause.TimeoutError
    | PlatformError.PlatformError
    | typeof OUTPUT_LIMIT_ERROR
): AnalyzerFailure => {
  if (error === OUTPUT_LIMIT_ERROR) {
    return new AnalyzerFailure({
      engine: request.engine,
      exitCode: null,
      message: `${request.engine} output exceeded its byte limit.`,
      reason: "output-limit",
      stderr: "",
    });
  }
  if (Cause.isTimeoutError(error)) {
    return new AnalyzerFailure({
      engine: request.engine,
      exitCode: null,
      message: `${request.engine} timed out.`,
      reason: "timeout",
      stderr: "",
    });
  }
  return new AnalyzerFailure({
    engine: request.engine,
    exitCode: null,
    message: `${request.engine} could not be started or read.`,
    reason: "process",
    stderr: "",
  });
};

export const runProcess = Effect.fn("runProcess")(function* (
  request: ProcessRequest
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const execution = Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make(request.executable, request.arguments, {
          cwd: request.cwd,
          env: CHILD_ENVIRONMENT,
          extendEnv: false,
          stderr: "pipe",
          stdin: "ignore",
          stdout: "pipe",
          forceKillAfter: "1 second",
          killSignal: "SIGTERM",
        })
      );

      const [stdout, stderr, exitCode] = yield* Effect.all(
        [
          collectOutput(
            handle.stdout,
            request.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
          ),
          collectOutput(
            handle.stderr,
            request.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
          ),
          handle.exitCode,
        ],
        { concurrency: "unbounded" }
      );

      return { exitCode: Number(exitCode), stderr, stdout };
    })
  );

  return yield* execution.pipe(
    Effect.timeout(request.timeout ?? "2 minutes"),
    Effect.mapError((error) => makeProcessFailure(request, error))
  );
});
