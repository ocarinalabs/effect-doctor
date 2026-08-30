# Effect Oxlint landscape

Audit date: 2026-08-30

## Decision

Effect Doctor should keep `cevr/effect-oxlint`'s published
`oxlint-plugin-effect@0.11.0` as its curated syntax provider. It should not add
`mpsuesser/effect-oxlint` as a second provider: that package is an Effect-native
rule-authoring SDK with **zero diagnostic rules**, not a competing ruleset. The
same author's separate `@mpsuesser/oxlint-plugin-effect@0.4.3` does contain 57
rules, but it should not be imported wholesale. Its catalog substantially
duplicates the providers Effect Doctor already orchestrates, mixes universal
Effect concerns with project conventions, targets an older Effect v4 beta, and
has no real-Oxlint or corpus calibration suite.

Two non-duplicative contracts are worth clean-room research, but neither
community implementation is admissible as written:

1. **A direct `throw` in a confirmed Effect generator.** Effect's generator
   interpreter catches the exception and converts it to `die`, so an advisory
   can make an implicit defect explicit. The rule must resolve the real Effect
   binding, respect nested function boundaries, support named/curried
   `Effect.fn`, and allow an intentional defect expression
   ([Effect generator interpreter](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/internal/effect.ts)).
2. **An unscoped Effect `FileSystem.makeTempFile` or `makeTempDirectory`
   acquisition that can be proven to leak despite an available scope.** The
   current rule also bans every `os` import and matches those method names on
   any receiver. A Doctor candidate would have to resolve the actual
   `effect/FileSystem` service binding, prove the lifetime, and allow
   intentional manual ownership. Effect's installed RC documents the scoped
   variants as the same operations with automatic cleanup
   ([Effect `FileSystem.ts`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/FileSystem.ts)).

A third opportunity is an extension of the existing
`prefer-config-redacted` identity for literal secret-shaped fields inside
`Config.schema(Schema.Struct(...))`; it must preserve validators such as
`Config.nonEmptyString`, not mechanically replace them. Everything else in the
57-rule catalog is already owned, only a style/architecture preference, or
requires a stronger contract before it can become a Doctor finding. The
practical outcome is a small research queue, not 57 rules to ingest.

## Scope and method

This audit distinguishes three artifacts that their similar names make easy to
confuse:

| Artifact | Pinned release | What it is |
| --- | --- | --- |
| `cevr/effect-oxlint` | [`oxlint-plugin-effect@0.11.0`, `f3464b3`](https://github.com/cevr/effect-oxlint/releases/tag/v0.11.0), published 2026-08-22 | A 40-rule, non-type-aware Effect syntax plugin and the provider Effect Doctor already uses. |
| `mpsuesser/effect-oxlint` | [`effect-oxlint@0.3.4`, `d8c892f`](https://github.com/mpsuesser/effect-oxlint/releases/tag/v0.3.4), published 2026-08-28 | An Effect-based SDK for authoring Oxlint JavaScript rules; it ships no rules. |
| `mpsuesser/oxlint-plugin-effect` | [`@mpsuesser/oxlint-plugin-effect@0.4.3`, `9460e66`](https://github.com/mpsuesser/oxlint-plugin-effect/releases/tag/v0.4.3), published 2026-07-23 | A separate, opinionated 57-rule consumer of the SDK. |

The repositories were inspected at those immutable revisions. Their locked
test suites were also run in clean temporary clones:

- `cevr/effect-oxlint`: 8 files, 66 tests, 219 assertions, all passing;
- `mpsuesser/effect-oxlint`: 11 files, 260 tests, all passing;
- `mpsuesser/oxlint-plugin-effect`: 57 rule test files, 429 tests, all passing.

Passing unit tests establish that the pinned sources behave as their authors
expect. They do not by themselves establish low false-positive rates on real
Effect repositories. The sections below separate source facts, observed test
coverage, and Effect Doctor recommendations.

Two additional real-parser calibration probes were run for the companion
plugin:

- a fixture with local objects named `Effect`, `Config`, `Math`, `Date`,
  `console`, `process`, `JSON`, `Option`, `fs`, and `Schema` produced 13 reports
  from 13 exercised rules, even though none of those names referred to the
  imported APIs the rules intended to police;
- all 57 rules against the Effect 4.0.0-rc.112 source tree, excluding generated
  Swagger code, produced 12,679 findings from 36 rules across 371 files.

The first measurement is a direct shadowing false-positive probe. The second
does **not** prove that all 12,679 findings are false; it demonstrates that the
all-error preset is not a calibrated universal definition of good Effect code,
because it rejects the implementation and documentation of the Effect version
Doctor itself targets at very high volume.

## Side-by-side comparison

| Dimension | `cevr/oxlint-plugin-effect` | `mpsuesser/effect-oxlint` SDK | `@mpsuesser/oxlint-plugin-effect` companion |
| --- | --- | --- | --- |
| Diagnostic catalog | 40 rules ([registry](https://github.com/cevr/effect-oxlint/blob/f3464b3a1c3cacf55965ed2aa273b4accd715bfa/src/rules/index.ts)) | 0 rules; consumers supply a rule map ([exports](https://github.com/mpsuesser/effect-oxlint/blob/d8c892f4fedc072409dca290ac44733bf5dc3e87/src/index.ts)) | 57 rules ([registry](https://github.com/mpsuesser/oxlint-plugin-effect/blob/9460e66d93e00fe35b1b05fd4d8160e1ce7d5efb/src/index.ts)) |
| Default policy | One `recommended` map enables all 40 as errors ([preset](https://github.com/cevr/effect-oxlint/blob/f3464b3a1c3cacf55965ed2aa273b4accd715bfa/src/presets/recommended.ts)) | Generated `recommended` and `all` configs; without explicit curation every consumer-supplied rule becomes an error ([plugin builder](https://github.com/mpsuesser/effect-oxlint/blob/d8c892f4fedc072409dca290ac44733bf5dc3e87/src/Plugin.ts)) | Generated `recommended` config enables all 57 as errors ([README](https://github.com/mpsuesser/oxlint-plugin-effect/blob/9460e66d93e00fe35b1b05fd4d8160e1ce7d5efb/README.md)) |
| Analysis input | ESTree syntax, source text, tokens/comments, and lexical scope | The same Oxlint JavaScript-plugin inputs | The SDK's syntax/scope inputs |
| Type-aware? | No; the README assigns semantic checks to Effect TSGo ([boundary](https://github.com/cevr/effect-oxlint/blob/f3464b3a1c3cacf55965ed2aa273b4accd715bfa/README.md)) | No TypeScript `Program`, checker, symbols, inferred types, or parser services are exposed ([context](https://github.com/mpsuesser/effect-oxlint/blob/d8c892f4fedc072409dca290ac44733bf5dc3e87/src/RuleContext.ts), [Oxlint limitation](https://github.com/oxc-project/oxc/blob/97e99b85483776a72928d675cc05b1cfc1130ba0/apps/oxlint/src-js/plugins/source_code.ts#L229-L234)) | No; a rule can only infer semantics from syntax, names, imports, and scope |
| Authoring API | Exports its internal Effect-style bindings from `rule-bindings` ([manifest](https://github.com/cevr/effect-oxlint/blob/f3464b3a1c3cacf55965ed2aa273b4accd715bfa/package.json)) | `AST`, `Comment`, `Diagnostic`, `Plugin`, `Rule`, `RuleContext`, `Scope`, `SourceCode`, `Testing`, `Token`, and `Visitor`; seven `ban*` factories plus low-level `define` ([Rule API](https://github.com/mpsuesser/effect-oxlint/blob/d8c892f4fedc072409dca290ac44733bf5dc3e87/src/Rule.ts)) | Uses the SDK's factories and Effect-returning visitors |
| Runtime bridge | `Effect.runSync` at rule creation and again for visitor handlers ([bridge](https://github.com/cevr/effect-oxlint/blob/f3464b3a1c3cacf55965ed2aa273b4accd715bfa/src/vendor/effect-oxlint/Rule.ts)) | `Effect.runSync` at rule creation and for every visitor callback ([bridge](https://github.com/mpsuesser/effect-oxlint/blob/d8c892f4fedc072409dca290ac44733bf5dc3e87/src/Rule.ts)) | Inherits the SDK bridge |
| Test realism | Unit tests plus four integration tests that build the package and invoke real Oxlint against valid and invalid files; every exported rule has a liveness assertion ([integration test](https://github.com/cevr/effect-oxlint/blob/f3464b3a1c3cacf55965ed2aa273b4accd715bfa/tests/plugin-integration.test.ts)) | Mock contexts and hand-constructed AST objects; no real parser/Oxlint invocation ([harness](https://github.com/mpsuesser/effect-oxlint/blob/d8c892f4fedc072409dca290ac44733bf5dc3e87/src/Testing.ts)) | One mock-AST test file per rule through the SDK harness; no real Oxlint invocation or repository corpus ([tests](https://github.com/mpsuesser/oxlint-plugin-effect/tree/9460e66d93e00fe35b1b05fd4d8160e1ce7d5efb/test)) |
| False-positive posture | Close-valid fixtures, real-parser liveness, explicit capability exceptions, and documented rounds of dogfooding refinement; still a deliberately strict all-error preset with no published reproducible corpus ([changelog](https://github.com/cevr/effect-oxlint/blob/f3464b3a1c3cacf55965ed2aa273b4accd715bfa/CHANGELOG.md)) | Basic structural negatives, but the convenience factories generally match identifier text rather than import provenance; no declared FP budget or corpus ([factory tests](https://github.com/mpsuesser/effect-oxlint/blob/d8c892f4fedc072409dca290ac44733bf5dc3e87/test/Rule.test.ts)) | An open downstream issue documents legitimate test-boundary uses reported by many runtime/IO rules; consumers must maintain overrides ([issue #3](https://github.com/mpsuesser/oxlint-plugin-effect/issues/3)) |
| Effect version posture | Peer range `>=4.0.0-beta.66 <5`; Doctor pins and receipts its exact provider version ([manifest](https://github.com/cevr/effect-oxlint/blob/f3464b3a1c3cacf55965ed2aa273b4accd715bfa/package.json)) | Peer range `effect ^4.0.0-rc.112` ([manifest](https://github.com/mpsuesser/effect-oxlint/blob/d8c892f4fedc072409dca290ac44733bf5dc3e87/package.json)) | Directly installs `effect@4.0.0-beta.100`, predating Doctor's `rc.112` toolchain ([manifest](https://github.com/mpsuesser/oxlint-plugin-effect/blob/9460e66d93e00fe35b1b05fd4d8160e1ce7d5efb/package.json)) |
| License surface | Package metadata says MIT and a notice reproduces the MIT text for anti-slop-derived code, but the pinned repository has no standalone root `LICENSE` ([manifest](https://github.com/cevr/effect-oxlint/blob/f3464b3a1c3cacf55965ed2aa273b4accd715bfa/package.json), [notices](https://github.com/cevr/effect-oxlint/blob/f3464b3a1c3cacf55965ed2aa273b4accd715bfa/THIRD_PARTY_NOTICES.md)) | Standalone MIT license ([license](https://github.com/mpsuesser/effect-oxlint/blob/d8c892f4fedc072409dca290ac44733bf5dc3e87/LICENSE)) | Standalone MIT license ([license](https://github.com/mpsuesser/oxlint-plugin-effect/blob/9460e66d93e00fe35b1b05fd4d8160e1ce7d5efb/LICENSE)) |
| Current activity | Active: 0.11.0 was released eight days before this audit | Active: 0.3.4 was released two days before this audit | Published and not archived, but the latest release is five weeks older and remains on beta.100 |
| Effect Doctor today | Direct pinned provider; complete inventory, selective policy | Not installed | Not installed |

Neither syntax stack can replace `@effect/tsgo`. Oxlint 1.80's JavaScript
plugin interface supplies no TypeScript parser services, while TSGo is designed
to own semantic diagnostics. Adding more syntax rules cannot make a check
type-aware.

## The 40-rule `cevr` catalog and Doctor's existing policy

Effect Doctor already inventories every rule exported by the pinned provider
and then applies a narrower policy instead of importing the upstream all-error
preset. The complete partition is generated and completeness-checked by
[`scripts/rule-catalog.mjs`](../../../scripts/rule-catalog.mjs):

| Doctor policy | Count | Complete rule list |
| --- | ---: | --- |
| Blocking and enabled | 7 | `noChainedTypeAssertions`, `noManagedRuntimeInEffect`, `noPerCallCacheConstruction`, `noRunCollectOnUnboundedStream`, `noUnboundedConcurrency`, `noUnboundedRetry`, `noWidenThenAssert` |
| Advisory and enabled | 8 | `noModuleMocks`, `noObjectParameters`, `noSequentialEffectAll`, `preferCatchTag`, `preferMatchTagsExhaustive`, `preferPredicateIsTagged`, `preferServiceOf`, `requireNamedEffectFn` |
| Preview, disabled | 3 | `noKnownValueWidening`, `noTestLifecycleHooks`, `noUnknownTypeAliases` |
| Delegated to TSGo, disabled | 11 | `noAsyncFunction`, `noEffectBind`, `noEffectDo`, `noGlobals`, `noInlineProvide`, `noNestedEffectGen`, `noNewPromise`, `noNodeBuiltinImport`, `noSilentCatchAll`, `noTryCatch`, `preferEffectFn` |
| Rejected from the default, disabled | 11 | `noAs`, `noConditionalEmptyObjectSpread`, `noDynamicImports`, `noNewError`, `noNullish`, `noRuntimeTypeof`, `noShapeInSymbolNames`, `noTernary`, `noThrowStatement`, `noUnknownParameters`, `noUnsafeDictionaryType` |

This is the right relationship to the provider: **40 cataloged, 15 enabled by
default, no duplicated local implementation**. The package's own metadata
classifies 23 rules as problems and 17 as suggestions, while only
`noConditionalEmptyObjectSpread` declares a fixer. Those provider labels are
useful provenance, not sufficient evidence that every rule should affect a
benchmark reward.

The Oxlint adapter loads this provider and Effect Doctor's direct
`@oxlint/plugins` plugin in one deterministic primary run, disables native
category drift, pins one thread, and performs a separate suppression-integrity
run ([adapter](../../../src/internal/oxlint.ts), [first-party plugin](../../../src/internal/doctor-plugin.ts)). The generated catalog asserts that all 40 provider
exports are accounted for, and the toolchain resolver verifies the installed
version. `cevr`'s plugin is therefore orchestrated but not vendored by Effect
Doctor. Its published package happens to include an internal vendored rule
authoring layer; Doctor does not own that source.

### Provenance clarification

At `cevr/effect-oxlint`'s initial public revision, 8 of the 12 files in its
vendored authoring directory are byte-identical to the corresponding files in
`mpsuesser/effect-oxlint@0.1.0`; the other four have small edits. Compare the
[initial `cevr` vendor tree](https://github.com/cevr/effect-oxlint/tree/b6abc16c5286dd4e6c6f435412b2879c3dfbd7b8/packages/oxlint-plugin-effect/src/vendor/effect-oxlint)
with [`mpsuesser/effect-oxlint@0.1.0`](https://github.com/mpsuesser/effect-oxlint/tree/943ff0d40c662acd5e98ca5a4ea9e44be3ce275f/src).
The current package documents the anti-slop source lineage but does not identify
this authoring-toolkit lineage in its notice. This is a source-comparison fact,
not a legal conclusion. The maintainers should clarify provenance and include a
standalone root license so the repository, package metadata, and shipped notices
tell one unambiguous story.

## The `mpsuesser/effect-oxlint` SDK

The SDK's value is authoring ergonomics, not diagnostic coverage. It wraps the
Oxlint JavaScript rule API in Effect modules for AST matching, diagnostics,
scope/source access, visitors, plugin construction, and tests. Its convenience
factories are `banMember`, `banImport`, `banCallOf`, `banCallOfMember`,
`banNewExpr`, `banStatement`, and `banMultiple`, alongside low-level `define`
and `meta` ([Rule implementation](https://github.com/mpsuesser/effect-oxlint/blob/d8c892f4fedc072409dca290ac44733bf5dc3e87/src/Rule.ts)).

The type-safe API should not be confused with type-aware linting. A rule sees an
ESTree node and Oxlint's lexical scope model, not TypeScript types. The generic
factories also compare callee/member names. For example, a local function named
`fetch` can match `banCallOf("fetch")`, and an unrelated object named `Effect`
can match `banCallOfMember("Effect", ...)`; aliases can instead be missed. The
SDK exposes enough lower-level scope data for a careful consumer to do better,
but its convenience layer does not make binding provenance the default.

Effect Doctor should continue using direct `@oxlint/plugins` rules for its tiny
first-party layer. That avoids a second runtime dependency and an
`Effect.runSync` boundary on each visitor callback. It also preserves the
current architecture in which Effect handles orchestration while the per-node
hot path remains synchronous and plain ([architecture](../../architecture.md)).

### Forks and successors

No fork declares itself the SDK's successor, and upstream is active.

- [`hadronomy/effect-oxlint`](https://github.com/hadronomy/effect-oxlint/commit/ef3bfa21d55db6227391720ce52726bfc116f32f)
  has two experimental unmerged commits adding `createOnce`, direct synchronous
  visitors, and file-lifecycle state. It is also behind current upstream and has
  no published successor release. Its lifecycle idea is worth benchmarking and
  proposing upstream rather than adopting the fork.
- `BleedingDev/effect-oxlint` has no current commits ahead. Its compatibility
  work was merged upstream through [PR #2](https://github.com/mpsuesser/effect-oxlint/pull/2),
  so there is no separate implementation to consume.

## The linked 57-rule companion catalog

The companion plugin is the source of the rule count sometimes incorrectly
attributed to the SDK. Its registry groups the complete catalog as follows:

- Statement bans (3): `avoid-try-catch`, `prefer-match-over-switch`,
  `imperative-loops`.
- Member-expression bans (8): `avoid-data-tagged-error`, `avoid-direct-json`,
  `avoid-option-getorthrow`, `avoid-process-env`, `use-random-service`,
  `effect-run-in-body`, `effect-promise-vs-trypromise`, `use-console-service`.
- Import bans (6): `use-filesystem-service`, `use-path-service`,
  `use-command-executor-service`, `use-http-client-service`,
  `avoid-platform-coupling`, `avoid-node-imports`.
- Type-level rules (8): `avoid-any`, `avoid-object-type`, `avoid-ts-ignore`,
  `avoid-mutable-state`, `avoid-schema-suffix`, `avoid-non-null-assertion`,
  `prefer-option-over-null`, `casting-awareness`.
- Call-expression rules (6): `use-clock-service`, `avoid-native-fetch`,
  `avoid-react-hooks`, `avoid-sync-fs`, `avoid-untagged-errors`,
  `prefer-arr-sort`.
- Complex/contextual rules (11): `context-tag-extends`, `throw-in-effect-gen`,
  `prefer-effect-fn`, `yield-in-for-loop`, `avoid-expect-in-if`,
  `avoid-yield-ref`, `effect-catchall-default`, `avoid-direct-tag-checks`,
  `vm-in-wrong-file`, `use-temp-file-scoped`,
  `avoid-native-object-helpers`.
- Effect/Option/Array idioms (3):
  `prefer-array-fromoption-over-option-match-empty`, `no-length-comparison`,
  `no-effect-ignore-then-as`.
- Pattern enforcement (12): `prefer-namespace-imports`, `prefer-effect-is`,
  `prefer-duration-constructors`, `prefer-arr-match`,
  `prefer-redacted-config`, `require-schema-type-alias`,
  `require-filter-metadata`, `require-is-prefix-for-boolean-schema-field`,
  `maybe-prefix-requires-option`, `require-effect-concurrency`,
  `no-barrel-imports`, `no-opaque-instance-fields`.

This list is a faithful inventory of the [pinned registry](https://github.com/mpsuesser/oxlint-plugin-effect/blob/9460e66d93e00fe35b1b05fd4d8160e1ce7d5efb/src/index.ts),
not an endorsement of its contracts or severity choices.

### Rule-by-rule disposition themes

The full 57-rule audit has one mutually exclusive disposition for every rule:

| Disposition | Count | Complete rule list |
| --- | ---: | --- |
| Delegate to an existing provider | 27 | `avoid-any`, `avoid-direct-json`, `avoid-direct-tag-checks`, `avoid-native-fetch`, `avoid-node-imports`, `avoid-process-env`, `avoid-sync-fs`, `avoid-try-catch`, `avoid-ts-ignore`, `avoid-untagged-errors`, `avoid-yield-ref`, `casting-awareness`, `context-tag-extends`, `effect-catchall-default`, `effect-run-in-body`, `no-opaque-instance-fields`, `prefer-effect-fn`, `prefer-effect-is`, `prefer-option-over-null`, `prefer-redacted-config`, `use-clock-service`, `use-command-executor-service`, `use-console-service`, `use-filesystem-service`, `use-http-client-service`, `use-path-service`, `use-random-service` |
| Reject as generic, opinionated, or project-specific | 24 | `avoid-expect-in-if`, `avoid-native-object-helpers`, `avoid-non-null-assertion`, `avoid-object-type`, `avoid-option-getorthrow`, `avoid-platform-coupling`, `avoid-react-hooks`, `avoid-schema-suffix`, `imperative-loops`, `maybe-prefix-requires-option`, `no-barrel-imports`, `no-effect-ignore-then-as`, `no-length-comparison`, `prefer-arr-match`, `prefer-arr-sort`, `prefer-duration-constructors`, `prefer-match-over-switch`, `prefer-namespace-imports`, `require-effect-concurrency`, `require-filter-metadata`, `require-is-prefix-for-boolean-schema-field`, `require-schema-type-alias`, `vm-in-wrong-file`, `yield-in-for-loop` |
| Incorrect or obsolete on RC.112 | 2 | `avoid-data-tagged-error`, `effect-promise-vs-trypromise` |
| Research seed only; fresh implementation required | 4 | `avoid-mutable-state`, `prefer-array-fromoption-over-option-match-empty`, `throw-in-effect-gen`, `use-temp-file-scoped` |

“Delegate” means the valid part of the contract already has a more
authoritative owner; it does not claim identical implementation. “Research
seed” means only that a narrower independently sourced contract may be useful.
It does not approve the package's rule, message, fixture, or default severity.

The following themes explain the important decisions without pretending that
similarly named rules have byte-for-byte identical behavior.

| Theme and representative rules | Effect Doctor disposition | Reason |
| --- | --- | --- |
| Unsafe casts and broad types: `avoid-any`, `casting-awareness`, `avoid-object-type`, `avoid-non-null-assertion`, `avoid-ts-ignore` | **Delegate or keep as general TypeScript hygiene.** | TSGo and the existing `cevr` inventory already own Effect-specific assertion hazards; native TypeScript/Oxlint policies own the generic forms. A second name-based syntax finding would double-count. |
| Ambient/runtime APIs: `avoid-direct-json`, `avoid-native-fetch`, `avoid-process-env`, `avoid-node-imports`, `avoid-sync-fs`, `use-clock-service`, `use-console-service`, `use-filesystem-service`, `use-path-service`, `use-command-executor-service`, `use-http-client-service`, `use-random-service` | **Delegate.** | Existing TSGo globals and `cevr`'s capability-aware `noGlobals` / `noNodeBuiltinImport` cover these contracts with established provider identities. The companion's open issue also documents missing test-boundary handling. |
| Effect execution and failure control: `avoid-try-catch`, `effect-run-in-body`, `effect-catchall-default`, `avoid-untagged-errors`, `avoid-direct-tag-checks`, `prefer-effect-fn`, `prefer-effect-is`, `prefer-option-over-null`, `prefer-redacted-config`, `no-opaque-instance-fields` | **Delegate.** | Each contract is already represented by TSGo, `cevr`, or an existing narrower first-party rule. Preserve the more authoritative provider rather than emit two findings. |
| Layout/naming/adoption policy: `avoid-platform-coupling`, `avoid-react-hooks`, `avoid-schema-suffix`, `vm-in-wrong-file`, `no-barrel-imports`, `prefer-namespace-imports`, `require-is-prefix-for-boolean-schema-field`, `maybe-prefix-requires-option` | **Keep project-local.** | These rules encode a repository topology, UI architecture, naming scheme, or import preference. They do not establish that arbitrary Effect code is incorrect. |
| Broad functional style: `imperative-loops`, `prefer-match-over-switch`, `prefer-arr-match`, `prefer-arr-sort`, `no-length-comparison`, `avoid-native-object-helpers`, `avoid-option-getorthrow`, `yield-in-for-loop` | **Reject from the Effect-specific score.** | Valid Effect programs may intentionally use these JavaScript forms. Several checks are generic lint/style rules; syntax alone cannot prove that the proposed rewrite preserves semantics or improves the program. |
| Blanket or stale contracts: `avoid-data-tagged-error`, `effect-promise-vs-trypromise`, `prefer-duration-constructors`, `require-filter-metadata`, `context-tag-extends`, `avoid-yield-ref`, `no-effect-ignore-then-as`, `require-effect-concurrency` | **Reject as written.** | They conflict with current supported APIs, make optional policy mandatory, depend on names/old migrations, or recommend a transformation that can change error/lifecycle behavior. Details follow below. |
| Possible gaps: `throw-in-effect-gen`, `use-temp-file-scoped`, `avoid-mutable-state`, `prefer-array-fromoption-over-option-match-empty` | **Research only.** | Throw-to-defect and scoped cleanup have official runtime/lifetime contracts but need precise provenance and boundary checks. Captured mutable service state and the Option simplification need much stronger semantic proof. |

### Concrete contradictions and false-positive risks

- `avoid-data-tagged-error` blanket-bans `Data.TaggedError`, while current Effect
  source officially supports both `Data.TaggedError` and schema-backed
  `Schema.TaggedError`. Its suggested `Schema.TaggedErrorClass` API does not
  exist in RC.112. Schema-backed errors are appropriate at serialization
  boundaries, but not every tagged error must be serializable
  ([`Data.TaggedError`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Data.ts#L1087-L1117),
  [`Schema.TaggedError`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Schema.ts#L15190-L15250)).
- `effect-promise-vs-trypromise` bans `Effect.promise`, but current Effect
  explicitly documents it for asynchronous operations guaranteed not to reject
  and directs users to `tryPromise` only when rejection is expected
  ([current `Effect.ts`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Effect.ts)).
- `prefer-duration-constructors` treats numeric duration inputs as a smell,
  while `Duration.Input` deliberately includes millisecond numbers
  ([current `Duration.ts`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Duration.ts)).
- `require-filter-metadata` requires three annotation keys even though
  `Schema.makeFilter` and `makeFilterGroup` declare annotations optional and
  official examples omit them ([current `Schema.ts`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Schema.ts)).
- `require-effect-concurrency` treats the documented sequential default as an
  error while accepting `"unbounded"`; that is not a safe universal policy.
  Doctor's existing `noUnboundedConcurrency` contract is narrower and directly
  protects the hazardous case.
- `no-effect-ignore-then-as` describes adjacent `Effect.ignore` and `Effect.as`
  as redundant, but `ignore` changes the error channel while `as` changes only
  the success value. Removing it can change behavior. The same rule also
  hard-codes project-specific function names as infallible.
- `use-temp-file-scoped` matches `makeTempFile` and `makeTempDirectory` on any
  receiver and bans all `os` imports. The official contract supports only a
  much narrower conclusion: the actual Effect FileSystem scoped variants add
  automatic cleanup. Adapter code, manual cleanup, and unrelated receivers are
  close-valid cases.

## Exact non-duplicative opportunity queue

| Candidate | Status | Contract needed before implementation |
| --- | --- | --- |
| Throw inside a confirmed Effect generator | **Advance to contract research; advisory only.** | Resolve actual Effect imports and aliases; support `Effect.gen`, `fn`, `fnUntraced`, and named/curried forms; stop at nested function boundaries; distinguish an accidental throw from explicit defect intent. Prefer contributing the finished contract upstream if `cevr` accepts a narrow successor to its rejected blanket `noThrowStatement`. |
| Literal secret-shaped fields inside `Config.schema(Schema.Struct(...))` | **Research as an extension of existing `prefer-config-redacted`.** | Preserve the current rule identity and its import/shadow protections. Prove that the proposed redacted schema preserves existing validation; do not replace `Config.nonEmptyString` mechanically. |
| Unscoped Effect temp acquisition in a scoped lifetime | **Hold until lifetime can be proven; preview/advisory if feasible.** | Resolve the imported `effect/FileSystem` service and actual method. Detect a proven leak or clearly scoped ownership site. Exempt intentional manual ownership and returned/transferred resources. Require firing, close-valid, alias, shadowing, adapter, and cleanup fixtures plus corpus calibration. Do not reuse the companion implementation or prose. |
| Mutable closure state in a long-lived Layer/service | **Hold.** | An AST `let` is not enough: local mutation can be initialization-only or safely encapsulated. A future contract needs concurrency/lifetime evidence, likely type-aware or cross-node analysis, and merged-fix provenance. |
| `Option.match` returning empty/singleton arrays | **Hold as a refactoring hint outside the quality score.** | Verify that the singleton contains the `onSome` parameter and that both handlers are pure/equivalent. The current rule also flags `onSome: () => [fallback]`, where `Array.fromOption` would change behavior. |

No companion implementation is admissible as-is. Independent ecosystem
research found a stronger separate candidate,
`no-inline-schema-compile`, implemented in two real applications; that contract
is covered by the [community survey](community-effect-lint-survey.md), not by
either package compared here.

## Upstream contribution opportunities

### `cevr/effect-oxlint`

1. Add a standalone root `LICENSE` matching the package's MIT declaration and
   clarify the source/license lineage of the vendored authoring bindings.
2. Publish machine-readable rule ownership/overlap metadata or narrower
   correctness/advisory presets. The current all-error preset requires every
   TSGo consumer to reconstruct a duplicate-disable map.
3. Turn the documented dogfood rounds into a pinned, reproducible calibration
   corpus with per-rule false-positive expectations.
4. Benchmark and, if useful, adopt an Oxlint `createOnce`/plain synchronous
   hot-path design without breaking the public rule-binding API.

### `mpsuesser/effect-oxlint`

1. Add binding- and import-aware matcher/factory APIs so safe usage does not
   require every consumer to rebuild provenance checks.
2. Add a real Oxlint/parser integration test and a liveness assertion for an
   example generated plugin; mocked AST tests cannot catch load, selector,
   parser-shape, or packaging failures.
3. Add an optional, benchmarked `createOnce` and synchronous visitor lifecycle,
   informed by the `hadronomy` experiment, rather than requiring
   `Effect.runSync` for every visited node.
4. Document explicitly that the package is type-safe authoring infrastructure,
   not TypeScript type-aware analysis and not a rule collection.

### `mpsuesser/oxlint-plugin-effect`

1. Update and test against the current Effect RC before claiming current v4
   guidance; avoid a direct second Effect runtime dependency where possible.
2. Resolve issue #3 by shipping explicit production/test/adapter profiles or
   per-rule scope metadata. Do not hide file-boundary heuristics inside rules
   without configurable, testable contracts.
3. Split `recommended` from `all`. Only independently sourced, high-precision
   contracts should default to error; project/style rules should be opt-in.
4. Add real-Oxlint integration, alias/shadowing fixtures, close-valid tests, and
   a pinned corpus with a declared false-positive budget.
5. Remove or narrow rules contradicted by current Effect contracts, especially
   the blanket bans on `Data.TaggedError`, `Effect.promise`, numeric durations,
   optional filter annotations, and valid sequential concurrency defaults.

These contributions improve the ecosystem even if Effect Doctor never changes
providers. They are preferable to forking either package inside Doctor.

## Final architecture recommendation

Keep the current provider boundary:

1. pinned `@effect/tsgo` for semantic and type-aware diagnostics;
2. pinned `cevr/oxlint-plugin-effect` for syntax/local structure, with Doctor's
   7 blocking + 8 advisory default instead of the upstream all-error preset;
3. a very small direct `@oxlint/plugins` first-party gap layer with written
   contracts, import provenance, close-valid fixtures, and corpus calibration;
4. no `mpsuesser/effect-oxlint` runtime dependency and no wholesale companion
   rule-pack ingestion.

This gives Effect Doctor the useful breadth of the active community provider
without confusing rule count with correctness. It also keeps a clean upgrade
path: track both upstream projects, contribute infrastructure improvements, and
promote only independently proven gaps.

## Primary source index

- `cevr/effect-oxlint@f3464b3`: [repository](https://github.com/cevr/effect-oxlint/tree/f3464b3a1c3cacf55965ed2aa273b4accd715bfa), [registry](https://github.com/cevr/effect-oxlint/blob/f3464b3a1c3cacf55965ed2aa273b4accd715bfa/src/rules/index.ts), [preset](https://github.com/cevr/effect-oxlint/blob/f3464b3a1c3cacf55965ed2aa273b4accd715bfa/src/presets/recommended.ts), [tests](https://github.com/cevr/effect-oxlint/tree/f3464b3a1c3cacf55965ed2aa273b4accd715bfa/tests), [changelog](https://github.com/cevr/effect-oxlint/blob/f3464b3a1c3cacf55965ed2aa273b4accd715bfa/CHANGELOG.md), [manifest](https://github.com/cevr/effect-oxlint/blob/f3464b3a1c3cacf55965ed2aa273b4accd715bfa/package.json), and [third-party notices](https://github.com/cevr/effect-oxlint/blob/f3464b3a1c3cacf55965ed2aa273b4accd715bfa/THIRD_PARTY_NOTICES.md).
- `mpsuesser/effect-oxlint@d8c892f`: [repository](https://github.com/mpsuesser/effect-oxlint/tree/d8c892f4fedc072409dca290ac44733bf5dc3e87), [README](https://github.com/mpsuesser/effect-oxlint/blob/d8c892f4fedc072409dca290ac44733bf5dc3e87/README.md), [exports](https://github.com/mpsuesser/effect-oxlint/blob/d8c892f4fedc072409dca290ac44733bf5dc3e87/src/index.ts), [Rule API](https://github.com/mpsuesser/effect-oxlint/blob/d8c892f4fedc072409dca290ac44733bf5dc3e87/src/Rule.ts), [Plugin API](https://github.com/mpsuesser/effect-oxlint/blob/d8c892f4fedc072409dca290ac44733bf5dc3e87/src/Plugin.ts), [testing API](https://github.com/mpsuesser/effect-oxlint/blob/d8c892f4fedc072409dca290ac44733bf5dc3e87/src/Testing.ts), [test tree](https://github.com/mpsuesser/effect-oxlint/tree/d8c892f4fedc072409dca290ac44733bf5dc3e87/test), [CI](https://github.com/mpsuesser/effect-oxlint/blob/d8c892f4fedc072409dca290ac44733bf5dc3e87/.github/workflows/ci.yml), and [license](https://github.com/mpsuesser/effect-oxlint/blob/d8c892f4fedc072409dca290ac44733bf5dc3e87/LICENSE).
- `mpsuesser/oxlint-plugin-effect@9460e66`: [repository](https://github.com/mpsuesser/oxlint-plugin-effect/tree/9460e66d93e00fe35b1b05fd4d8160e1ce7d5efb), [README/rule catalog](https://github.com/mpsuesser/oxlint-plugin-effect/blob/9460e66d93e00fe35b1b05fd4d8160e1ce7d5efb/README.md), [registry](https://github.com/mpsuesser/oxlint-plugin-effect/blob/9460e66d93e00fe35b1b05fd4d8160e1ce7d5efb/src/index.ts), [tests](https://github.com/mpsuesser/oxlint-plugin-effect/tree/9460e66d93e00fe35b1b05fd4d8160e1ce7d5efb/test), [manifest](https://github.com/mpsuesser/oxlint-plugin-effect/blob/9460e66d93e00fe35b1b05fd4d8160e1ce7d5efb/package.json), [CI](https://github.com/mpsuesser/oxlint-plugin-effect/blob/9460e66d93e00fe35b1b05fd4d8160e1ce7d5efb/.github/workflows/ci.yml), [license](https://github.com/mpsuesser/oxlint-plugin-effect/blob/9460e66d93e00fe35b1b05fd4d8160e1ce7d5efb/LICENSE), and [false-positive issue](https://github.com/mpsuesser/oxlint-plugin-effect/issues/3).
- Effect Doctor: [pinned dependencies](../../../package.json), [provider policy generator](../../../scripts/rule-catalog.mjs), [Oxlint orchestration](../../../src/internal/oxlint.ts), [first-party plugin](../../../src/internal/doctor-plugin.ts), and [architecture](../../architecture.md).
- Effect `4.0.0-rc.112` source at `2600f62`: [`Effect.ts`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Effect.ts), [`FileSystem.ts`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/FileSystem.ts), [`Duration.ts`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Duration.ts), and [`Schema.ts`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Schema.ts).
