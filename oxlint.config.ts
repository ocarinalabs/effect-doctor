import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

import { RECOMMENDED_RULES as effectDoctorRecommended } from "./packages/oxlint-plugin-effect-doctor/src/rules.ts";

export default defineConfig({
  extends: [core],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "**/dist/**",
    "packages/*/tests/fixtures/**",
    "packages/*/vendor/**",
  ],
  jsPlugins: [
    {
      name: "effect-doctor",
      specifier: "./packages/oxlint-plugin-effect-doctor/dist/index.js",
    },
  ],
  overrides: [
    {
      files: ["packages/*/src/**/*.ts"],
      rules: {
        ...effectDoctorRecommended,
      },
    },
    {
      files: ["packages/*/tests/**/*.ts"],
      rules: {
        "effect-doctor/no-module-mocks": "error",
      },
    },
    {
      files: ["**/tests/**", "apps/www/**"],
      rules: {
        "max-lines-per-function": "off",
        "max-nested-callbacks": "off",
      },
    },
    {
      files: ["oxfmt.config.ts", "oxlint.config.ts"],
      rules: {
        "sort-keys": "off",
      },
    },
  ],
  rules: {
    complexity: ["error", { max: 10 }],
    "func-names": "off",
    "import/extensions": "off",
    "max-classes-per-file": ["error", 12],
    "max-depth": ["error", 3],
    "max-lines-per-function": [
      "error",
      { max: 60, skipBlankLines: true, skipComments: true },
    ],
    "max-nested-callbacks": ["error", 3],
    "max-params": ["error", 4],
    "no-redeclare": "off",
    "no-shadow": "off",
    "no-use-before-define": "off",
    "oxc/no-barrel-file": "off",
    "promise/avoid-new": "off",
    "require-unicode-regexp": "off",
    "sort-keys": "off",
    "typescript/consistent-type-definitions": ["error", "type"],
    "unicorn/import-style": "off",
    "unicorn/no-array-sort": "off",
    "unicorn/no-useless-undefined": "off",
    "unicorn/throw-new-error": "off",
  },
});
