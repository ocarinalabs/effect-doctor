#!/usr/bin/env node

import packageManifest from "../package.json" with { type: "json" };

const [tag] = process.argv.slice(2);
const expected = `v${packageManifest.version}`;

if (tag !== expected) {
  process.stderr.write(
    `Release tag ${tag ?? "<missing>"} does not match package version ${expected}.\n`
  );
  process.exitCode = 1;
}
