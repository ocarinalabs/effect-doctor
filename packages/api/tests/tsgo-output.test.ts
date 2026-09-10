import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { decodeTsgoOutput } from "../src/internal/analyzers/tsgo-output.js";
import { normalizeTsgoFindings } from "../src/internal/analyzers/tsgo.js";

const runWithNode = <A, E>(
  effect: Effect.Effect<A, E, NodeServices.NodeServices>
): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));

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
  it("keeps an Effect v3 file so the scanner can reject it by name", () => {
    const output = structuredClone(validOutput);
    const file = output.files.at(0);
    expect(file).toBeDefined();
    if (file === undefined) {
      return;
    }
    file.detectedEffect = "v3";
    file.supportedEffect = "v3";

    expect(decodeTsgoOutput(JSON.stringify(output)).files.at(0)).toMatchObject({
      detectedEffect: "v3",
    });
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

  it("keeps files without Effect v4 so the scanner can name them", () => {
    const output = structuredClone(validOutput);
    output.files.push({
      detectedEffect: "unknown",
      file: "/workspace/src/plain.ts",
      supportedEffect: "v3",
    });
    output.summary.filesChecked = 2;
    output.summary.totalFiles = 2;

    expect(decodeTsgoOutput(JSON.stringify(output)).files).toHaveLength(2);
  });
});

const unicodeDiagnostic = (column: number) => {
  const prefix = "/* 😀 */ ";
  const wire = structuredClone(validOutput);
  const diagnostic = wire.diagnostics.at(0);
  if (diagnostic === undefined) {
    throw new Error("The valid output must carry one diagnostic");
  }
  diagnostic.column = column;
  diagnostic.endColumn = column + 6;
  diagnostic.endLine = 1;
  diagnostic.length = 6;
  diagnostic.line = 1;
  diagnostic.start = prefix.length;
  return {
    prefix,
    source: `${prefix}Effect.void`,
    wire,
  };
};

describe("normalizeTsgoFindings", () => {
  it("keeps Effect TSGo UTF-16 columns after Unicode text", async () => {
    const { prefix, source, wire } = unicodeDiagnostic(10);
    expect(prefix.length).toBe(9);
    const output = decodeTsgoOutput(JSON.stringify(wire));

    await expect(
      runWithNode(
        normalizeTsgoFindings({ files: ["/workspace/src/main.ts"], output }, [
          {
            absolute: "/workspace/src/main.ts",
            bomLength: 0,
            relative: "src/main.ts",
            source,
          },
        ])
      )
    ).resolves.toMatchObject([
      {
        evidence: "Effect",
        location: {
          end: { column: 16, line: 1 },
          start: { column: 10, line: 1 },
        },
      },
    ]);
  });

  it("rejects a byte-based column that disagrees with the UTF-16 offset", async () => {
    const { source, wire } = unicodeDiagnostic(12);
    const output = decodeTsgoOutput(JSON.stringify(wire));

    await expect(
      runWithNode(
        normalizeTsgoFindings({ files: ["/workspace/src/main.ts"], output }, [
          {
            absolute: "/workspace/src/main.ts",
            bomLength: 0,
            relative: "src/main.ts",
            source,
          },
        ])
      )
    ).rejects.toMatchObject({
      _tag: "InvalidAnalyzerOutput",
      engine: "effect-tsgo",
      message: expect.stringContaining("src/main.ts:1:12"),
    });
  });

  it("canonicalizes native symlink paths before matching diagnostics", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "effect-doctor-tsgo-path-"));
    const realDirectory = join(workspace, "real");
    const linkedDirectory = join(workspace, "linked");
    mkdirSync(realDirectory);
    const sourceFile = join(realDirectory, "main.ts");
    const source = "const x =\n  Effect.void";
    writeFileSync(sourceFile, source);
    symlinkSync(realDirectory, linkedDirectory, "junction");
    const reportedFile = join(linkedDirectory, "main.ts");
    const wire = structuredClone(validOutput);
    const diagnostic = wire.diagnostics.at(0);
    const file = wire.files.at(0);
    expect(diagnostic).toBeDefined();
    expect(file).toBeDefined();
    if (diagnostic === undefined || file === undefined) {
      return;
    }
    diagnostic.file = reportedFile;
    diagnostic.start = 12;
    file.file = reportedFile;
    const output = decodeTsgoOutput(JSON.stringify(wire));

    try {
      await expect(
        runWithNode(
          normalizeTsgoFindings({ files: [reportedFile], output }, [
            {
              absolute: realpathSync(sourceFile),
              bomLength: 0,
              relative: "src/main.ts",
              source,
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
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

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
      runWithNode(
        normalizeTsgoFindings({ files: [diagnostic.file], output }, [
          {
            absolute: "D:\\workspace\\src\\main.ts",
            bomLength: 0,
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
      runWithNode(
        normalizeTsgoFindings({ files: ["/workspace/src/main.ts"], output }, [
          {
            absolute: "/workspace/src/main.ts",
            bomLength: 0,
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
      runWithNode(
        normalizeTsgoFindings({ files: ["/workspace/src/main.ts"], output }, [
          {
            absolute: "/workspace/src/main.ts",
            bomLength: 0,
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
      runWithNode(
        normalizeTsgoFindings({ files: ["/workspace/src/main.ts"], output }, [
          {
            absolute: "/workspace/src/main.ts",
            bomLength: 0,
            relative: "src/main.ts",
            source: "const x =\n  Effect.void",
          },
        ])
      )
    ).resolves.toMatchObject([
      {
        ruleId: "effect/abort-controller-in-effect",
        severity: "warning",
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
      await runWithNode(
        normalizeTsgoFindings({ files: ["/workspace/src/main.ts"], output }, [
          {
            absolute: "/workspace/src/main.ts",
            bomLength: 0,
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
      runWithNode(
        normalizeTsgoFindings({ files: ["/workspace/src/main.ts"], output }, [
          {
            absolute: "/workspace/src/main.ts",
            bomLength: 0,
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
      runWithNode(
        normalizeTsgoFindings({ files: ["/workspace/src/main.ts"], output }, [
          {
            absolute: "/workspace/src/main.ts",
            bomLength: 0,
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
