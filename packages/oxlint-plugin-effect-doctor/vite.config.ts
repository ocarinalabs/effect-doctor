import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: [
    {
      deps: {
        alwaysBundle: ["@oxlint/plugins"],
        onlyBundle: ["@oxlint/plugins"],
      },
      dts: true,
      entry: { index: "./src/index.ts" },
      fixedExtension: false,
      platform: "node",
      target: "node22",
    },
  ],
  test: {
    testTimeout: 30_000,
  },
});
