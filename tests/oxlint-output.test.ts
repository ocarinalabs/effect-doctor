import { describe, expect, it } from "vitest";

import { decodeOxlintOutput } from "../src/internal/oxlint-output.js";

const validOutput = {
  diagnostics: [
    {
      message: "Bound retry attempts or elapsed time.",
      code: "effect(noUnboundedRetry)",
      severity: "warning",
      filename: "src/main.ts",
      labels: [
        {
          span: {
            offset: 42,
            length: 16,
            line: 3,
            column: 9,
          },
        },
      ],
    },
  ],
  number_of_files: 1,
  number_of_rules: 97,
  start_time: 0.01,
  threads_count: 1,
};

describe("decodeOxlintOutput", () => {
  it("decodes a result with exact planned coverage", () => {
    expect(decodeOxlintOutput(JSON.stringify(validOutput), 1)).toEqual(
      validOutput
    );
  });

  it("rejects malformed JSON", () => {
    expect(() => decodeOxlintOutput("{", 1)).toThrowError(/valid JSON string/u);
  });

  it("rejects a vacuous scan", () => {
    const output = { ...validOutput, diagnostics: [], number_of_files: 0 };

    expect(() => decodeOxlintOutput(JSON.stringify(output), 1)).toThrowError(
      /planned file count/u
    );
  });

  it("rejects incomplete planned coverage", () => {
    expect(() =>
      decodeOxlintOutput(JSON.stringify(validOutput), 2)
    ).toThrowError(/planned file count/u);
  });

  it("rejects an incomplete configured rule set", () => {
    expect(() =>
      decodeOxlintOutput(JSON.stringify(validOutput), 1, 98)
    ).toThrowError(/planned rule count/u);
  });

  it("rejects diagnostics without a source label", () => {
    const output = structuredClone(validOutput);
    const diagnostic = output.diagnostics.at(0);
    expect(diagnostic).toBeDefined();
    if (diagnostic === undefined) {
      return;
    }
    diagnostic.labels = [];

    expect(() => decodeOxlintOutput(JSON.stringify(output), 1)).toThrowError(
      /Missing key/u
    );
  });
});
