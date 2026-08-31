import { describe, expect, it } from "vitest";

import { compareFindings } from "../src/delta.js";
import { makeFinding } from "./support/make-finding.js";

describe("location-insensitive finding matching", () => {
  it("matches a finding after a line shift", () => {
    const baseline = makeFinding({
      evidence: "Effect.runPromise(job)",
      line: 2,
    });
    const candidate = makeFinding({
      evidence: "Effect.runPromise(job)",
      line: 20,
    });

    expect(compareFindings([baseline], [candidate])).toEqual({
      introduced: [],
      resolved: [],
      unchanged: [{ baseline, candidate }],
    });
  });

  it("matches the same finding after it moves to another file", () => {
    const baseline = makeFinding({
      evidence: "Effect.runPromise(job)",
      file: "src/old.ts",
    });
    const candidate = makeFinding({
      evidence: "Effect.runPromise(job)",
      file: "src/new.ts",
    });

    expect(compareFindings([baseline], [candidate])).toEqual({
      introduced: [],
      resolved: [],
      unchanged: [{ baseline, candidate }],
    });
  });
});

describe("finding multiplicity", () => {
  it("preserves multiplicity when an existing defect is copied", () => {
    const baseline = makeFinding({
      evidence: "Effect.runPromise(job)",
      file: "src/a.ts",
    });
    const original = makeFinding({
      evidence: "Effect.runPromise(job)",
      file: "src/a.ts",
    });
    const copy = makeFinding({
      evidence: "Effect.runPromise(job)",
      file: "src/b.ts",
    });

    expect(compareFindings([baseline], [original, copy])).toEqual({
      introduced: [copy],
      resolved: [],
      unchanged: [{ baseline, candidate: original }],
    });
  });
});

describe("finding replacement", () => {
  it("does not hide a one-for-one defect replacement in the same file", () => {
    const resolved = makeFinding({ evidence: "Effect.runPromise(oldJob)" });
    const introduced = makeFinding({ evidence: "Effect.runPromise(newJob)" });

    expect(compareFindings([resolved], [introduced])).toEqual({
      introduced: [introduced],
      resolved: [resolved],
      unchanged: [],
    });
  });

  it("uses location as conservative evidence when source evidence is unavailable", () => {
    const baseline = makeFinding({ evidence: "", line: 4 });
    const candidate = makeFinding({ evidence: "", line: 40 });

    expect(compareFindings([baseline], [candidate])).toEqual({
      introduced: [candidate],
      resolved: [baseline],
      unchanged: [],
    });
  });
});
