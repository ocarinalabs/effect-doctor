import { Effect, runSyncExit, sleep } from "effect";

export const promiseAtSyncBoundary = Effect.runSync(
  Effect.promise(() => Promise.resolve(1))
);

export const sleepAtSyncBoundary = runSyncExit(sleep("1 millis"));

const unknownEffect = Effect.promise(() => Promise.resolve(2));

export const indirectBoundary = Effect.runSync(unknownEffect);
export const synchronousBoundary = Effect.runSync(Effect.succeed(3));

const EffectLookalike = {
  promise: () => Effect.succeed(4),
  runSync: <A>(value: Effect.Effect<A>) => value,
};

export const lookalikeBoundary = EffectLookalike.runSync(
  EffectLookalike.promise()
);
