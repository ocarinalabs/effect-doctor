import { Context, Effect, Layer, Stream } from "effect";

class Worker extends Context.Service<
  Worker,
  { readonly run: Effect.Effect<void> }
>()("Worker") {}

export const directNever = Layer.effectDiscard(Effect.never);

export const directForever = Layer.effect(
  Worker,
  Effect.forever(Effect.succeed(Worker.of({ run: Effect.void })))
);

export const unboundedStream = Layer.effectDiscard(
  Stream.runDrain(Stream.never)
);

export const generatorNever = Layer.effectDiscard(
  Effect.gen(function* () {
    return yield* Effect.never;
  })
);

export const forkedForever = Layer.effectDiscard(
  Effect.forkScoped(Effect.forever(Effect.void))
);

export const forkedGenerator = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* Effect.forkScoped(Effect.never);
  })
);

export const deferredServiceWork = Layer.effect(
  Worker,
  Effect.succeed(Worker.of({ run: Effect.never }))
);

const LayerLookalike = {
  effectDiscard: <A>(effect: Effect.Effect<A>) => effect,
};

export const unrelatedLayer = LayerLookalike.effectDiscard(Effect.never);
export const longLivedOutsideLayer = Effect.forever(Effect.void);
