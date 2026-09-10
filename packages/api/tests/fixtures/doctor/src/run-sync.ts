import { Effect } from "effect";
import { runSyncExit, sleep, tryPromise } from "effect/Effect";

export const promiseAtSyncBoundary = Effect.runSync(
  Effect.promise(() => Promise.resolve(1))
);

export const sleepAtSyncBoundary = runSyncExit(sleep("1 millis"));
export const tryPromiseAtSyncBoundary = Effect.runSync(
  tryPromise(() => Promise.resolve(2))
);
export const neverAtSyncBoundary = runSyncExit(Effect.never);

const unknownEffect = Effect.promise(() => Promise.resolve(3));

export const indirectBoundary = Effect.runSync(unknownEffect);
export const synchronousBoundary = Effect.runSync(Effect.succeed(3));
export const immediateCallback = Effect.runSync(
  Effect.callback<number>((resume) => resume(Effect.succeed(5)))
);
export const zeroSleep = Effect.runSync(sleep(0));
export const zeroStringSleep = Effect.runSync(sleep("0 millis"));
export const yieldedBoundary = Effect.runSync(Effect.yieldNow);

const EffectLookalike = {
  promise: () => Effect.succeed(6),
  runSync: <A>(value: Effect.Effect<A>) => value,
};

export const lookalikeBoundary = EffectLookalike.runSync(
  EffectLookalike.promise()
);
