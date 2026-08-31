import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: [
    {
      dts: true,
      entry: { index: "./src/index.ts" },
      fixedExtension: false,
      platform: "node",
      target: "node22",
    },
  ],
  test: {
    testTimeout: 60_000,
  },
});
