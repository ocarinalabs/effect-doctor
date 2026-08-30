import { Effect } from "effect";
import { describe, expect, it } from "vitest";

export const deliberateTestFailure = Effect.gen(function* () {
  yield* Effect.void;
  throw new Error("fail the test with useful context");
});

describe("test-file abstention fixture", () => {
  it("constructs the deliberate failure without running it", () => {
    expect(Effect.isEffect(deliberateTestFailure)).toBe(true);
  });
});
