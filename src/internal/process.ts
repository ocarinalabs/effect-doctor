import { Effect, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { AnalyzerFailure } from "../errors.js";

const ProcessEngineSchema = Schema.Literals(["effect-tsgo", "effect-oxlint"]);
type ProcessEngine = typeof ProcessEngineSchema.Type;

type ProcessRequest = {
  readonly engine: ProcessEngine;
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly cwd: string;
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
          env: {
            FORCE_COLOR: "0",
            LC_ALL: "C",
            NO_COLOR: "1",
            TZ: "UTC",
          },
          extendEnv: true,
          stderr: "pipe",
          stdin: "ignore",
          stdout: "pipe",
        })
      );

      const [stdout, stderr, exitCode] = yield* Effect.all(
        [
          handle.stdout.pipe(Stream.decodeText(), Stream.mkString),
          handle.stderr.pipe(Stream.decodeText(), Stream.mkString),
          handle.exitCode,
        ],
        { concurrency: "unbounded" }
      );

      return { exitCode: Number(exitCode), stderr, stdout };
    })
  );

  return yield* execution.pipe(
    Effect.timeout("2 minutes"),
    Effect.mapError(
      (cause) =>
        new AnalyzerFailure({
          engine: request.engine,
          exitCode: null,
          message: `Unable to run ${request.engine}: ${String(cause)}`,
          stderr: "",
        })
    )
  );
});
