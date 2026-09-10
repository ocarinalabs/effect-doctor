import { Effect, Schedule } from "effect";

import { shared } from "../../shared/src/shared.js";

export const program = Effect.retry(
  Effect.andThen(shared, Effect.fail("boom")),
  Schedule.recurs(3)
);
