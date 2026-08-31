import { Effect } from "effect";

export const setExitCode = (exitCode: number): Effect.Effect<void> =>
  Effect.sync(() => {
    process.exitCode = exitCode;
  });
