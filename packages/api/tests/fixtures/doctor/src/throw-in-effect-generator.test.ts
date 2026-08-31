import { Effect } from "effect";

export const deliberateTestFailure = Effect.gen(function* () {
  yield* Effect.void;
  throw new Error("fail the test with useful context");
});
