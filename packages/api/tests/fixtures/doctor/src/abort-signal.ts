import { Effect } from "effect";
import { tryPromise } from "effect/Effect";

export const missingSignal = Effect.promise(() =>
  fetch("https://example.com/missing")
);

export const missingObjectSignal = tryPromise({
  try: () => fetch("https://example.com/object", { method: "GET" }),
  catch: (cause) => cause,
});

export const forwardedSignal = Effect.promise((signal) =>
  fetch("https://example.com/forwarded", { signal })
);

export const combinedSignal = Effect.promise((signal) =>
  fetch("https://example.com/combined", {
    signal: AbortSignal.any([signal]),
  })
);

const request = new Request("https://example.com/request");
const configuredOptions: RequestInit = {
  signal: AbortSignal.timeout(1_000),
};

export const preconfiguredRequest = Effect.promise(() => fetch(request));
export const opaqueOptions = Effect.promise(() =>
  fetch("https://example.com/options", configuredOptions)
);
export const spreadOptions = Effect.promise(() =>
  fetch("https://example.com/spread", { ...configuredOptions })
);
export const existingSignal = Effect.promise(() =>
  fetch("https://example.com/existing", {
    signal: AbortSignal.timeout(1_000),
  })
);
export const outsideAdapter = fetch("https://example.com/outside");
export const dynamicInput = Effect.promise(() => fetch(request.url));

const EffectLookalike = {
  promise: (evaluate: () => Promise<unknown>) => evaluate(),
};

export const lookalikeAdapter = EffectLookalike.promise(() =>
  fetch("https://example.com/lookalike")
);

export const nestedCallback = Effect.promise(() =>
  Promise.resolve().then(() => fetch("https://example.com/nested"))
);

export const shadowedFetch = () => {
  const fetch = (url: string) => Promise.resolve(url);
  return Effect.promise(() => fetch("https://example.com/local"));
};
