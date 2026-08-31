import { defineConfig } from "vite-plus";

const externalRuntimeDependencies = [
  "@effect/platform-node",
  "@effect/tsgo",
  "@oxlint/plugins",
  "effect",
  "oxlint",
  "oxlint-plugin-effect",
  "typescript",
];

export default defineConfig({
  pack: [
    {
      deps: {
        alwaysBundle: ["@effect-doctor/api"],
        neverBundle: externalRuntimeDependencies,
      },
      dts: true,
      entry: {
        bin: "./src/bin.ts",
        index: "./src/index.ts",
      },
      fixedExtension: false,
      platform: "node",
      target: "node22",
    },
    {
      clean: false,
      deps: {
        alwaysBundle: ["oxlint-plugin-effect-doctor"],
        neverBundle: ["@oxlint/plugins"],
      },
      dts: false,
      entry: {
        "internal/doctor-plugin": "../api/src/internal/doctor-plugin.ts",
      },
      fixedExtension: false,
      platform: "node",
      target: "node22",
    },
  ],
  test: {
    testTimeout: 45_000,
  },
});
