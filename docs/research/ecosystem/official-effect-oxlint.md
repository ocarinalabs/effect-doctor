# Official Effect Oxlint audit

Audited on 2026-08-30 against `Effect-TS/effect` `main` at commit
[`145d8e1013220425b8edf34f7011c73f73e1cdcf`](https://github.com/Effect-TS/effect/tree/145d8e1013220425b8edf34f7011c73f73e1cdcf),
committed 2026-08-28. Every repository link below is pinned to that commit or to a specific historical commit.

## Executive answer

The Effect team does **not** use the community `oxlint-plugin-effect` in the canonical Effect repository. It uses:

1. Oxlint's native `correctness`, `suspicious`, and `perf` categories;
2. a deliberately selected set of native TypeScript, import, ESLint, Unicorn, and Oxc rules;
3. a private workspace package named [`@effect/oxc`](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/tools/oxc/package.json) containing five custom rules; and
4. a separate `@effect/tsgo`-patched TypeScript check for semantic and type-aware Effect diagnostics.

This yields no new default Effect Doctor rule to implement. The only custom rule that expresses an Effect semantic, `no-opaque-instance-fields`, is already authoritatively implemented by TSGo as `schemaOpaqueInstanceMember` and already cataloged by Effect Doctor as `effect/schema-opaque-instance-member`. The other custom rules encode the canonical repository's package layout, source-emission strategy, compatibility policy, and API hygiene. Treating those as universal Effect quality would produce false positives in ordinary applications.

The useful lesson is architectural: the Effect team separates fast repository-local syntax policy in an Oxlint JavaScript plugin from semantic Effect diagnostics in TSGo. That is the same provider boundary Effect Doctor should preserve.

## What runs in the official repository

The root [`package.json`](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/package.json#L4-L73) pins the current toolchain through its lockfile and declares:

- `lint`: `oxlint -f unix && dprint check`;
- `lint-fix`: `oxlint --fix && dprint fmt`;
- `check`: `tsc -b tsconfig.json`;
- `prepare`: agent setup followed by `effect-tsgo patch`;
- `oxlint` `^1.79.0`, locked to 1.79.0 at this snapshot;
- `@effect/tsgo` `^0.36.5`, locked to 0.36.5; and
- workspace-local `@effect/oxc`.

The [`Check` workflow](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/.github/workflows/check.yml#L15-L40) runs lint and types as distinct CI jobs. Its shared [setup action](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/.github/actions/setup/action.yaml#L1-L33) installs through pnpm, so the root prepare lifecycle patches TypeScript with Effect TSGo before checks.

The root [`.oxlintrc.json`](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/.oxlintrc.json) extends the workspace Oxc preset, loads `@effect/oxc/oxlint`, and relaxes three rules for tests, type tests, examples, AI documentation, benchmarks, bundles, scripts, and the scratchpad:

- `effect/no-bigint-literals` is off;
- `eslint/no-console` is off; and
- `effect/no-import-from-barrel-package` is off.

That override is important evidence about scope: two of the custom rules are production-source policies, not guidance the Effect team applies to its own examples or AI-facing instructional code.

### Exact native Oxlint policy

The shared [`packages/tools/oxc/oxlintrc.json`](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/tools/oxc/oxlintrc.json) loads the `typescript`, `import`, `oxc`, `eslint`, `unicorn`, and `node` native plugins. It promotes all rules in the native `correctness`, `suspicious`, and `perf` categories to errors. The exact category membership belongs to the pinned Oxlint version rather than to Effect's configuration.

In addition to those categories and the five private rules, it explicitly enables these 19 native rules:

- imports: `typescript/consistent-type-imports` with inline type imports, `typescript/no-import-type-side-effects`, `import/no-duplicates`, `import/no-self-import`, and `import/no-empty-named-blocks`;
- TypeScript cleanup: `typescript/no-unnecessary-type-assertion`, `typescript/no-unnecessary-type-constraint`, and `typescript/no-useless-empty-export`;
- general code quality: `eslint/no-console`, `eslint/no-var`, `eslint/no-useless-constructor`, `unicorn/no-abusive-eslint-disable`, `eslint/no-unneeded-ternary`, `eslint/no-useless-concat`, and `oxc/misrefactored-assign-op`;
- other Unicorn rules: `unicorn/prefer-array-flat-map` and `unicorn/no-accessor-recursion`; and
- style with explicit options: `typescript/array-type` in generic form and `typescript/no-unused-vars` with underscore-prefixed variables and arguments ignored.

It explicitly disables 26 native rules. The disabled set includes generic or restrictive policies such as `no-shadow`, `no-await-in-loop`, `no-explicit-any`, `ban-ts-comment`, `no-namespace`, `no-non-null-assertion`, `no-dynamic-delete`, `unified-signatures`, `prefer-set-has`, mutating-array bans, and function-scoping advice. This is evidence against importing a maximal preset and calling it Effect quality: the Effect maintainers themselves tune broad lint defaults aggressively.

### TSGo policy is separate and currently non-blocking in this repository

The root [`tsconfig.base.json`](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/tsconfig.base.json#L34-L45) configures the Effect language-service namespace under the TSGo-patched compiler. It turns `globalErrorInEffectFailure` off, excludes Effect suggestions from `tsc`, and sets both `ignoreEffectWarningsInTscExitCode` and `ignoreEffectErrorsInTscExitCode` to `true`.

Therefore the canonical repository's current CI policy is not “every Effect TSGo diagnostic blocks.” Native TypeScript diagnostics still participate in the type-check job, while Effect-specific TSGo findings are configured not to determine its exit code. Effect Doctor may adopt a stricter benchmark-oriented policy, but each blocking promotion needs independent correctness evidence; it cannot be justified merely by saying the Effect repository blocks it.

## The five private `@effect/oxc` rules

The workspace package is `private: true`, version `0.0.0`, and described as an opinionated linting and formatting configuration for Effect. Although its manifest contains publish export metadata, it is not a stable public dependency surface. The [plugin registry](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/tools/oxc/src/oxlint/index.ts) exports exactly five rules.

### `effect/no-bigint-literals`

[Source](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/tools/oxc/src/oxlint/rules/no-bigint-literals.ts) reports every BigInt literal and replaces it with a `BigInt(...)` constructor call. It was added in commit [`90f7fd5`](https://github.com/Effect-TS/effect/commit/90f7fd5243871b30980964135db4512b8119fa82), alongside a repository-wide removal of BigInt literals, and is disabled in the root's test/example/documentation override.

This is a JavaScript compatibility or emitted-source policy, not an Effect semantic. Its current fixer also cannot safely be generalized: `9007199254740993n` becomes `BigInt(9007199254740993)`, whose numeric argument has already rounded to `9007199254740992`. The rule has no dedicated test file in the current `@effect/oxc` test tree.

**Disposition:** do not encode. A project that needs this compatibility policy should enable a native or dedicated generic rule with a semantics-preserving fixer.

### `effect/no-import-from-barrel-package`

[Source](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/tools/oxc/src/oxlint/rules/no-import-from-barrel-package.ts) rejects value imports from configured package roots and relative index modules. The canonical preset supplies patterns for `effect`, Effect subpackages, and `@effect/*`, then asks contributors to import concrete modules instead. Type-only imports are exempt.

This is internal monorepo architecture. The root override disables it for examples and AI docs, and the official AI docs themselves intentionally contain many consumer-facing barrel imports such as `import { Effect, Schema } from "effect"`; see, for example, the pinned [basic Effect example](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/ai-docs/src/01_effect/01_basics/01_effect-gen.ts#L1-L10). Enforcing the repository's internal dependency-shape rule on Effect users would contradict its instructional code.

**Disposition:** do not encode in Effect Doctor. At most, keep it as an opt-in contributor profile for the Effect monorepo itself, preserving its upstream identity.

### `effect/no-js-extension-imports`

[Source](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/tools/oxc/src/oxlint/rules/no-js-extension-imports.ts) rewrites `.js`, `.jsx`, `.mjs`, and `.cjs` suffixes in relative imports or re-exports to their TypeScript equivalents. That matches the repository's [`rewriteRelativeImportExtensions: true`](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/tsconfig.base.json#L10-L17) source-emission strategy.

This is module-resolution and build-tool policy. Extensionless imports, JavaScript-suffixed source imports, and TypeScript-suffixed imports can each be correct under different TypeScript, Node, Deno, and bundler configurations.

**Disposition:** do not encode. Leave it to TypeScript/module configuration or a separately named generic lint profile.

### `effect/no-opaque-instance-fields`

[Source](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/tools/oxc/src/oxlint/rules/no-opaque-instance-fields.ts) tracks import bindings and rejects non-static fields or methods on classes extending `Schema.Opaque`. This is the only custom `@effect/oxc` rule that represents a reusable Effect semantic.

However, the current TSGo provider already exposes the more authoritative type-aware `schemaOpaqueInstanceMember` diagnostic. Effect Doctor already maps that diagnostic, with provider provenance, to default-blocking `effect/schema-opaque-instance-member`. Running the private syntax rule as well would double count one defect and create inconsistent alias/import coverage.

**Disposition:** delegate to TSGo; do not add or rename a duplicate.

### `effect/no-unused-internal`

[Source](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/tools/oxc/src/oxlint/rules/no-unused-internal.ts) performs a workspace-wide TypeScript syntax scan. It reports unused `@internal` exports, public type signatures that expose internal declarations, and public re-exports of internal declarations. It was added in commit [`8800449`](https://github.com/Effect-TS/effect/commit/8800449a2c071e0617f1c4795e116fac274e6781), which also removed many unused internals.

The implementation is tightly coupled to this monorepo:

- it discovers only `.ts` files below `packages/**/src`;
- it resolves workspace packages by scanning `packages/**/package.json`;
- its resolver handles a small set of relative and workspace-package shapes rather than full TypeScript resolution; and
- its analysis cache is keyed only by working directory.

The contract is useful for library release hygiene, but it is neither Effect-specific nor portable to ordinary project layouts. It also overlaps the project-health layer more than the Effect-code layer.

**Disposition:** do not add to the core Effect quality score. Revisit only as a separately attributed, opt-in library API health check after generalizing module resolution, topology, cache invalidation, and adversarial fixtures.

## Implementation and history observations

The custom plugin directly uses `@oxlint/plugins`, with synchronous visitors and plain TypeScript logic. Four rules have dedicated unit suites—47 test cases total at the audited snapshot—built mostly from hand-constructed ESTree nodes. `no-unused-internal` additionally creates temporary filesystem fixtures. The tiny `no-bigint-literals` rule has no dedicated suite.

The team has also removed checks after trying them. A generated-model-backed `effect/jsdocs` Oxlint rule and its tests were deleted in commit [`65aa881`](https://github.com/Effect-TS/effect/commit/65aa881c0bed7093b231166d0e3f515b605319ee), and the lint script stopped generating that JSDoc model. This is useful negative evidence: a rule's historical presence in the Effect repository is not enough to make it current Effect guidance.

The repository migrated from the legacy language service to TSGo in commit [`caafeed`](https://github.com/Effect-TS/effect/commit/caafeed71471125b5729d3bca8e51f44749e5655). Current code still uses the language-service-shaped plugin configuration because TSGo patches the compiler integration, but the executable provider is `@effect/tsgo`.

## Recommendation matrix for Effect Doctor

| Official repository policy | Domain | Effect Doctor action | Reason |
| --- | --- | --- | --- |
| `no-bigint-literals` | Generic compatibility | Reject | Not Effect-specific; disabled in examples/tests; current fixer can change large values. |
| `no-import-from-barrel-package` | Effect monorepo architecture | Reject for normal scans | Official consumer examples use the barrel form this rule rejects. |
| `no-js-extension-imports` | Module/build policy | Delegate | Correct suffix policy depends on TypeScript and runtime configuration. |
| `no-opaque-instance-fields` | Effect Schema correctness | Use existing TSGo mapping | Already owned by `schemaOpaqueInstanceMember`; duplicate output would distort scoring. |
| `no-unused-internal` | Library API/project health | Optional future provider only | Valuable but generic and hard-coded to the canonical monorepo layout. |
| Native correctness/suspicious/perf categories | Generic JavaScript/TypeScript | Keep outside Effect score | Invoke native Oxlint if a general-code profile is desired; do not relabel it as Effect expertise. |
| Nineteen explicit native rules | Generic repository quality/style | Keep outside Effect score | They reveal the team's house policy, not Effect runtime semantics. |
| Effect TSGo diagnostics | Semantic/type-aware Effect | Preserve TSGo ownership | Pin metadata and provider identity; independently calibrate blocking status. |
| Removed JSDoc rule | Historical repository tooling | Do not resurrect | It is no longer part of the team's current lint pipeline. |

## Concrete next steps

1. Add no new first-party Effect Doctor rule from this audit.
2. Record `@effect/oxc` as official corpus evidence, not as a runtime dependency: the package is private and its policies are mostly repository-specific.
3. Keep `effect/schema-opaque-instance-member` mapped solely to TSGo and add a regression assertion that no first-party or community rule can double count the same native diagnostic.
4. If Effect Doctor later offers a general project-health profile, execute pinned native Oxlint rules under their native IDs. Do not mix those findings into the Effect-specific benchmark reward without a separately reported dimension.
5. Consider an opt-in “Effect library contributor” profile only if EffectBench gains tasks that explicitly modify the Effect monorepo. That profile should reproduce the repository configuration as an external policy rather than reimplement its rules under Effect Doctor names.
6. Monitor whether `@effect/oxc` becomes a published, supported package. Its current `private: true`, `0.0.0` manifest is not a provider contract.

## Primary source index

- Current snapshot: [`Effect-TS/effect@145d8e1`](https://github.com/Effect-TS/effect/tree/145d8e1013220425b8edf34f7011c73f73e1cdcf)
- Root Oxlint entrypoint: [`.oxlintrc.json`](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/.oxlintrc.json)
- Shared native and custom rule policy: [`packages/tools/oxc/oxlintrc.json`](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/tools/oxc/oxlintrc.json)
- Private plugin package: [`packages/tools/oxc/package.json`](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/tools/oxc/package.json)
- Custom plugin registry: [`packages/tools/oxc/src/oxlint/index.ts`](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/tools/oxc/src/oxlint/index.ts)
- Root scripts and versions: [`package.json`](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/package.json)
- TypeScript and Effect TSGo policy: [`tsconfig.base.json`](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/tsconfig.base.json)
- CI gate: [`.github/workflows/check.yml`](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/.github/workflows/check.yml)
- Oxc test harness and suites: [`packages/tools/oxc/test`](https://github.com/Effect-TS/effect/tree/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/tools/oxc/test)
