import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  resolveToolchain,
  validateToolchainVersions,
} from "../src/internal/toolchain.js";

describe("the bundled Effect TSGo adapter", () => {
  it("selects a native compiler matched to the installed TypeScript build", async () => {
    const toolchain = await Effect.runPromise(resolveToolchain());

    expect(toolchain).toHaveProperty("tsgoMode", "native");
    expect(toolchain).toHaveProperty("tsgoExecutable");
    expect(toolchain.tsgoExecutable).toMatch(/[/\\]tsc(?:\.exe)?$/u);
    expect(toolchain.versions).toEqual({
      effect: "4.0.0-rc.112",
      effectOxlint: "0.11.0",
      oxlint: "1.80.0",
      oxlintPlugins: "1.80.0",
      tsgo: "0.38.0",
      tsgoPlatform: "0.38.0",
      typescript: "7.0.2",
    });
  });

  it("rejects an installed analyzer version that differs from its pin", () => {
    expect(() =>
      validateToolchainVersions({
        effect: "4.0.0-rc.112",
        effectOxlint: "0.11.0",
        oxlint: "1.79.0",
        oxlintPlugins: "1.80.0",
        tsgo: "0.38.0",
        tsgoPlatform: "0.38.0",
        typescript: "7.0.2",
      })
    ).toThrowError(/version mismatch/u);
  });
});
