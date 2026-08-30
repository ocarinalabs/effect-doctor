import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const script = fileURLToPath(
  new URL("../scripts/verify-release-tag.mjs", import.meta.url)
);

const verifyTag = (tag: string) =>
  spawnSync(process.execPath, [script, tag], {
    encoding: "utf-8",
    timeout: 5000,
  });

describe("release tag verification", () => {
  it("accepts the manifest version with a v prefix", () => {
    const result = verifyTag("v0.1.0");

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
  });

  it("rejects a tag that differs from the manifest version", () => {
    const result = verifyTag("v0.1.1");

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not match package version");
  });
});
