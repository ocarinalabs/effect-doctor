# Official Effect organization lint survey

## Question

What linting and static-analysis machinery does the Effect team itself use, and which parts should become Effect Doctor policy rather than ordinary project lint?

This is a source audit of the public `Effect-TS` organization at the default-branch heads retrieved on 2026-08-30. It prioritizes the canonical Effect v4 monorepo, TSGo, the language service, official examples and skills, and currently active Effect applications. Assertions below link to immutable Git commit permalinks.

## Executive conclusion

The official organization has two distinct Effect-specific analyzers:

1. **`@effect/tsgo` is the semantic owner.** Its current source exposes Effect diagnostics to TypeScript and, experimentally, as type-aware `effecttsgo/*` Oxlint rules. The checked-in recommended Oxlint preset enables type-aware analysis and 86 rules; category presets split correctness, anti-pattern, Effect-native, and style checks. The setup guide requires compatible, pinned `@effect/tsgo`, `oxlint`, and `oxlint-tsgolint` versions and patches Oxlint before use. ([TSGo overview](https://github.com/Effect-TS/tsgo/blob/f134c316b685b70fc513d10ed9b7c899088667f5/README.md), [Oxlint setup](https://github.com/Effect-TS/tsgo/blob/f134c316b685b70fc513d10ed9b7c899088667f5/docs/README.md), [recommended preset](https://github.com/Effect-TS/tsgo/blob/f134c316b685b70fc513d10ed9b7c899088667f5/oxlint-presets/recommended.json))
2. **The canonical Effect monorepo has a small, private `@effect/oxc` JavaScript plugin for repository-local syntax and structure.** It contains five rules: no bigint literals, no imports through configured barrel packages, no JavaScript extensions in relative source imports, no instance fields on `Schema.Opaque`, and no unused internal exports. ([plugin registry](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/tools/oxc/src/oxlint/index.ts), [package metadata](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/tools/oxc/package.json))

Effect Doctor should continue to consume the full TSGo and `oxlint-plugin-effect` inventories as providers, not reimplement them. Of the five monorepo-local `@effect/oxc` rules, only the `Schema.Opaque` check expresses general Effect semantics, and TSGo already owns the more accurate type-aware version. The other four encode repository layout, source-emission, compatibility, or maintenance policy and should not silently become universal Effect quality rules.

## The canonical Effect v4 monorepo

Effect v4 core, Platform, SQL, RPC, and CLI now share one repository and one root lint policy. Platform and SQL are workspace package families, while CLI and RPC live under `effect/unstable`; there are not separate current repositories or separate lint configurations to merge. ([workspace declaration](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/pnpm-workspace.yaml), [CLI tree](https://github.com/Effect-TS/effect/tree/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/effect/src/unstable/cli), [RPC tree](https://github.com/Effect-TS/effect/tree/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/effect/src/unstable/rpc), [Platform packages](https://github.com/Effect-TS/effect/tree/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/platform), [SQL packages](https://github.com/Effect-TS/effect/tree/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/sql))

The root command is `oxlint -f unix && dprint check`; CI runs that command in a dedicated blocking lint job. Type checking is separate. The prepare hook patches TypeScript with `effect-tsgo patch`, but does not request the experimental Oxlint patch. ([root scripts and dependencies](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/package.json), [CI check workflow](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/.github/workflows/check.yml))

The root Oxlint file extends the internal `@effect/oxc` configuration, loads it as a JavaScript plugin, and turns off selected rules for tests, examples, benchmarks, scripts, and scratchpad code. Its shared base enables Oxlint's `correctness`, `suspicious`, and `perf` categories, then adds import hygiene, TypeScript cleanup, and a few code-quality rules. ([root `.oxlintrc.json`](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/.oxlintrc.json), [`@effect/oxc` configuration](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/tools/oxc/oxlintrc.json))

The five custom rules have materially different scopes:

| Rule | What the source enforces | Effect Doctor disposition |
| --- | --- | --- |
| `effect/no-bigint-literals` | Replaces bigint literals with `BigInt(...)`. ([source](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/tools/oxc/src/oxlint/rules/no-bigint-literals.ts)) | **Do not adopt.** This is JavaScript target/compatibility policy, not an Effect correctness property. |
| `effect/no-import-from-barrel-package` | Rejects configured package-root and relative index value imports, while exempting type-only imports. The Effect configuration targets `effect`, `@effect/*`, and relative index modules. ([source](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/tools/oxc/src/oxlint/rules/no-import-from-barrel-package.ts), [configuration](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/tools/oxc/oxlintrc.json)) | **Research-only candidate, at most advisory.** Direct module imports are useful guidance, but package roots are legitimate public APIs and the official rule is parameterized around this monorepo's layout. A universal rule needs separate provenance and false-positive calibration. |
| `effect/no-js-extension-imports` | Rewrites relative `.js`/`.jsx`/`.mjs`/`.cjs` specifiers to TypeScript extensions. ([source](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/tools/oxc/src/oxlint/rules/no-js-extension-imports.ts)) | **Do not adopt.** It relies on this repository's TypeScript 7 `rewriteRelativeImportExtensions` source convention; other valid NodeNext projects intentionally author `.js` specifiers. ([compiler configuration](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/tsconfig.base.json)) |
| `effect/no-opaque-instance-fields` | Syntactically tracks Effect Schema imports and rejects instance properties or methods on `Schema.Opaque` classes. ([source](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/tools/oxc/src/oxlint/rules/no-opaque-instance-fields.ts)) | **Already covered upstream.** TSGo's type-aware `schemaOpaqueInstanceMember` diagnostic owns this contract; do not add a duplicate syntax rule. ([TSGo rule documentation](https://github.com/Effect-TS/tsgo/blob/f134c316b685b70fc513d10ed9b7c899088667f5/docs/rules/schema-opaque-instance-member.md)) |
| `effect/no-unused-internal` | Walks this repository's `packages/**/src` tree and builds a workspace-wide TypeScript model of `@internal` and internal-path exports. ([source](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/tools/oxc/src/oxlint/rules/no-unused-internal.ts)) | **Do not adopt.** Its filesystem and workspace assumptions are explicitly monorepo-specific. Dead-code tooling belongs at project level. |

The TypeScript configuration also enables the Effect language-service plugin but explicitly prevents Effect warnings and errors from affecting `tsc`'s exit code and disables suggestions in `tsc`. It turns off `globalErrorInEffectFailure` with a TODO. This is strong evidence that “the Effect team uses a rule” is not equivalent to “the rule should block every project.” ([`tsconfig.base.json`](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/tsconfig.base.json))

## TSGo and the language-service transition

TSGo is the current semantic rule source. Its current package describes itself as the Effect Language Service for TypeScript-Go and ships the binary, JSON schemas, and Oxlint presets. ([package metadata](https://github.com/Effect-TS/tsgo/blob/f134c316b685b70fc513d10ed9b7c899088667f5/_packages/tsgo/package.json))

The Oxlint integration is not an unrelated second implementation. Effect maintains patches that register generated adapters in `oxlint-tsgolint` and preserve qualified `effecttsgo/*` identities through the Oxlint protocol. ([Oxlint patch notes](https://github.com/Effect-TS/tsgo/blob/f134c316b685b70fc513d10ed9b7c899088667f5/_patches/oxlint/README.md), [`oxlint-tsgolint` patch notes](https://github.com/Effect-TS/tsgo/blob/f134c316b685b70fc513d10ed9b7c899088667f5/_patches/tsgolint/README.md)) This means Effect Doctor should maintain one stable mapping to TSGo identities, regardless of whether it invokes the diagnostic CLI or a patched Oxlint transport.

The repository's own test suite verifies discovery of Oxlint binaries nested under `vite-plus`, so Vite+ is a supported installation shape, not a different ruleset. ([integration test](https://github.com/Effect-TS/tsgo/blob/f134c316b685b70fc513d10ed9b7c899088667f5/_packages/tsgo/test/experimental-oxlint.test.ts))

The older `Effect-TS/language-service` repository remains useful provenance, but its linting is conventional ESLint plus `@effect/eslint-plugin`'s dprint configuration. Its Effect semantics live in the language-service diagnostics configured through TypeScript, not in ESLint rules. ([ESLint config](https://github.com/Effect-TS/language-service/blob/5e4d380b6fcd20f048dd8d41515bcd9ea47ffda4/eslint.config.mjs), [package scripts](https://github.com/Effect-TS/language-service/blob/5e4d380b6fcd20f048dd8d41515bcd9ea47ffda4/packages/language-service/package.json), [v4 harness configuration](https://github.com/Effect-TS/language-service/blob/5e4d380b6fcd20f048dd8d41515bcd9ea47ffda4/packages/harness-effect-v4/tsconfig.json))

## What official applications actually enable

The public applications show a deliberately layered setup rather than one universal preset:

| Repository | Configuration observed | Implication |
| --- | --- | --- |
| `discord-bot` | Runs ordinary Oxlint correctness/suspicious/perf categories and import/type-style rules. It patches TSGo for TypeScript and explicitly enables the Effect-native language-service diagnostics for async functions, globals such as console/date/fetch/random/timers, native errors and promises, Node built-ins, JSON, environment access, and unsafe Effect type assertions. ([Oxlint config](https://github.com/Effect-TS/discord-bot/blob/7453fae0cd31e2ce7703742eac9e2e5e36056366/.oxlintrc.json), [scripts](https://github.com/Effect-TS/discord-bot/blob/7453fae0cd31e2ce7703742eac9e2e5e36056366/package.json), [TS config](https://github.com/Effect-TS/discord-bot/blob/7453fae0cd31e2ce7703742eac9e2e5e36056366/tsconfig.base.json)) | Effect-native diagnostics are used in real team code, but as an explicit project choice. They are good advisory coverage; correctness tiering must remain separate. |
| `slopcop` | Uses Vite+ with type-aware and type-checking lint enabled, plus Vite+'s own JavaScript plugin. Its TypeScript plugin enables a smaller Effect-native subset. The prepare script patches TSGo, but the inspected Vite+ configuration does not register `effecttsgo`. ([Vite+ config](https://github.com/Effect-TS/slopcop/blob/48090864b18272182004b44b89ba4a003ffe3281/vite.config.ts), [TS config](https://github.com/Effect-TS/slopcop/blob/48090864b18272182004b44b89ba4a003ffe3281/tsconfig.base.json), [scripts](https://github.com/Effect-TS/slopcop/blob/48090864b18272182004b44b89ba4a003ffe3281/package.json)) | Support Vite+ project layouts, but do not infer that Vite+'s generic lint choices are Effect Doctor rules. Direct TSGo invocation remains the least project-coupled transport. |
| `website` | Uses Vite+ type-aware/type-checking lint with generic TypeScript/import rules and uses the older language service for Effect diagnostics. It ignores Effect warnings and errors in the `tsc` exit code and disables one Effect diagnostic. ([Vite+ config](https://github.com/Effect-TS/website/blob/366419b44eb2bd353cbe3d3e41fa4e8c735e63ee/vite.config.ts), [scripts](https://github.com/Effect-TS/website/blob/366419b44eb2bd353cbe3d3e41fa4e8c735e63ee/package.json), [TS config](https://github.com/Effect-TS/website/blob/366419b44eb2bd353cbe3d3e41fa4e8c735e63ee/tsconfig.base.json)) | Again, provider diagnostics are broader than blocking policy. |

None of these application configs uses Biome at the inspected commits. Vite+ and Oxlint are the visible direction for current v4 projects; older organization repositories remain mostly on ESLint.

## Older and supporting repositories

`@effect/eslint-plugin` is not a semantic Effect rule collection comparable to TSGo. At the inspected commit it exports only a dprint bridge and `no-import-from-barrel-package`. ([plugin registry](https://github.com/Effect-TS/eslint-plugin/blob/44bba8afb40ad3f36be7acc35d70afe067e424f9/src/plugin.ts), [barrel-import rule](https://github.com/Effect-TS/eslint-plugin/blob/44bba8afb40ad3f36be7acc35d70afe067e424f9/src/rules/no-import-from-barrel-package.ts), [package metadata](https://github.com/Effect-TS/eslint-plugin/blob/44bba8afb40ad3f36be7acc35d70afe067e424f9/package.json))

The official `examples` repository and its basic, CLI, and monorepo templates use ESLint, `@effect/eslint-plugin` for dprint, and generic import/TypeScript rules. They target Effect v3-era package versions at the inspected commit, so they are useful style history but not current v4 semantic policy. ([root config](https://github.com/Effect-TS/examples/blob/91e24b045af2bcdbeb2e78e075825ed20a0038a7/eslint.config.mjs), [basic template package](https://github.com/Effect-TS/examples/blob/91e24b045af2bcdbeb2e78e075825ed20a0038a7/templates/basic/package.json), [CLI template package](https://github.com/Effect-TS/examples/blob/91e24b045af2bcdbeb2e78e075825ed20a0038a7/templates/cli/package.json))

`effect-smol` should not be treated as a second current source: its README says Effect v4 moved into the canonical `effect` repository. Its historical Oxlint plugin briefly included an Effect-public-API JSDoc model rule in addition to the five rules above. That rule depends on generated repository metadata and belongs to documentation/API maintenance, not application quality. ([archive notice](https://github.com/Effect-TS/effect-smol/blob/3a1128c7684e04d34d9f541f77adaac38a513056/README.md), [historical plugin registry](https://github.com/Effect-TS/effect-smol/blob/3a1128c7684e04d34d9f541f77adaac38a513056/packages/tools/oxc/src/oxlint/index.ts), [JSDoc rule](https://github.com/Effect-TS/effect-smol/blob/3a1128c7684e04d34d9f541f77adaac38a513056/packages/tools/oxc/src/oxlint/rules/jsdocs.ts))

The official `skills` repository contains Markdown agent instructions and deliberately redirects the main Effect skill to the guidance installed with the user's Effect version; it has no independent lint runtime to ingest. ([skills README](https://github.com/Effect-TS/skills/blob/2309e6f27d9955b434c0e3f394b945c136e89fd2/README.md))

## Shared patterns that are ordinary project lint

Across the canonical monorepo, older ESLint projects, and Vite+ applications, recurring non-Effect policies include:

- TypeScript strictness, unused-symbol checks, exact optional properties, and project references;
- type-only import consistency and duplicate/self-import prevention;
- formatter ownership of layout;
- generic Oxlint correctness, suspiciousness, and performance categories;
- no `console` in library source, with explicit exemptions in tests and scripts;
- repository-specific import boundaries and generated-code freshness.

These are valuable baseline engineering checks, but they are not evidence of Effect misuse. Effect Doctor should report them only when an existing provider deliberately exposes an Effect-specific contract. Otherwise they belong in Ultracite/Oxlint/Vite+/TypeScript/Fallow or the target repository's CI.

## Anomalies and cautions

- The canonical monorepo's `@effect/oxc` package is marked `private`, so consuming it as a published stable provider is not currently available even though its metadata includes publish-oriented fields. ([package metadata](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/tools/oxc/package.json))
- The monorepo pins `@effect/tsgo` `^0.36.5`, while the inspected TSGo source identifies `0.38.0`. Official repositories do not all move in lockstep; Effect Doctor must pin and receipt exact analyzer versions instead of following mutable repository `main`. ([Effect dependency](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/package.json), [TSGo package](https://github.com/Effect-TS/tsgo/blob/f134c316b685b70fc513d10ed9b7c899088667f5/_packages/tsgo/package.json))
- The Effect root config points its Oxlint schema at Oxc's mutable `main` URL. That is acceptable for editor schema help but not a reproducibility model for a benchmark verifier. ([root `.oxlintrc.json`](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/.oxlintrc.json))
- `discord-bot`'s `check` script runs Oxlint with `--fix` before type checking. Effect Doctor should remain read-only even when a source repository combines checking and mutation. ([scripts](https://github.com/Effect-TS/discord-bot/blob/7453fae0cd31e2ce7703742eac9e2e5e36056366/package.json))
- Official applications enable different diagnostic subsets and sometimes suppress their exit impact. Popularity or first-party authorship is therefore provenance, not an automatic blocking threshold.

## Recommended Effect Doctor actions

1. **Keep TSGo as the sole type-aware semantic provider.** Track released metadata and diagnostic codes, preserve provider rule identity, and do not create JS Oxlint copies of TSGo rules.
2. **Keep `oxlint-plugin-effect` as the broad syntax/local provider.** Reconcile its inventory separately from `@effect/oxc`; similar names are not sufficient reason to fork or rename a rule.
3. **Do not vendor the private `@effect/oxc` plugin wholesale.** Four of five rules are project policy; the remaining Schema rule is already covered by TSGo.
4. **Open one calibrated research item for direct module imports.** Test only the narrow claim that named value imports from Effect barrel entry points reduce clarity or harm bundling. Require official guidance or merged-fix provenance plus adversarial fixtures before enabling it, and preserve legitimate namespace imports and type imports.
5. **Treat Effect-native diagnostics as advisory unless their individual contract establishes correctness.** The official applications show these rules are useful, but also show that teams opt into subsets.
6. **Support Vite+ as project topology, not as a third analyzer.** TSGo already tests Vite+ dependency discovery; Effect Doctor's black-box execution should continue to use its pinned provider toolchain rather than mutating a project's installed binaries.
7. **Leave generic quality checks to the surrounding toolchain.** TypeScript strictness, formatter consistency, generic Oxlint categories, dead code, circular dependencies, and repository-specific generation checks should not inflate the Effect-specific score.

The practical result is intentionally conservative: the organization survey validates Effect Doctor's current provider boundaries and yields one narrow candidate for further calibration, not a new batch of duplicated rules.
