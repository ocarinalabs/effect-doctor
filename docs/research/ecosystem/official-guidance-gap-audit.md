# Official Effect guidance gap audit

Audit date: 2026-08-30

This audit asks a narrow question: after Effect Doctor's 148-rule catalog (99
`@effect/tsgo`, 40 `oxlint-plugin-effect`, and 9 first-party rules), what
deterministic guidance is still missing from the current official Effect skill,
the canonical Effect documentation, the TypeScript language tooling, and Effect
Solutions?

The answer is smaller than the source material suggests. The official skill is
a source router rather than a style guide; the current TSGo catalog already owns
nearly every type-aware contract; and Effect Solutions is currently too stale to
serve as RC authority. One narrow syntax rule is worth calibrating. The larger
gaps are project and compiler orchestration, not a need to clone more rules.

## Sources and versions

The measurements in this note use immutable revisions:

| Source | Revision | Role in this audit |
| --- | --- | --- |
| [`Effect-TS/skills`](https://github.com/Effect-TS/skills/tree/2309e6f27d9955b434c0e3f394b945c136e89fd2) | `2309e6f27d9955b434c0e3f394b945c136e89fd2` | Official agent setup and v3-to-v4 migration instructions |
| [`Effect-TS/effect`](https://github.com/Effect-TS/effect/tree/145d8e1013220425b8edf34f7011c73f73e1cdcf) | `145d8e1013220425b8edf34f7011c73f73e1cdcf` | Canonical package requirements, generated agent guide, source, and migration guides |
| [`Effect-TS/tsgo`](https://github.com/Effect-TS/tsgo/tree/f134c316b685b70fc513d10ed9b7c899088667f5) | `f134c316b685b70fc513d10ed9b7c899088667f5` | Current type-aware Effect diagnostics |
| [`Effect-TS/language-service`](https://github.com/Effect-TS/language-service/tree/5e4d380b6fcd20f048dd8d41515bcd9ea47ffda4) | `5e4d380b6fcd20f048dd8d41515bcd9ea47ffda4` | TypeScript 5-era predecessor inventory |
| [`Effect-TS/eslint-plugin`](https://github.com/Effect-TS/eslint-plugin/tree/44bba8afb40ad3f36be7acc35d70afe067e424f9) | `44bba8afb40ad3f36be7acc35d70afe067e424f9` | Historical official ESLint surface |
| [`kitlangton/effect-solutions`](https://github.com/kitlangton/effect-solutions/tree/09f82e6c5c928e7232cd32daf04d7c6a830b63f7) | `09f82e6c5c928e7232cd32daf04d7c6a830b63f7` | Opinionated, non-official pattern collection and static docs CLI |

The local baseline is the generated catalog and the existing
[first-party contracts](../first-party-rules.md). A rule counts as “covered”
even when it is deliberately preview-only or disabled: the question here is
ownership and representation, not whether every preference should enter the
default score.

## Executive decisions

| Guidance or gap | Decision | Why |
| --- | --- | --- |
| Official `effect-ts` skill | **Unsuitable as a rule source by itself** | The skill installs `effect@rc` and delegates to the installed package's complete `AGENTS.md` and source; it contains no coding contracts to encode ([skill](https://github.com/Effect-TS/skills/blob/2309e6f27d9955b434c0e3f394b945c136e89fd2/skills/effect-ts/SKILL.md#L6-L34)). |
| Resolved `strict: true` | **Viable type-aware orchestration** | The canonical package says strict type-checking “must be enabled” ([requirements](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/effect/README.md#L13-L25)). Effect Doctor snapshots resolved configuration but does not reject a non-strict project. This belongs in configuration planning, not an AST rule. |
| Ordinary TypeScript errors | **Viable type-aware orchestration** | TSGo's special Effect diagnostics protocol intentionally filters out every diagnostic that is not an Effect rule code ([collector](https://github.com/Effect-TS/tsgo/blob/f134c316b685b70fc513d10ed9b7c899088667f5/etsdiagnostics/diagnostics.go#L269-L279)). If “Doctor clean” is meant to imply buildable, add a native typecheck gate; do not recreate compiler errors as local lint rules. |
| `Effect.fn` span name disagrees with its binding/member | **Viable first-party syntax rule** | Canonical guidance says the literal name should match the function name ([guide](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/LLMS.md#L65-L86)). Neither pinned nor current TSGo has such a diagnostic, while `effect/require-named-effect-fn` only requires that a name exist. A narrow import-aware advisory can compare only unambiguous `const`, property, and class-field bindings and accept qualified names whose last segment matches. |
| `.pipe(...)` directly on an `Effect.fn` definition | **Viable type-aware orchestration, not a first-party syntax rule** | The same guide says to pass transforms as builder arguments rather than piping the returned function ([guide](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/LLMS.md#L65-L86)). The public `Effect.fn` signature returns an ordinary function, not a `Pipeable`, so a strict compiler already rejects the direct `.pipe`. This is evidence for the typecheck gate above, not a reason to duplicate TypeScript. |
| Repeated equivalent parameterized Layer construction | **Viable type-aware orchestration** | V4 memoizes the same Layer reference and documents explicit opt-outs for fresh resources ([memoization guide](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/migration/layer-memoization.md#L1-L88)); Effect Solutions shows how repeated constructor calls can duplicate pools ([example](https://github.com/kitlangton/effect-solutions/blob/09f82e6c5c928e7232cd32daf04d7c6a830b63f7/packages/website/docs/04-services-and-layers.md#L352-L412)). Syntax alone cannot prove an arbitrary `.layer(...)` call returns a Layer or that two branches share a runtime, so this should be proposed upstream as a typed Layer-graph diagnostic, initially advisory. |
| Effect v4 package-train alignment | **Viable type-aware orchestration** | The official migration skill requires every remaining `effect` / `@effect/*` dependency to use one matching v4 version ([migration skill](https://github.com/Effect-TS/skills/blob/2309e6f27d9955b434c0e3f394b945c136e89fd2/skills/effect-v3-to-v4/SKILL.md#L76-L89)). TSGo's `duplicatePackage` catches two loaded versions of the *same* package, but not necessarily mismatched versions across distinct packages. Inspect resolved dependencies or ask TSGo to own this; comparing manifest strings would be inaccurate. |
| Two diagnostics present only on TSGo `main` | **Upstream-owned** | Current `main` has 101 rules, adding `optionMatchToFromOption` and `preferSucceedSomeOrNone` after the published 0.38.0 catalog ([metadata](https://github.com/Effect-TS/tsgo/blob/f134c316b685b70fc513d10ed9b7c899088667f5/_packages/tsgo/src/metadata.json#L2043-L2127)). Refresh only from a released, pinned TSGo package; never reproduce them locally. |
| TypeScript 5 language-service leftovers | **Unsuitable** | The language service tells TypeScript 7 users to use TSGo ([README](https://github.com/Effect-TS/language-service/blob/5e4d380b6fcd20f048dd8d41515bcd9ea47ffda4/README.md#L1-L7)). Its three names absent from TSGo are codegen freshness/accessor support and `importFromBarrel`; the first two are editor workflow checks, and current official examples intentionally import from the `effect` barrel. |
| Official ESLint plugin | **Unsuitable** | Its entire rule map is `dprint` plus configurable `no-import-from-barrel-package` ([plugin](https://github.com/Effect-TS/eslint-plugin/blob/44bba8afb40ad3f36be7acc35d70afe067e424f9/src/plugin.ts#L1-L13)). Formatting is not Effect correctness, and barrel policy is explicitly project-configured rather than an Effect invariant. |
| Effect Solutions as blocking authority | **Unsuitable** | Its own README calls it an opinionated living document ([README](https://github.com/kitlangton/effect-solutions/blob/09f82e6c5c928e7232cd32daf04d7c6a830b63f7/README.md#L1-L27)), and the current checkout still targets `4.0.0-beta.59` rather than the RC ([manifest](https://github.com/kitlangton/effect-solutions/blob/09f82e6c5c928e7232cd32daf04d7c6a830b63f7/package.json#L26-L41)). Use it to generate hypotheses, then require current canonical corroboration and corpus evidence. |

## Official skill and package guide

The main official skill deliberately avoids freezing conventions in a separate
repository. Its only durable behavior is to install the requested Effect
version and point the agent at that package's shipped guide and source. This is
important for EffectBench: “with official skill” is a source-discovery treatment,
not a hidden verifier preset. Encoding the skill wholesale into Effect Doctor
would leak treatment guidance into the supposedly independent score.

The current canonical package guide maps cleanly onto existing ownership:

| Canonical guidance | Existing owner or decision |
| --- | --- |
| Inline `Effect.gen`; reusable functions use `Effect.fn` / `fnUntraced`; avoid wrapper functions ([guide](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/LLMS.md#L12-L18)) | TSGo `effectFnOpportunity`; `oxlint-plugin-effect` `requireNamedEffectFn`; no duplicate. |
| Use `return yield*` when raising a yieldable error ([guide](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/LLMS.md#L28-L48)) | Default-blocking TSGo `missingReturnYieldStar`. |
| Parse untrusted data with Schema rather than `JSON` or manual parsing ([guide](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/LLMS.md#L110-L120)) | TSGo `preferSchemaOverJson` and `preferTypedSchemaDecoder` cover provable cases. “Untrusted” and arbitrary manual parsing require boundary intent, so the general advice is unsuitable for syntax lint. |
| Prefer class-form services and location-based identifiers ([guide](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/LLMS.md#L122-L171)) | TSGo `serviceNotAsClass`, `deterministicKeys`, `classSelfMismatch`, `genericEffectServices`, and `leakingRequirements`. Some are intentionally off or suggestions; that is policy, not missing coverage. |
| Scope resources and finalizers; use Layer constructors for lifetime ownership ([guide](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/LLMS.md#L224-L240)) | TSGo `scopeInLayerEffect`; first-party `no-long-lived-layer-acquisition`; Effect's type-level `Scope` requirements. Broader lifetime intent is unsuitable for local syntax. |
| Use DateTime, Config, Effect logging, and Effect-native globals ([guide](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/LLMS.md#L288-L310)) | TSGo already catalogs `globalDate*`, `processEnv*`, `globalConsole*`, `globalRandom*`, `globalTimers*`, and `globalFetch*`; first-party rules cover structured logging and secret redaction. Most global replacements remain off because they are policy-sensitive. |
| Prefer `Predicate` helpers to handwritten `isRecord` / `isString` guards ([guide](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/LLMS.md#L317-L325)) | Unsuitable as a general diagnostic. Function names do not prove semantics, and equivalent guards can be domain-specific or deliberately optimized. |
| Use `NodeRuntime.runMain`, `BunRuntime.runMain`, or `Layer.launch` at application entry points ([guide](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/LLMS.md#L237-L240)) | Unsuitable for a per-file rule: scripts, tests, browser code, embedded runtimes, and libraries have different boundaries. A future package-aware application-entry provider could revisit it. |

### Proposed syntax contract: `effect-fn-name-mismatch`

This is the only new local syntax contract supported strongly enough by the
official guide to enter calibration now.

- Match only `Effect.fn("literal")(...)` proven through an import from `effect`
  or `effect/Effect`.
- Require an unambiguous enclosing identifier: a variable declarator, object
  property, or class field with a static identifier key.
- Accept an exact match or a qualified operation name whose final `.` or `/`
  segment equals that identifier; this admits canonical names such as
  `Database.query`.
- Abstain on computed properties, destructuring, dynamic names, reassignment,
  returned anonymous expressions, aliases whose origin is not proven, and
  `Effect.fn` used without a span name.
- Start advisory. Misnaming damages trace and diagnostic identity, but does not
  change the Effect value's runtime result.

It still needs the normal admission work: invalid and close-valid packaged
fixtures, provider liveness, a pinned source contract, and zero unexplained
findings on the calibration corpus.

## Language Service, TSGo, and ESLint closure

The published `@effect/tsgo@0.38.0` metadata in Effect Doctor contains 99
diagnostics. Current TSGo `main` contains 101. The TypeScript 5 language service
contains 77. Comparing names gives:

| Comparison | Count | Meaning |
| --- | ---: | --- |
| Language-service names also present in pinned TSGo | 74 | Already owned and cataloged by TSGo |
| Language-service-only names | 3 | `importFromBarrel`, `outdatedEffectCodegen`, `unsupportedServiceAccessors` |
| Pinned-TSGo names absent from language service | 25 | Newer typed coverage, not regressions |
| Current-TSGo names absent from pinned 0.38.0 | 2 | Unreleased upstream additions; wait for a package release |

The three language-service-only names do not justify new Doctor rules:

- `outdatedEffectCodegen` and `unsupportedServiceAccessors` police optional
  editor code-generation workflows, not the quality of ordinary Effect code.
- `importFromBarrel` is configurable in the old tool, is the only non-formatting
  policy in the official ESLint plugin, and conflicts with current canonical
  examples such as `import { Effect, Schema } from "effect"`. TSGo's omission is
  consistent with treating it as project policy.

TSGo is therefore the closure authority. The language service remains relevant
for projects on older TypeScript, but it is not a second provider to run in
parallel and not a source from which to fork retired diagnostics.

## Effect Solutions freshness and admissibility

Effect Solutions is useful as benchmark context and as a source of candidate
failure models, but its current `main` cannot be treated as authoritative RC
guidance:

- The root and CLI manifests pin Effect and platform packages to
  `4.0.0-beta.59` ([root](https://github.com/kitlangton/effect-solutions/blob/09f82e6c5c928e7232cd32daf04d7c6a830b63f7/package.json#L26-L41),
  [CLI](https://github.com/kitlangton/effect-solutions/blob/09f82e6c5c928e7232cd32daf04d7c6a830b63f7/packages/cli/package.json#L31-L41)).
- Its setup page still directs agents to the superseded `Effect-TS/effect-smol`
  checkout ([setup](https://github.com/kitlangton/effect-solutions/blob/09f82e6c5c928e7232cd32daf04d7c6a830b63f7/packages/website/docs/01-project-setup.md#L87-L108)), while the official migration skill explicitly identifies that checkout as stale and routes users to canonical `Effect-TS/effect` ([official correction](https://github.com/Effect-TS/skills/blob/2309e6f27d9955b434c0e3f394b945c136e89fd2/skills/effect-v3-to-v4/SKILL.md#L22-L45)).
- The `use` pattern is marked draft and the CLI generator omits draft topics
  ([pattern](https://github.com/kitlangton/effect-solutions/blob/09f82e6c5c928e7232cd32daf04d7c6a830b63f7/packages/website/docs/14-use-pattern.md#L1-L22),
  [manifest filter](https://github.com/kitlangton/effect-solutions/blob/09f82e6c5c928e7232cd32daf04d7c6a830b63f7/packages/cli/src/docs-manifest.ts#L74-L105)).
- The CLI implements `list`, `show`, and `open-issue`; it is a static delivery
  mechanism, not an analyzer ([CLI](https://github.com/kitlangton/effect-solutions/blob/09f82e6c5c928e7232cd32daf04d7c6a830b63f7/packages/cli/src/cli.ts#L85-L178)).

Most stable Solutions guidance is already represented:

| Solutions guidance | Decision |
| --- | --- |
| Unique deterministic service keys | Already covered by TSGo `deterministicKeys`. |
| Service methods should not leak implementation requirements | Already covered by TSGo `leakingRequirements`. |
| Compose/provide layers at the application boundary | Already covered by TSGo `multipleEffectProvide`, `strictEffectProvide`, and `layerMergeAllWithDependencies`. |
| Redact credentials | Already covered by first-party `prefer-config-redacted`. |
| Preserve `AbortSignal` through promise adapters | Already covered narrowly by first-party `prefer-abort-signal-passthrough`. |
| Prefer `Config.schema` over `Config.mapOrFail` | Unsuitable as a rule: the same page later recommends `mapOrFail`, and either can be appropriate for a custom failure contract ([schema recommendation](https://github.com/kitlangton/effect-solutions/blob/09f82e6c5c928e7232cd32daf04d7c6a830b63f7/packages/website/docs/07-config.md#L171-L199), [later checklist](https://github.com/kitlangton/effect-solutions/blob/09f82e6c5c928e7232cd32daf04d7c6a830b63f7/packages/website/docs/07-config.md#L338-L367)). |
| Catch defects only at system boundaries | Unsuitable for deterministic local lint because the application boundary and recovery semantics are not syntactically knowable. |
| Make all service properties `readonly` | Style-level and generally enforced by project conventions; no demonstrated Effect failure model. |

For EffectBench, label the Solutions treatment with its source revision and
beta-era status, or temporarily exclude its setup/package/import advice from RC
trials. For Effect Doctor, no Solutions-derived rule should become blocking
without current official corroboration and real-defect calibration.

## Recommended sequence

1. Add a resolved-config acceptance test for non-strict projects, then decide
   whether failure is a project finding or a fail-closed unsupported-project
   error. This is the highest-confidence uncovered requirement.
2. Decide and document whether “clean” includes ordinary TypeScript buildability.
   If yes, add one native compiler gate rather than syntax clones such as
   `no-pipe-on-effect-fn`.
3. Calibrate `effect-fn-name-mismatch` as an advisory first-party syntax rule.
4. Draft upstream TSGo proposals for repeated Layer construction and v4 package
   train mismatch. Do not implement syntax approximations until typed prototypes
   demonstrate both signal and acceptable cost.
5. When a TSGo release includes the two current `main` additions, refresh the
   pinned metadata, regenerate the catalog, and run provider completeness tests.
6. Keep Effect Solutions version-labeled and non-authoritative until its RC
   dependencies and canonical source links are updated.
