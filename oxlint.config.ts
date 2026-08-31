import { defineConfig } from "oxlint";
import { recommended as effectRecommended } from "oxlint-plugin-effect/presets/recommended";
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
    "oxlint-plugin-effect/plugin",
    {
      name: "effect-doctor",
      specifier: "./packages/oxlint-plugin-effect-doctor/src/index.ts",
    },
  ],
  overrides: [
    {
      files: ["packages/*/src/**/*.ts"],
      rules: {
        ...effectDoctorRecommended,
        ...effectRecommended,
        "effect/noConditionalEmptyObjectSpread": "off",
        "effect/noNewError": "off",
        "effect/noNullish": "off",
        "effect/noTernary": "off",
        "effect/noThrowStatement": "off",
        "effect/noTryCatch": "off",
      },
    },
    {
      files: [
        "packages/*/src/internal/**/*.ts",
        "packages/effect-doctor/src/bin.ts",
        "packages/oxlint-plugin-effect-doctor/src/plugin/**/*.ts",
      ],
      rules: {
        "effect/noAs": "off",
        "effect/noDynamicImports": "off",
        "effect/noGlobals": "off",
        "effect/noInlineProvide": "off",
        "effect/noKnownValueWidening": "off",
        "effect/noNodeBuiltinImport": "off",
        "effect/noNullish": "off",
        "effect/noRuntimeTypeof": "off",
      },
    },
    {
      files: [
        "packages/effect-doctor/src/cli.ts",
        "packages/effect-doctor/src/render.ts",
      ],
      rules: {
        "effect/noGlobals": "off",
        "effect/noNullish": "off",
      },
    },
    {
      files: ["packages/*/tests/**/*.ts"],
      rules: {
        "effect/noModuleMocks": "error",
        "effect/noTestLifecycleHooks": "error",
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
    "effect/noNewError": "off",
    "effect/noNullish": "off",
    "effect/noTernary": "off",
    "effect/noThrowStatement": "off",
    "effect/noTryCatch": "off",
    "func-names": "off",
    "import/extensions": "off",
    "max-classes-per-file": ["error", 12],
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
    // Schema.TaggedError is a class factory and must not be constructed here.
    "unicorn/throw-new-error": "off",
  },
});
