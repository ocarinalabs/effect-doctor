# T3Code Oxlint plugin audit

Audit date: 2026-08-30

Source revision: [`pingdotgg/t3code@c0e09f3`](https://github.com/pingdotgg/t3code/tree/c0e09f323ac9f6bf4b9119cbad841db3379588d6). The repository calls `oxlint-plugin-t3code` a collection of [repo-specific lint rules](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/docs/internals/workspace-layout.md#L45-L53), which is the right frame for this audit: it is a useful example of turning repeated regressions into deterministic checks, not an Effect ruleset ready to import.

## Result

T3Code has six custom syntax-only rules. Two mention Effect directly, and one more expresses a T3Code dependency-injection policy implemented with Effect. None should be copied into Effect Doctor as-is.

- `no-inline-schema-compile` is the only plausible cross-project Effect candidate. It should remain research-only until a current Effect benchmark proves material adapter-allocation cost. Its diagnostic currently overstates the cost because Effect memoizes the underlying parser compiler by schema AST.
- `no-manual-effect-runtime-in-tests` targets an Effect testing habit, but it converts a T3Code dependency choice into a universal ban and overlaps a more precise type-aware TSGo correctness rule.
- `no-global-process-runtime` prescribes T3Code's private `HostProcess*` services and exact source layout. The abstraction lesson is portable; the rule contract is not.
- The Node import, Uniwind theme, and native-tooltip rules are repository or UI conventions unrelated to Effect correctness.

The reusable part is architectural: a small plugin registry, explicit per-rule severities, scope-aware import tracking where needed, and black-box fixtures run through the real Oxlint executable. Effect Doctor already has the stronger product boundary: upstream providers own their rules, first-party rules need independent Effect provenance and adversarial calibration, and baseline comparison tracks finding identity rather than hard-coded debt counts.

## How the plugin is built and loaded

The plugin is a private ESM workspace, not a published general-purpose package. It depends on `@oxlint/plugins` plus Effect and uses `@effect/vitest` and Vite+ for tests ([package manifest](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/oxlint-plugin-t3code/package.json#L1-L18)). Its entry point registers six `defineRule` values with one `definePlugin` call ([registry](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/oxlint-plugin-t3code/index.ts#L1-L22)). The rules expose diagnostics only: there are no fixes, suggestions, option schemas, presets, or type-aware services.

T3Code loads the TypeScript entry point directly through Vite+'s `lint.jsPlugins`, alongside built-in Oxlint plugin families ([configuration](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/vite.config.ts#L55-L75)). Five custom rules are errors; `no-inline-schema-compile` is a warning ([severities](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/vite.config.ts#L120-L126)). The same config explicitly disables Oxlint type awareness and type checking pending integration with Effect TSGo ([options](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/vite.config.ts#L127-L131)). This makes every custom rule a local AST heuristic, even when it talks about Effect values.

The plugin's shared helpers unwrap common TypeScript expression wrappers, read static property names, and compare identifier spelling ([utilities](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/oxlint-plugin-t3code/utils.ts#L1-L58)). The more careful Uniwind rule also resolves Oxlint scope variables before following namespace aliases; the three Effect-adjacent rules generally match identifier names instead.

## Rule catalog

| Rule | What it recognizes | T3Code severity | Effect relevance | Main portability problem |
| --- | --- | --- | --- | --- |
| `namespace-node-imports` | Every `node:` import must be a namespace import with a generated `Node*` alias. | Error | None | A naming and import-style convention, including T3Code-specific acronym choices. |
| `no-global-process-runtime` | Direct `process.platform`, `process.arch`, and equivalent `node:os` calls outside one canonical file. | Error | Indirect | The prescribed replacement and sole exemption are T3Code's own `HostProcess*` services and path. |
| `no-inline-schema-compile` | An immediately invoked `Schema` decoder, encoder, guard, or assertion created inside a function from a schema that looks static. | Warning | Direct | Name-based, version-sensitive heuristic; the stated recompilation failure model is inaccurate for current Effect. |
| `no-manual-effect-runtime-in-tests` | `Effect.run*` and `ManagedRuntime.make` in test files beyond a per-file occurrence budget. | Error | Direct | Testing-library policy, identifier-name matching, and a repository debt ledger embedded in rule code. |
| `no-mobile-uniwind-theme-escape-hatches` | T3Code mobile files using selected Uniwind hooks, retired local hooks, raw appearance variants, or unapproved theme bridges. | Error | None | Exact app path, local hooks, theme architecture, and a 24-file allowlist. |
| `no-native-title-tooltip` | `title` on lowercase intrinsic JSX elements except embedded-content elements where title is an accessible name. | Error | None | Generic frontend policy with a T3Code component-specific replacement message; belongs in a UI analyzer, not Effect Doctor. |

### `namespace-node-imports`

The implementation derives a canonical alias from the Node module path and reports named imports, default imports, or differently named namespace imports ([rule](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/oxlint-plugin-t3code/rules/namespace-node-imports.ts#L3-L76)). Its fixtures cover permitted canonical aliases and rejected import forms ([tests](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/oxlint-plugin-t3code/rules/namespace-node-imports.test.ts#L7-L63)). This is a coherent T3Code style invariant, but it does not distinguish correct from incorrect Effect code.

### `no-global-process-runtime`

The rule recognizes two runtime properties, records namespace/default/named imports from `node:os`, and exempts exactly `packages/shared/src/hostProcess.ts` ([rule](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/oxlint-plugin-t3code/rules/no-global-process-runtime.ts#L6-L37), [import tracking and reports](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/oxlint-plugin-t3code/rules/no-global-process-runtime.ts#L54-L144)). The replacement diagnostic names T3Code's `HostProcessPlatform` and `HostProcessArchitecture`; the originating PR introduced those exact project services while migrating ambient reads ([PR #2959](https://github.com/pingdotgg/t3code/pull/2959)).

Using an injected service can make host-dependent behavior testable, but Effect has no universal requirement that every platform or architecture check use those T3Code tags. The matcher also treats any identifier spelled `process` as global and tracks imported names without resolving later shadowing. A portable rule would need an official Effect-owned boundary and lexical binding proof; this rule supplies neither.

### `no-inline-schema-compile`

The rule enumerates 26 Schema APIs, tracks function depth, and reports only the curried form that is immediately invoked with a schema expression it classifies as static ([method inventory](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/oxlint-plugin-t3code/rules/no-inline-schema-compile.ts#L7-L37), [classification and visitor](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/oxlint-plugin-t3code/rules/no-inline-schema-compile.ts#L39-L154)). The initial rollout hoisted a large number of T3Code schema adapters and intentionally enabled the rule only as a warning ([PR #2603](https://github.com/pingdotgg/t3code/pull/2603)). Fixtures include static module schemas, inline schema constructors, dynamic schema parameters, and module-scope adapters ([tests](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/oxlint-plugin-t3code/rules/no-inline-schema-compile.test.ts#L7-L83)).

The optimization hypothesis is plausible but the diagnostic's claim that the parser is recompiled on every call does not match current Effect internals. `decodeUnknownEffect` does allocate an adapter by calling the parser runner ([Effect source](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/SchemaParser.ts#L236-L247)), but that runner lazily delegates to a compiler ([runner](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/SchemaParser.ts#L924-L945)) whose parser cache is memoized by AST identity ([compiler cache](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/SchemaParser.ts#L1023-L1034)). Hoisting avoids adapter and wrapper allocation, but it does not necessarily avoid rebuilding the underlying parser.

The syntax matcher is also too weak for Effect Doctor's admission standard:

- It recognizes an object named `Schema`, not a binding proven to originate from Effect. A local lookalike can false-positive and an aliased Effect import can escape.
- An uppercase identifier or any member expression is considered a static schema reference. Neither shape proves module stability.
- It catches immediate invocation but misses functions that create and return a new adapter on every call.
- The hard-coded API inventory is tied to an Effect release. For example, current Effect v4 exposes `asserts` as a direct assertion rather than a curried adapter ([current contract](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/SchemaParser.ts#L158-L194)).

An independently derived Effect Doctor rule would therefore need a reproducible performance threshold on the supported Effect versions, binding-aware matching, a message limited to proven allocation, close false-positive fixtures, and corpus calibration. Without that evidence, this remains a useful review hint rather than a deterministic quality failure.

### `no-manual-effect-runtime-in-tests`

This rule applies to test filenames, recognizes twelve `Effect.run*` method names plus `ManagedRuntime.make`, and permits a hard-coded number of occurrences in 28 repository files before reporting later calls ([runtime inventory and debt ledger](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/oxlint-plugin-t3code/rules/no-manual-effect-runtime-in-tests.ts#L6-L60), [visitor](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/oxlint-plugin-t3code/rules/no-manual-effect-runtime-in-tests.ts#L62-L112)). The originating change explicitly enforced `@effect/vitest` while baselining existing T3Code debt ([PR #2994](https://github.com/pingdotgg/t3code/pull/2994)). Tests exercise every listed runtime method, `ManagedRuntime.make`, a permitted Effect-aware test, and a production boundary ([fixtures](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/oxlint-plugin-t3code/rules/no-manual-effect-runtime-in-tests.test.ts#L9-L73)).

This is not a universal Effect correctness contract. Effect TSGo already owns the actual failure: an Effect returned from a non-Effect-aware Vitest callback never runs. Its type-aware `floatingEffectInVitest` rule explicitly accepts either an Effect-aware test API or executing the Effect with `Effect.runPromise` ([official rule](https://github.com/Effect-TS/tsgo/blob/f134c316b685b70fc513d10ed9b7c899088667f5/docs/rules/floating-effect-in-vitest.md#L197-L218)). T3Code's blanket ban rejects one of the official remediation paths and can reject tests whose subject is the runtime boundary itself.

The custom rule also matches spellings rather than imports, so aliases evade it and local lookalikes can trigger it. Its numeric baseline caps aggregate occurrences rather than tracking finding identity: a removal and a new call can cancel each other, and a new early call can cause a later legacy call to receive the diagnostic. That technique is serviceable for a one-repository debt ratchet, but unsuitable for Effect Doctor's cross-project reports or baseline comparison.

### UI-only rules

`no-mobile-uniwind-theme-escape-hatches` is a sophisticated project invariant: it limits itself to `apps/mobile/src`, resolves namespace bindings, scans relevant literal forms, and encodes a reviewed interop allowlist ([rule](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/oxlint-plugin-t3code/rules/no-mobile-uniwind-theme-escape-hatches.ts#L6-L43), [visitors](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/oxlint-plugin-t3code/rules/no-mobile-uniwind-theme-escape-hatches.ts#L57-L225)). Its 25 cases deliberately probe type-only imports, shadowed namespaces, aliases, object rest, path scope, escaped templates, and reviewed exceptions ([tests](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/oxlint-plugin-t3code/rules/no-mobile-uniwind-theme-escape-hatches.test.ts#L20-L264)). This is a strong example of adversarial fixture design, but its subject is T3Code's mobile theme architecture.

`no-native-title-tooltip` distinguishes intrinsic JSX tags from custom components and exempts embedded elements where `title` serves as an accessible name ([rule](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/oxlint-plugin-t3code/rules/no-native-title-tooltip.ts#L3-L39)). The PR states that agents repeatedly reintroduced browser-native tooltips instead of T3Code's styled component ([PR #7209](https://github.com/pingdotgg/t3code/pull/7209)). This is exactly the kind of local regression a repository plugin should block. It is not an Effect rule, and its replacement message names T3Code UI components.

## Test model

The test harness is the most transferable part of the repository.

1. It resolves the real Oxlint package through Vite+ instead of assuming a package-manager-specific binary layout ([resolution](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/oxlint-plugin-t3code/test/utils.ts#L14-L22)).
2. Every case creates a scoped temporary directory, writes a minimal Oxlint config and one source file, and loads the TypeScript plugin through `jsPlugins` ([fixture construction](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/oxlint-plugin-t3code/test/utils.ts#L91-L119)).
3. It invokes the actual Oxlint CLI in a child process and captures stdout, stderr, and exit code ([execution](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/oxlint-plugin-t3code/test/utils.ts#L120-L138)).
4. Valid cases require a zero exit code. Invalid cases require a non-zero result whose output contains the expected plugin/rule identity, with optional message assertions ([assertions](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/oxlint-plugin-t3code/test/utils.ts#L140-L176)).

The six test files generate 71 cases: 26 valid controls and 45 invalid cases. That includes twelve loop-generated runtime-method cases. Coverage quality varies: the Uniwind suite is notably adversarial, while `no-inline-schema-compile` has only six cases and does not probe import aliases, shadowing, nested scopes, optional chains, or computed local lookalikes.

For Effect Doctor, retain the real-executable public-seam idea, plus explicit provider liveness and catalog completeness. Do not retain output-regex-only assertions, repository path debt counts, or rules whose own fixtures never challenge binding identity.

## Keep / adapt / reject matrix

Here, **keep** means the concept is already appropriate for Effect Doctor's core contract, **adapt** means re-derive it independently after additional evidence, and **reject** means leave it as project policy outside Effect Doctor.

| Item | Decision | Effect Doctor action |
| --- | --- | --- |
| Real Oxlint CLI fixture per rule | Keep the testing concept | Continue exercising rules through the packaged scan boundary; assert provider liveness, completeness, normalized findings, and close valid controls. Do not copy T3Code's harness. |
| Small explicit `definePlugin` registry | Keep the module shape | Keep a complete, auditable registry with stable provider provenance. Generate or test completeness so rule metadata cannot silently drift. |
| Scope-resolved import/namespace tracking | Keep the proof technique | Require proven imports and lexical variables for every syntax rule; abstain when ownership is ambiguous. |
| `no-inline-schema-compile` | Adapt only after evidence | Benchmark current supported Effect versions first. If adapter allocation is materially harmful, derive a binding-aware advisory rule and describe only the measured cost. Do not enable the current contract. |
| `no-manual-effect-runtime-in-tests` | Reject | Keep TSGo's type-aware `floatingEffectInVitest` as the correctness owner. A project may separately mandate `@effect/vitest`. |
| `no-global-process-runtime` | Reject | Do not prescribe T3Code's service tags or file layout. Consider only separately sourced, official ambient-runtime rules; TSGo already owns several such Effect-aware diagnostics. |
| `namespace-node-imports` | Reject | General code style, not Effect quality. |
| `no-mobile-uniwind-theme-escape-hatches` | Reject | T3Code mobile architecture; useful only inside that product. |
| `no-native-title-tooltip` | Reject | Frontend UX policy; a React/UI analyzer is the appropriate owner. |
| Exact-path allowlists and numeric legacy baselines | Reject | Use project configuration for intentional exceptions and Effect Doctor's finding-identity baseline comparison for introduced/resolved findings. |

No custom rule is admitted merely because T3Code uses Effect heavily. The correct outcome of a source audit can be zero new core rules.

## License and provenance

T3Code is MIT licensed at the audited revision ([license](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/LICENSE#L1-L21)). The license permits reuse and modification provided the copyright and permission notice accompany substantial copied portions. Effect Doctor is also MIT licensed, so there is no license incompatibility.

The project policy is stricter than the license: do not copy T3Code implementation, tests, messages, thresholds, or path lists. Treat the repository as prior art and use it to locate candidate failure models. Any accepted Effect Doctor rule must be independently specified from official Effect behavior or another admissible source, implemented against Effect Doctor's own interfaces, and tested with independently written adversarial fixtures. This avoids provenance ambiguity and prevents T3Code's product conventions from becoming benchmark scoring criteria.

The version gap reinforces that boundary. The audited T3Code workspace pins Effect `4.0.0-beta.103` and `@effect/tsgo` `0.13.2` ([workspace catalog](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/pnpm-workspace.yaml#L30-L64)), while Effect Doctor targets a later release candidate and TSGo catalog. Importing rule source would also import stale API assumptions; independently proving a contract against pinned supported versions makes drift visible.

## Recommendation

Do not fold the T3Code plugin into Effect Doctor. Preserve it in the research ledger as evidence for two follow-ups:

1. Run a microbenchmark for module-hoisted versus per-call Schema adapter creation on every supported Effect version, separating adapter allocation from parser compilation. Only pursue a rule if the measured cost crosses a documented threshold in realistic hot paths.
2. Add a rule-author test checklist requiring import identity, shadowing, aliasing, computed access, nested callbacks, type-only imports, supported-version drift, and close valid examples. T3Code's Uniwind fixtures demonstrate the level of adversarial coverage worth matching, even though the rule itself is out of scope.

Everything else should stay where T3Code put it: in a repository-specific Oxlint plugin.
