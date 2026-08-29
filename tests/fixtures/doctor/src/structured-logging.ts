import { Effect, logInfo } from "effect";

const payload = { jobId: "job-1", status: "complete" };

export const stringifiedLog = Effect.logInfo(JSON.stringify(payload));
export const namedStringifiedLog = logInfo("payload", JSON.stringify(payload));

export const structuredLog = Effect.logInfo("payload", payload);
export const intentionallyFormattedLog = Effect.logInfo(
  JSON.stringify(payload, null, 2)
);

export const shadowedJsonLog = () => {
  const JSON = { stringify: (value: unknown) => String(value) };
  return Effect.logInfo(JSON.stringify(payload));
};
