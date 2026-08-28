import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    "docs/research/**",
    "dist/**",
    "tests/fixtures/**",
    "vendor/**",
  ],
});
