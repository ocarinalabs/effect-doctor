import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import packageManifest from "../package.json" with { type: "json" };

const script = fileURLToPath(
  new URL("../scripts/verify-release-tag.mjs", import.meta.url)
);
const publishWorkflow = readFileSync(
  fileURLToPath(new URL("../.github/workflows/publish.yml", import.meta.url)),
  "utf-8"
);

const verifyTag = (tag: string) =>
  spawnSync(process.execPath, [script, tag], {
    encoding: "utf-8",
    timeout: 5000,
  });

describe("release tag verification", () => {
  it("accepts the manifest version with a v prefix", () => {
    const result = verifyTag(`v${packageManifest.version}`);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
  });

  it("rejects a tag that differs from the manifest version", () => {
    const result = verifyTag(`v${packageManifest.version}-mismatch`);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not match package version");
  });
});

describe("publish workflow", () => {
  it("verifies an exact artifact before the OIDC publishing job", () => {
    expect(publishWorkflow).toMatch(/jobs:\n {2}verify:/u);
    expect(publishWorkflow).toMatch(/\n {2}publish:\n/u);
    expect(publishWorkflow).toMatch(/needs: verify/u);
    expect(publishWorkflow).toMatch(/actions\/upload-artifact@[a-f0-9]{40}/u);
    expect(publishWorkflow).toMatch(/actions\/download-artifact@[a-f0-9]{40}/u);
    expect(publishWorkflow).toContain("sha256sum --check SHA256SUMS");
    expect(publishWorkflow).toContain("npm publish package.tgz");
    expect(publishWorkflow.match(/id-token: write/gu)).toHaveLength(1);
  });

  it("keeps publishing disabled until its external gates exist", () => {
    expect(publishWorkflow).toContain(
      "github.event.release.prerelease == false"
    );
    expect(publishWorkflow).toContain(
      "vars.NPM_TRUSTED_PUBLISHING_ENABLED == 'true'"
    );
    expect(publishWorkflow).toMatch(/environment: npm/u);
  });
});
