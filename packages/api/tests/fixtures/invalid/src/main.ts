import { Config, Effect, Schedule } from "effect";

export const program = Effect.gen(function* () {
  Effect.succeed("floating");
  return yield* Effect.retry(Effect.fail("boom"), Schedule.forever);
});

export const apiKey = Config.String("API_KEY");
