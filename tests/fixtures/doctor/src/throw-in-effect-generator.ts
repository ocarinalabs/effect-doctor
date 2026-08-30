import { Effect as Fx } from "effect";
import * as EffectPackage from "effect";
import {
  fn as traced,
  fnUntraced as untraced,
  fnUntracedEager as eager,
  gen as generate,
} from "effect/Effect";
import * as EffectModule from "effect/Effect";

export const throwsInGen = Fx.gen(function* () {
  yield* Fx.void;
  throw new Error("invalid user input");
});

export const throwsInAliasedGen = generate(function* () {
  throw new Error("invalid order input");
});

export const throwsInPackageGen = EffectPackage.Effect.gen(function* () {
  throw new Error("invalid package input");
});

export const throwsInNamedFn = traced("throwsInNamedFn")(function* () {
  throw new Error("invalid named operation input");
});

export const throwsInDirectFn = Fx.fn(function* () {
  throw new Error("invalid direct operation input");
});

export const throwsInUntracedFn = untraced(function* () {
  throw new Error("invalid untraced operation input");
});

export const throwsInEagerFn = eager(function* () {
  throw new Error("invalid eager operation input");
});

export const explicitDefect = Fx.gen(function* () {
  return yield* Fx.die(new Error("intentional defect"));
});

export const locallyCaughtThrow = Fx.gen(function* () {
  try {
    throw new Error("locally recovered");
  } catch {
    return "recovered";
  }
});

export const nestedThunkThrow = Fx.gen(function* () {
  return yield* Fx.sync(() => {
    throw new Error("intentional synchronous defect");
  });
});

const deferredBody = function* () {
  throw new Error("not statically tied to Effect.gen");
};

export const indirectGenerator = Fx.gen(deferredBody);

const fakeEffect = {
  gen: <A>(body: () => Generator<never, A, never>): A => body().next().value,
};

export const lookalike = fakeEffect.gen(function* () {
  throw new Error("ordinary generator");
});

export const shadowedImport = () => {
  const EffectModule = fakeEffect;
  return EffectModule.gen(function* () {
    throw new Error("shadowed Effect module");
  });
};
