import { defineConfig } from "oxlint";
import { recommended as effectRecommended } from "oxlint-plugin-effect/presets/recommended";
import core from "ultracite/oxlint/core";

export default defineConfig({
  extends: [core],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "docs/research/**",
    "dist/**",
    "tests/fixtures/**",
    "vendor/**",
  ],
  jsPlugins: ["oxlint-plugin-effect/plugin"],
  overrides: [
    {
      files: ["src/**/*.ts"],
      rules: {
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
      files: ["src/internal/**/*.ts", "src/bin.ts"],
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
      files: ["src/cli.ts", "src/render.ts"],
      rules: {
        "effect/noGlobals": "off",
        "effect/noNullish": "off",
      },
    },
    {
      files: ["tests/**/*.ts"],
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
