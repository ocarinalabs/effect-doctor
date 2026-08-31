import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: [
    {
      deps: {
        neverBundle: ["effect"],
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
