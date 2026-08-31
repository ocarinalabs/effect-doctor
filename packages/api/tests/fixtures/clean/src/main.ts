import { Effect, Schedule } from "effect";

export const program = Effect.retry(
  Effect.fail("boom"),
  Schedule.recurs(3),
);
