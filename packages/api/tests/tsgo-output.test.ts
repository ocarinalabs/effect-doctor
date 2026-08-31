import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { decodeTsgoOutput } from "../src/internal/tsgo-output.js";
import { normalizeTsgoFindings } from "../src/internal/tsgo.js";

const validOutput = {
  diagnostics: [
    {
      code: 377_001,
      column: 3,
      endColumn: 9,
      endLine: 2,
      file: "/workspace/src/main.ts",
      length: 6,
      line: 2,
      message: "An Effect value is unused.",
      name: "floatingEffect",
      severity: "error",
      start: 10,
    },
  ],
  files: [
    {
      detectedEffect: "v4",
      file: "/workspace/src/main.ts",
      supportedEffect: "v4",
    },
  ],
  summary: {
    errors: 1,
    filesChecked: 1,
    messages: 0,
    totalFiles: 1,
    warnings: 0,
  },
};

describe("decodeTsgoOutput", () => {
  it("rejects an Effect v3 project as unsupported", () => {
    const output = structuredClone(validOutput);
    const file = output.files.at(0);
    expect(file).toBeDefined();
    if (file === undefined) {
      return;
    }
    file.detectedEffect = "v3";
    file.supportedEffect = "v3";

    expect(() => decodeTsgoOutput(JSON.stringify(output))).toThrowError(
      /Effect v4/u
    );
  });

  it("rejects malformed JSON", () => {
    expect(() => decodeTsgoOutput("{")).toThrowError(/valid JSON string/u);
  });

  it("rejects a vacuous successful scan", () => {
    const output = {
      diagnostics: [],
      files: [],
      summary: {
        errors: 0,
        filesChecked: 0,
        messages: 0,
        totalFiles: 0,
        warnings: 0,
      },
    };

    expect(() => decodeTsgoOutput(JSON.stringify(output))).toThrowError(
      /at least one file/u
    );
  });

  it("rejects incomplete file coverage", () => {
    const output = structuredClone(validOutput);
    output.summary.totalFiles = 2;

    expect(() => decodeTsgoOutput(JSON.stringify(output))).toThrowError(
      /filesChecked.*totalFiles/u
    );
  });

  it("rejects summary counts that disagree with diagnostics", () => {
    const output = structuredClone(validOutput);
    output.summary.errors = 0;

    expect(() => decodeTsgoOutput(JSON.stringify(output))).toThrowError(
      /summary counts/u
    );
  });

  it("rejects unknown or mismatched Effect versions", () => {
    const output = structuredClone(validOutput);
    const file = output.files.at(0);
    expect(file).toBeDefined();
    if (file === undefined) {
      return;
    }
    file.detectedEffect = "unknown";

    expect(() => decodeTsgoOutput(JSON.stringify(output))).toThrowError(
      /supported Effect version/u
    );
  });
});

describe("normalizeTsgoFindings", () => {
  it("matches Windows diagnostics to native snapshot paths", async () => {
    const wire = structuredClone(validOutput);
    const diagnostic = wire.diagnostics.at(0);
    const file = wire.files.at(0);
    expect(diagnostic).toBeDefined();
    expect(file).toBeDefined();
    if (diagnostic === undefined || file === undefined) {
      return;
    }
    diagnostic.file = "d:/workspace/src/main.ts";
    diagnostic.start = 12;
    file.file = diagnostic.file;
    const output = decodeTsgoOutput(JSON.stringify(wire));

    await expect(
      Effect.runPromise(
        normalizeTsgoFindings({ files: [diagnostic.file], output }, [
          {
            absolute: "D:\\workspace\\src\\main.ts",
            relative: "src/main.ts",
            source: "const x =\n  Effect.void",
          },
        ])
      )
    ).resolves.toMatchObject([
      {
        evidence: "Effect",
        location: {
          file: "src/main.ts",
          start: { column: 3, line: 2 },
        },
      },
    ]);
  });

  it("rejects a diagnostic code that belongs to a different rule name", async () => {
    const wire = structuredClone(validOutput);
    const diagnostic = wire.diagnostics.at(0);
    expect(diagnostic).toBeDefined();
    if (diagnostic === undefined) {
      return;
    }
    diagnostic.code = 377_046;
    const output = decodeTsgoOutput(JSON.stringify(wire));

    await expect(
      Effect.runPromise(
        normalizeTsgoFindings({ files: ["/workspace/src/main.ts"], output }, [
          {
            absolute: "/workspace/src/main.ts",
            relative: "src/main.ts",
            source: "Effect.void",
          },
        ])
      )
    ).rejects.toMatchObject({
      _tag: "InvalidAnalyzerOutput",
      engine: "effect-tsgo",
    });
  });

  it("rejects emitted severity that disagrees with enabled policy", async () => {
    const wire = structuredClone(validOutput);
    const diagnostic = wire.diagnostics.at(0);
    expect(diagnostic).toBeDefined();
    if (diagnostic === undefined) {
      return;
    }
    diagnostic.severity = "warning";
    wire.summary.errors = 0;
    wire.summary.warnings = 1;
    const output = decodeTsgoOutput(JSON.stringify(wire));

    await expect(
      Effect.runPromise(
        normalizeTsgoFindings({ files: ["/workspace/src/main.ts"], output }, [
          {
            absolute: "/workspace/src/main.ts",
            relative: "src/main.ts",
            source: "Effect.void",
          },
        ])
      )
    ).rejects.toMatchObject({
      _tag: "InvalidAnalyzerOutput",
      engine: "effect-tsgo",
    });
  });

  it("normalizes a cataloged TSGo suggestion as an active finding", async () => {
    const wire = structuredClone(validOutput);
    const diagnostic = wire.diagnostics.at(0);
    expect(diagnostic).toBeDefined();
    if (diagnostic === undefined) {
      return;
    }
    diagnostic.code = 377_111;
    diagnostic.name = "abortControllerInEffect";
    diagnostic.severity = "warning";
    diagnostic.start = 12;
    wire.summary.errors = 0;
    wire.summary.warnings = 1;
    const output = decodeTsgoOutput(JSON.stringify(wire));

    await expect(
      Effect.runPromise(
        normalizeTsgoFindings({ files: ["/workspace/src/main.ts"], output }, [
          {
            absolute: "/workspace/src/main.ts",
            relative: "src/main.ts",
            source: "const x =\n  Effect.void",
          },
        ])
      )
    ).resolves.toMatchObject([
      {
        ruleId: "effect/abort-controller-in-effect",
        severity: "advice",
      },
    ]);
  });

  it("leaves directive inventory to Effect Doctor's comment-aware rule", async () => {
    const wire = structuredClone(validOutput);
    const diagnostic = wire.diagnostics.at(0);
    expect(diagnostic).toBeDefined();
    if (diagnostic === undefined) {
      return;
    }
    wire.diagnostics = [
      {
        ...diagnostic,
        code: 377_000,
        message: "@effect-diagnostics directive has no effect.",
        name: "effect(377000)",
        severity: "warning",
      },
    ];
    wire.summary.errors = 0;
    wire.summary.warnings = 1;
    const output = decodeTsgoOutput(JSON.stringify(wire));

    expect(
      await Effect.runPromise(
        normalizeTsgoFindings({ files: ["/workspace/src/main.ts"], output }, [
          {
            absolute: "/workspace/src/main.ts",
            relative: "src/main.ts",
            source: 'const example = "@effect-diagnostics"',
          },
        ])
      )
    ).toEqual([]);
  });

  it("rejects diagnostics absent from the pinned catalog", async () => {
    const wire = structuredClone(validOutput);
    const diagnostic = wire.diagnostics.at(0);
    expect(diagnostic).toBeDefined();
    if (diagnostic === undefined) {
      return;
    }
    diagnostic.name = "futureUnknownDiagnostic";
    const output = decodeTsgoOutput(JSON.stringify(wire));

    await expect(
      Effect.runPromise(
        normalizeTsgoFindings({ files: ["/workspace/src/main.ts"], output }, [
          {
            absolute: "/workspace/src/main.ts",
            relative: "src/main.ts",
            source: "Effect.void",
          },
        ])
      )
    ).rejects.toMatchObject({
      _tag: "InvalidAnalyzerOutput",
      engine: "effect-tsgo",
    });
  });

  it("rejects a diagnostic span outside the snapshotted source", async () => {
    const wire = structuredClone(validOutput);
    const diagnostic = wire.diagnostics.at(0);
    expect(diagnostic).toBeDefined();
    if (diagnostic === undefined) {
      return;
    }
    diagnostic.start = 99;
    const output = decodeTsgoOutput(JSON.stringify(wire));

    await expect(
      Effect.runPromise(
        normalizeTsgoFindings({ files: ["/workspace/src/main.ts"], output }, [
          {
            absolute: "/workspace/src/main.ts",
            relative: "src/main.ts",
            source: "Effect.void",
          },
        ])
      )
    ).rejects.toMatchObject({
      _tag: "InvalidAnalyzerOutput",
      engine: "effect-tsgo",
    });
  });
});
