import { Effect as Fx } from "effect";
import { callback as makeCallback } from "effect/Effect";
import * as EffectPackage from "effect";
import * as EffectModule from "effect/Effect";

export const duplicateResume = Fx.callback<string>((resume) => {
  resume(Fx.succeed("first"));
  resume(Fx.succeed("second"));
});

export const duplicateModuleResume = EffectModule.callback<number>(
  function (complete) {
    complete(Fx.succeed(1));
    const second = 2;
    complete(Fx.succeed(second));
  }
);

export const duplicatePackageNamespace = EffectPackage.Effect.callback<void>(
  (resume) => {
    resume(Fx.void);
    resume(Fx.void);
  }
);

export const repeatedNamedResume = makeCallback<boolean>((finish) => {
  finish(Fx.succeed(true));
  finish(Fx.succeed(false));
  finish(Fx.succeed(true));
});

export const exclusiveBranches = Fx.callback<string>((resume) => {
  if (Date.now() % 2 === 0) {
    resume(Fx.succeed("even"));
  } else {
    resume(Fx.succeed("odd"));
  }
});

export const earlyReturn = Fx.callback<string>((resume) => {
  if (Date.now() % 2 === 0) {
    resume(Fx.succeed("early"));
    return;
  }
  resume(Fx.succeed("late"));
});

export const nestedFunctionBoundary = Fx.callback<void>((resume) => {
  queueMicrotask(() => {
    resume(Fx.void);
    resume(Fx.void);
  });
});

export const continuationAlias = Fx.callback<void>((resume) => {
  const complete = resume;
  complete(Fx.void);
  complete(Fx.void);
});

export const oneResume = Fx.callback<void>((resume) => {
  resume(Fx.void);
});

export const anotherResume = Fx.callback<void>((resume) => {
  resume(Fx.void);
});

const EffectLookalike = {
  callback: (register: (resume: (value: string) => void) => void): void => {
    register(() => undefined);
  },
};

export const unrelatedCallback = EffectLookalike.callback((resume) => {
  resume("first");
  resume("second");
});

export const shadowedEffect = (Fx: typeof EffectLookalike): void => {
  Fx.callback((resume) => {
    resume("first");
    resume("second");
  });
};
