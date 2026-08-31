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
  it("rejects malformed JSON", () => {
    expect(() =>
      decodeOxlintOutput("{", 1, validOutput.number_of_rules)
    ).toThrowError(/valid JSON string/u);
  });

  it("rejects incomplete planned coverage", () => {
    expect(() =>
      decodeOxlintOutput(
        JSON.stringify(validOutput),
        2,
        validOutput.number_of_rules
      )
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

    expect(() =>
      decodeOxlintOutput(JSON.stringify(output), 1, validOutput.number_of_rules)
    ).toThrowError(/Missing key/u);
  });

  it("rejects zero-based source positions", () => {
    const output = structuredClone(validOutput);
    const diagnostic = output.diagnostics.at(0);
    expect(diagnostic).toBeDefined();
    if (diagnostic === undefined) {
      return;
    }
    const label = diagnostic.labels.at(0);
    expect(label).toBeDefined();
    if (label === undefined) {
      return;
    }
    label.span.line = 0;

    expect(() =>
      decodeOxlintOutput(JSON.stringify(output), 1, validOutput.number_of_rules)
    ).toThrowError();
  });
});
