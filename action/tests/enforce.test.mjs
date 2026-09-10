import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const enforce = fileURLToPath(new URL("../enforce.mjs", import.meta.url));

const runEnforce = (arguments_) =>
  spawnSync(process.execPath, [enforce, ...arguments_], { encoding: "utf-8" });

const withResult = (result, use) => {
  const holder = mkdtempSync(join(tmpdir(), "effect-doctor-enforce-"));
  const path = join(holder, "result.json");
  writeFileSync(path, JSON.stringify(result));
  try {
    return use(path);
  } finally {
    rmSync(holder, { force: true, recursive: true });
  }
};

test("a missing or empty result path means the analysis did not complete", () => {
  assert.equal(runEnforce([]).status, 2);
  assert.equal(runEnforce([""]).status, 2);
});

test("an unreadable result means the analysis did not complete", () => {
  const execution = runEnforce([
    join(tmpdir(), "effect-doctor-enforce-missing", "result.json"),
  ]);
  assert.equal(execution.status, 2);
  assert.match(execution.stderr, /could not be read/u);
});

test("a completed result exits by its blocking decision", () => {
  withResult({ blocked: false, completed: true }, (path) => {
    assert.equal(runEnforce([path]).status, 0);
  });
  withResult({ blocked: true, completed: true }, (path) => {
    assert.equal(runEnforce([path]).status, 1);
  });
  withResult({ blocked: true, completed: false }, (path) => {
    assert.equal(runEnforce([path]).status, 2);
  });
});
