import { Effect, Redacted } from "effect";
import { logError as reportEffectError } from "effect/Effect";
import { value as revealSecret } from "effect/Redacted";
import * as RedactedModule from "effect/Redacted";
import { value as unwrapNewtype } from "effect/Newtype";

const secret = Redacted.make("api-token");

export const effectLogLeak = Effect.logInfo(
  "api token",
  Redacted.value(secret)
);

export const namedEffectLogLeak = reportEffectError(
  `request failed with ${RedactedModule.value(secret)}`
);

export const consoleLeak = console.warn(
  "api token=" + revealSecret(secret)
);

export const errorLeak = new Error(
  ["request failed", revealSecret(secret)].join(": ")
);

export const wrappedEffectLog = Effect.logInfo("api token", secret);

export const bareReveal = Redacted.value(secret);

const storedReveal = RedactedModule.value(secret);
export const storedThenLogged = Effect.logWarning("api token", storedReveal);

export const trustedBoundary = {
  Authorization: `Bearer ${revealSecret(secret)}`,
};

export const deferredConsoleArgument = console.debug(() =>
  Redacted.value(secret)
);

export const shadowedRedacted = () => {
  const Redacted = { value: (value: string) => value };
  return console.error(Redacted.value("public"));
};

export const shadowedConsole = (console: {
  readonly error: (value: unknown) => void;
}) => console.error(Redacted.value(secret));

export const shadowedError = (
  Error: new (message?: string) => { readonly message: string }
) => new Error(Redacted.value(secret));

declare const unrelatedNewtype: never;
export const unrelatedValueImport = console.info(
  unwrapNewtype(unrelatedNewtype)
);
