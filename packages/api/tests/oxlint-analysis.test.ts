import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { runOxlint } from "../src/internal/oxlint.js";
import { resolveToolchain } from "../src/internal/toolchain.js";
import type { AnalyzedSource } from "../src/internal/tsgo.js";

const withSources = async <A>(
  sourceByRelativePath: Readonly<Record<string, string>>,
  use: (root: string, sources: readonly AnalyzedSource[]) => Promise<A>
): Promise<A> => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "effect-doctor-oxlint-analysis-"))
  );
  const sources = Object.entries(sourceByRelativePath).map(
    ([relative, source]) => {
      const absolute = join(root, relative);
      writeFileSync(absolute, source);
      return { absolute, relative, source };
    }
  );
  try {
    return await use(root, sources);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
};

const analyze = async (root: string, sources: readonly AnalyzedSource[]) => {
  const toolchain = await Effect.runPromise(resolveToolchain());
  return await Effect.runPromise(
    runOxlint(toolchain, root, sources).pipe(Effect.provide(NodeServices.layer))
  );
};

describe("Oxlint source profiles", () => {
  it("proves direct Effect module references for every analyzed source", () =>
    withSources(
      {
        "z-plain.ts": "export const Effect = { void: undefined };\n",
        "a-import.ts": 'import * as Effect from "effect";\nEffect.void;\n',
      },
      async (root, sources) => {
        const analysis = await analyze(root, sources);

        expect(analysis.sourceProfiles).toEqual([
          {
            directEffectModuleReference: true,
            file: "a-import.ts",
          },
          {
            directEffectModuleReference: false,
            file: "z-plain.ts",
          },
        ]);
      }
    ));

  it("recognizes only parsed direct Effect module references", () =>
    withSources(
      {
        "type-import.ts":
          'import type { Effect } from "effect/Effect";\nexport type Program = Effect<void>;\n',
        "import-type.ts":
          'export type Program = import("effect").Effect.Effect<void>;\n',
        "named-export.ts": 'export { Schema } from "@effect/schema";\n',
        "star-export.ts": 'export * from "effect/Schema";\n',
        "dynamic-import.ts":
          'export const platform = import("@effect/platform");\n',
        "comment.ts": '// import * as Effect from "effect";\nexport {};\n',
        "string.ts":
          "export const source = 'import * as Effect from \"effect\"';\n",
        "local-identifier.ts":
          "export const Effect = { succeed: (value: unknown) => value };\n",
        "effectful.ts":
          'import effectful from "effectful";\nexport { effectful };\n',
        "nonliteral-dynamic-import.ts":
          'const moduleName = "effect";\nexport const loaded = import(moduleName);\n',
        "commonjs.ts":
          'declare const require: (id: string) => unknown;\nexport const Effect = require("effect");\n',
      },
      async (root, sources) => {
        const analysis = await analyze(root, sources);

        expect(analysis.sourceProfiles).toEqual([
          {
            directEffectModuleReference: false,
            file: "comment.ts",
          },
          {
            directEffectModuleReference: false,
            file: "commonjs.ts",
          },
          {
            directEffectModuleReference: true,
            file: "dynamic-import.ts",
          },
          {
            directEffectModuleReference: false,
            file: "effectful.ts",
          },
          {
            directEffectModuleReference: true,
            file: "import-type.ts",
          },
          {
            directEffectModuleReference: false,
            file: "local-identifier.ts",
          },
          {
            directEffectModuleReference: true,
            file: "named-export.ts",
          },
          {
            directEffectModuleReference: false,
            file: "nonliteral-dynamic-import.ts",
          },
          {
            directEffectModuleReference: true,
            file: "star-export.ts",
          },
          {
            directEffectModuleReference: false,
            file: "string.ts",
          },
          {
            directEffectModuleReference: true,
            file: "type-import.ts",
          },
        ]);
      }
    ));
});
