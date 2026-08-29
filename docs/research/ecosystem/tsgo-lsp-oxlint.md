# Effect TSGo and type-aware Oxlint integration audit

Audit date: 2026-08-30

Released baseline: [`@effect/tsgo@0.38.0`](https://github.com/Effect-TS/tsgo/releases/tag/%40effect%2Ftsgo%400.38.0), commit [`73b4c54`](https://github.com/Effect-TS/tsgo/commit/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9). Current upstream snapshot: [`f134c31`](https://github.com/Effect-TS/tsgo/commit/f134c316b685b70fc513d10ed9b7c899088667f5), dated 2026-08-28. All findings below come from the official Effect TSGo repository, the official release artifact, and the official Vite+ repository.

## Decision

Effect Doctor should continue to treat native `@effect/tsgo` diagnostics as the sole owner of type-aware Effect semantics. Its current integration—run the packaged native diagnostics protocol with an explicit rule policy, require the complete file inventory, validate versions, then normalize results—is the correct deterministic benchmark boundary.

The patched Oxlint integration is valuable for a developer-facing `oxlint` or `vp check` workflow. It should not replace Effect Doctor's native TSGo provider yet. Oxlint exposes the same Effect rule engine through generated adapters, but its report does not carry the standalone protocol's complete checked-file inventory or per-file detected/supported Effect version. Moving the verifier to that route would trade a fail-closed completeness proof for one fewer top-level command without eliminating the type-aware compiler work.

Effect Doctor must not reimplement TSGo rules as JavaScript Oxlint rules. It may orchestrate TSGo, select policy, verify completeness, normalize provenance, compare projects, and add narrow syntax-only rules outside TSGo's ownership.

## What “Effect rules in Oxlint” means

`@effect/tsgo` is a patched, pinned superset of TypeScript-Go, not a JavaScript language-service wrapper. The same Go rule implementations power the editor, `tsc`, the dedicated diagnostics command, and the Oxlint integration. The official [README](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/README.md) explicitly says to use Effect TSGo instead of running it alongside another `tsgo` server.

The Oxlint route is assembled as follows:

1. The checked-in [diagnostic metadata](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/_packages/tsgo/src/metadata.json) is the source for generated rule identities, categories, default severities, Effect-version support, examples, diagnostic codes, and fixability.
2. The [code generator](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/_tools/repoctl/src/codegen.ts) creates one tsgolint adapter and one native Oxlint registration per rule. Language-service camel-case names become qualified `effecttsgo/kebab-case` names.
3. The [tsgolint patch](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/_patches/tsgolint/001-effect-rules.patch) registers those adapters. Each adapter receives tsgolint's existing `Program`, `TypeChecker`, and `SourceFile` and calls the public [Effect Oxlint runner](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/etsoxlintrunner/runner.go).
4. The runner invokes the ordinary Effect rule runner, forces only the requested rule on, converts diagnostics and related locations, and exposes fixes lazily. It deliberately omits the language-service-only “disable this diagnostic” code action from Oxlint suggestions.
5. The [Oxlint patch](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/_patches/oxlint/001-effect-plugin.patch) adds the `effecttsgo` native plugin, preserves qualified names through tsgolint, maps related diagnostics to labels, respects `oxlint-disable` directives, links findings to official rule docs, and gives every result `effecttsgo(rule-name)` provenance.
6. `effect-tsgo patch --oxlint` replaces the compatible installed Oxlint native binding and tsgolint executable with packaged Effect builds and patches Oxlint's TypeScript declarations with the generated plugin/rule names. Originals are backed up for `effect-tsgo unpatch --oxlint`; this is binary replacement, not ordinary runtime plugin loading.

This architecture is important for ownership: an `effecttsgo/*` result seen in Oxlint is still an Effect TSGo semantic diagnostic. Copying it into Effect Doctor's JavaScript plugin would lose type identity, flow analysis, Effect-version gates, and the upstream fix implementation while creating two definitions of the same rule.

## Supported ways to run it

| Route | Invocation and configuration | Properties |
| --- | --- | --- |
| TypeScript / editor | `npx @effect/tsgo setup`, then use the `@effect/language-service` tsconfig plugin and the packaged TypeScript-Go server. | Type checking and Effect diagnostics share one program. Incremental compiler output can be reused. Editor quick fixes, refactors, hover, completion, goto, and rename features are available. Do not run another `tsgo` server beside it. |
| Dedicated diagnostics | `npx @effect/tsgo diagnostics --project tsconfig.json --format json --list-files`; `--strict`, `--severity`, `--progress`, and inline `--lspconfig` are also supported. | Stable machine-readable diagnostics plus summary and, with `--list-files`, the exact checked files and detected/supported Effect major version. It creates a type-aware program again. The [native protocol](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/etsdiagnostics/diagnostics.go) reports locations, severity, diagnostic code, rule name, message, counts, and file versions; it does not include code actions. |
| Patched Oxlint | Install versions supported by the selected TSGo release, run `effect-tsgo patch --oxlint`, extend the shipped recommended/category preset or enable `options.typeAware`, `plugins: ["effecttsgo"]`, and individual rules, then run Oxlint normally. | Uses Oxlint's tsgolint backend and the same semantic rules. It supports Oxlint directives, related labels, rule-doc URLs, and lazy suggestions. The official [setup guide](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/docs/README.md) recommends disabling LSP diagnostics if Oxlint reports them, avoiding duplicate findings. |
| Vite+ | Let `@effect/tsgo` discover and patch the Oxlint and tsgolint packages nested under `vite-plus`; configure the Effect Oxlint preset/rules, then use `vp check`. | Setup avoids adding redundant direct Oxlint dependencies when Vite+ is installed. Vite+'s [`vp check`](https://github.com/voidzero-dev/vite-plus/blob/3380eb8692c4b60fa7e90aefa8c077b5e7d24163/docs/guide/check.md) runs formatting, linting, and optionally TypeScript checking through the Oxlint/tsgolint type-aware path. Effect TSGo's Vite+ work is dependency discovery, version compatibility, and binary patching; it does not independently add Effect rules to `vite.config.ts`. |

The Oxlint preset itself turns on `options.typeAware` and `plugins: ["effecttsgo"]`, so a project extending it does not also need a CLI `--type-aware` flag. Every Effect TSGo rule nevertheless requires type-aware mode; there is no syntax-only fallback.

## Released diagnostic surface

The `0.38.0` metadata contains **99 rules** and **43 fixable rules**:

| Category | Rules |
| --- | ---: |
| Correctness | 18 |
| Anti-pattern | 20 |
| Effect-native | 22 |
| Style | 39 |
| **Total** | **99** |

The language-service defaults enable 64 of the 99: 13 errors, 15 warnings, and 36 suggestions. The 13 released default errors are class self mismatch, implicit-any Effect callbacks, floating Effects in ordinary code and Vitest, missing Effect context/error, missing Layer context, missing `return yield*`, bare `yield` in a generator, non-object service types, overridden Schema constructors, non-finite Schema literals, and instance members on `Schema.Opaque`.

Oxlint maps Effect error severity to `error` and warning/suggestion/message to `warn`. Category presets enable every rule in a category at `warn`; the intended recommended preset is the union of non-off defaults and the Effect-native preset, with existing errors retained.

### Release artifact nuance

The published `0.38.0` [recommended preset](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/oxlint-presets/recommended.json) contains 82 rules (13 errors and 69 warnings), and its [style preset](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/oxlint-presets/style.json) contains 36. The release metadata marks three new `0.38.0` style rules—`allOfMapToForEach`, `catchDieToOrDie`, and `mapSomeToAsSome`—as default suggestions, but neither published preset includes them. The source generator would include them, so this is observable generated-artifact drift in the tagged release, not a policy difference documented by the project.

Current `main` has moved again: [`preferSucceedSomeOrNone`](https://github.com/Effect-TS/tsgo/commit/4e14641a0ef47ecdfe2223bf527f337f36443c94) and [`optionMatchToFromOption`](https://github.com/Effect-TS/tsgo/commit/f134c316b685b70fc513d10ed9b7c899088667f5) bring metadata to 101 rules, while the just-added latter rule has not yet reached the checked-in presets. This reinforces two integration rules for Effect Doctor:

- pin a released package and its exact source metadata rather than following `main`;
- derive the catalog from metadata, then drift-check the installed schema and provider output instead of treating a convenience preset as the rule inventory.

Effect Doctor already follows both rules. Its `0.38.0` catalog contains all 99 upstream identities while its default policy deliberately enables only the 28 upstream error/warning defaults. Suggestion-level style and Effect-native preferences remain discoverable without silently becoming benchmark requirements.

## Performance implications

Type-aware Effect diagnostics necessarily pay for TypeScript program construction and checker queries. The official README distinguishes the three costs:

- running through `tsc` shares the existing typecheck and incremental build information;
- the dedicated diagnostics command creates the program and typechecks again;
- patched Oxlint runs through its tsgolint type-aware backend rather than becoming a syntax-only scan.

The upstream project has materially optimized the rule overhead. The `0.36.2` changelog records three measured changes on a large Effect monorepo:

- a conservative declared-type prefilter removed about 10% of build wall time, approximately 2.7 seconds of a 26.8-second run;
- extending that prefilter to calls removed a further 4.6% of wall time and brought Effect diagnostic overhead to about 17% versus pristine TSGo at the same commit;
- skipping rules below the caller's minimum visible severity removed roughly another 1–2 seconds in CLI modes that omit suggestions.

These are upstream benchmark observations, not a promise for arbitrary repositories. They explain two useful Doctor choices: keep suggestion-level TSGo rules off in the benchmark default, and invoke one complete native TSGo analysis per project rather than separately running `tsc`, the dedicated diagnostics command, and patched Oxlint Effect rules.

Patched Oxlint may be faster for a human project's consolidated lint/typecheck command, especially through Vite+, but it does not eliminate tsgolint or the semantic program. For Effect Doctor, the patched route would also lose the explicit `filesChecked`, `totalFiles`, file list, and Effect-version records currently used to fail closed. A future performance experiment should compare end-to-end scans on the same corpus before changing providers; top-level process count alone is not evidence of lower total cost.

## Compatibility and operational constraints

For `@effect/tsgo@0.38.0`, the authoritative [component manifest](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/_packages/tsgo/upstream.json) permits:

- TypeScript `7.0.2` or `7.1.0-dev.20260826.1`;
- Oxlint `1.79.0` or `1.80.0`;
- `oxlint-tsgolint` `7.0.2001`;
- the Vite+ `0.3.0` runtime profile, which uses Oxlint `1.79.0` and `oxlint-tsgolint` `7.0.2001`.

The patcher validates exact supported component versions before replacing binaries. Its [discovery code](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/_packages/tsgo/src/patcher/discovery.ts) finds direct Oxlint dependencies and copies nested under Vite+. The experimental Oxlint replacement supports macOS, Windows, and glibc Linux on x64 or arm64; its discovery rejects musl Linux and other architectures. The TypeScript platform package matrix is broader than the Oxlint patch matrix, so “Effect TSGo runs here” does not imply “the Effect Oxlint patch runs here.”

TypeScript 7 native is still required beside `@effect/tsgo`. The project primarily targets Effect v4 while individual metadata entries declare v3, v4, or both; the dedicated protocol's file-version records allow callers to reject a diagnostic emitted for an unsupported major. An [open pnpm issue](https://github.com/Effect-TS/tsgo/issues/383) reports that optional platform packages may not be installed in one setup path; it is a user-reported unresolved compatibility caveat, not a documented limitation of every pnpm install.

Because patching mutates installed native artifacts, dependency installation can restore originals. The official setup therefore writes a `prepare` command and provides a symmetric `unpatch`. Effect Doctor should continue resolving its own pinned native package rather than patching the benchmark subject's dependency tree.

## Effect Doctor ownership boundary

| Delegate to Effect TSGo | Effect Doctor may own |
| --- | --- |
| Type identity, assignability, overload resolution, control/data flow, Effect success/error/context channels, Layer service graphs, package-version detection, and v3/v4 API semantics. | Resolve and validate an exact packaged TSGo toolchain. |
| All `effecttsgo/*` rule definitions, diagnostic codes, messages, default severities, supported Effect versions, related locations, and code actions. | Select a benchmark policy independently from upstream convenience presets and pass the complete severity map inline. |
| The native TypeScript/Oxlint/tsgolint compatibility matrix and platform binaries. | Run TSGo and syntax-oriented Oxlint work concurrently, with separate provider provenance. |
| Semantic quick fixes and refactors. | Validate exit status, JSON schema, summary counts, exact analyzed-file inventory, supported Effect major, immutable source digests, and tool versions. |
| Deciding whether a proposed semantic rule belongs upstream. | Normalize findings, create stable fingerprints, render one report, and compare baseline versus candidate projects. |
| Effect-specific facts that cannot be proven from local syntax without the checker. | Narrow import-aware, lexical, host-neutral rules for contracts outside TSGo, each with adversarial fixtures and corpus calibration. |

The current [TSGo adapter](../../../src/internal/tsgo.ts) already uses the best public machine seam: it invokes the packaged native protocol with JSON, `listFiles`, and a full inline severity policy. The [toolchain resolver](../../../src/internal/toolchain.ts) validates the TSGo package, matching platform package, TypeScript version and git head, and executable containment. That is stronger for a benchmark verifier than calling `npx`, relying on a user's patched install, or parsing pretty output.

The following changes would weaken the product and should be rejected:

- encoding existing TSGo guidance again in the first-party Oxlint plugin;
- enabling the upstream recommended preset wholesale and thereby turning suggestion-level preferences into benchmark warnings;
- running both the dedicated TSGo provider and patched Oxlint `effecttsgo/*` rules, which duplicates semantic findings and type-aware work;
- following TSGo `main` metadata without a released package and matching platform artifacts;
- accepting an Oxlint-only “clean” result without a proof that its tsgolint backend checked every planned file.

## Recommended follow-up

1. Keep the native `0.38.0` TSGo provider for the current Effect Doctor release.
2. Preserve the generated 99-rule inventory and the narrower 28-rule default policy as separate concepts.
3. Add the two post-release rules only when a new `@effect/tsgo` release ships matching metadata, schema, platform packages, and supported-version manifest.
4. Keep catalog generation checks sensitive to metadata/preset/schema divergence; the `0.38.0` preset omission demonstrates that this is a real failure mode.
5. If startup time remains material, prototype the patched-Oxlint route behind a non-default adapter and require parity on diagnostics, exact file coverage, Effect-version gates, and end-to-end timing before considering it for benchmark runs.
6. For ordinary application repositories, document the patched Oxlint/Vite+ route as a convenient developer workflow. It complements Effect Doctor; it does not redefine Doctor's semantic ownership boundary.

## Primary sources

- Effect TSGo `0.38.0`: [release](https://github.com/Effect-TS/tsgo/releases/tag/%40effect%2Ftsgo%400.38.0), [README](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/README.md), [Oxlint setup](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/docs/README.md), [metadata](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/_packages/tsgo/src/metadata.json), [component manifest](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/_packages/tsgo/upstream.json), and [changelog](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/_packages/tsgo/CHANGELOG.md).
- Official implementation: [native diagnostics protocol](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/etsdiagnostics/diagnostics.go), [Oxlint runner](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/etsoxlintrunner/runner.go), [rule code generation](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/_tools/repoctl/src/codegen.ts), [Oxlint patch](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/_patches/oxlint/001-effect-plugin.patch), [tsgolint patch](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/_patches/tsgolint/001-effect-rules.patch), and [binary discovery](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/_packages/tsgo/src/patcher/discovery.ts).
- Official Vite+ [`vp check` guide](https://github.com/voidzero-dev/vite-plus/blob/3380eb8692c4b60fa7e90aefa8c077b5e7d24163/docs/guide/check.md).
