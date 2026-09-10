import { defineConfig } from "vite-plus";
import { configDefaults } from "vitest/config";

const externalRuntimeDependencies = [
  "@effect/platform-node",
  "@effect/tsgo",
  "@oxlint/plugins",
  "effect",
  "oxlint",
  "typescript",
];

export default defineConfig({
  pack: [
    {
      deps: {
        neverBundle: externalRuntimeDependencies,
      },
      dts: true,
      entry: { index: "./src/index.ts" },
      fixedExtension: false,
      platform: "node",
      target: "node22",
    },
    {
      clean: false,
      deps: {
        alwaysBundle: ["oxlint-plugin-effect-doctor"],
        neverBundle: ["@oxlint/plugins", "effect"],
      },
      dts: false,
      entry: {
        "internal/doctor-plugin": "./src/internal/analyzers/doctor-plugin.ts",
      },
      fixedExtension: false,
      platform: "node",
      target: "node22",
    },
  ],
  test: {
    exclude: [...configDefaults.exclude, "**/tests/fixtures/**"],
    testTimeout: 30_000,
  },
});
