# Additional ecosystem guidance rule audit

Audit date: 2026-08-30

## Verdict

The four sources contain useful evidence, but they are not safe presets for Effect Doctor. After normalizing repeated examples into guidance families, this audit reviewed 123 source-local units: 10 candidate or admitted mentions, 54 delegations to an existing owner, and 59 rejections. The 10 positive mentions collapse to six distinct deterministic contracts because several sources repeat the same advice.

One contract has already been admitted as the narrow first-party `effect-doctor/no-throw-in-effect-generator` rule. Two existing secret-handling contracts were strengthened during the same pass: `effect-doctor/prefer-config-redacted` now recognizes proven `Config.schema` string secrets, and `effect-doctor/no-unredacted-value-in-diagnostic` covers Effect telemetry annotation sinks. Five contracts remain worth implementing or prototyping:

1. duplicate runtime keys for unrelated `Context.Service` declarations;
2. acquired Atom listeners or timers without a matching Atom finalizer;
3. `Effect.promise` around a promise operation statically known to reject;
4. a discarded, detached, provably long-lived fiber during Layer acquisition; and
5. `Option.getOrThrow` escaping from a proven Effect generator, as advisory-only because an intentional defect is sometimes valid.

Creating an Atom during a React render remains a research hold. Component recognition, hook stabilization, and deliberate per-instance Atom identity need corpus evidence before a deterministic rule can distinguish a defect from an intentional local Atom.

## Pinned inputs and baseline

| Input | Pinned revision | Authority and drift assessment |
| --- | --- | --- |
| Effect Doctor catalog | [`de68826`](https://github.com/ocarinalabs/effect-doctor/tree/de6882674142c1c644765a3b708ee9c994ace183) | Audit baseline: 154 rules, comprising 15 first-party rules, 99 `@effect/tsgo` rules, and 40 `oxlint-plugin-effect` rules. The admitted generator rule makes the post-audit first-party count 16. |
| Effect | [`effect@4.0.0-rc.112` / `2600f62`](https://github.com/Effect-TS/effect/tree/2600f62f4532026928454dcea8d1c48557b3f942) | Primary API and runtime authority. |
| `@effect/tsgo` | [`0.38.0` / `73b4c54`](https://github.com/Effect-TS/tsgo/tree/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9) | Primary owner for semantic and type-aware diagnostics; 99 entries are represented in the Effect Doctor baseline catalog. |
| `oxlint-plugin-effect` | [`0.11.0` / `f3464b3`](https://github.com/cevr/effect-oxlint/blob/f3464b3a1c3cacf55965ed2aa273b4accd715bfa/README.md) | Primary owner for import-local syntax policy; 40 entries are represented in the baseline catalog. |
| Effect Solutions | [`09f82e6`](https://github.com/kitlangton/effect-solutions/tree/09f82e6c5c928e7232cd32daf04d7c6a830b63f7) | MIT. Its own README calls it opinionated and living guidance. It is pinned to `effect@4.0.0-beta.59`, so examples are evidence only. |
| Joel Hooks' Effect skill | [`0a7a0d9`](https://github.com/joelhooks/effectts-skills/tree/0a7a0d984033fa6d6ff4ef2b50bdd9eb06a3a6c5) | `package.json` declares MIT, but the repository has no license text. It is derivative guidance with material RC.112 API drift, so this report only paraphrases it. |
| Biome Effect linting rules | [`d527248`](https://github.com/OperationalFallacy/biome-effect-linting-rules/tree/d5272489aa8fe47ae72f3d9fb841847246379093) | MIT. Fifty-three Grit rules were read individually. The project describes the rules as opinionated and notes that its demonstration required steering. |
| Betalyra Effect skill PR | [PR #4 head `c248ce5`](https://github.com/betalyra/effect-skills/tree/c248ce5043d6ecc08c9710f1dd39ef4edd283879/effect-best-practices-v4) | MIT. The PR is still open and was authored against `4.0.0-beta.101`; it is candidate evidence, not release authority. |

The baseline comparison includes disabled and advisory provider rules. A disabled upstream rule still owns its diagnostic contract; Effect Doctor must not clone it merely to make it default-on. A narrower first-party rule is justified only when its failure model and abstentions are materially different.

## Admitted and extended contracts

### `effect-doctor/no-throw-in-effect-generator`

Betalyra and Joel both warn that an escaping throw in `Effect.gen` bypasses the typed error channel. The broad `effect/no-throw-statement` rule already exists, but it rejects every throw in every context. The admitted rule has a narrower correctness contract:

- prove `Effect.gen`, `Effect.fn`, `Effect.fnUntraced`, or `Effect.fnUntracedEager` through an import from `effect` or `effect/Effect`;
- inspect only the inline generator owned by that constructor;
- report a `throw` only when it escapes that generator;
- abstain for test files, throws in nested functions, throws caught by an enclosing `try`/`catch` before the generator boundary, unrelated lookalike modules, and ordinary non-Effect code.

The message recommends a yielded typed error or an explicit `Effect.die`. That distinction matters: the rule does not claim that all defects are forbidden; it makes an otherwise implicit defect explicit.

### Secret configuration and telemetry extensions

Effect Solutions and both skills repeat two concrete security lessons already owned by Effect Doctor:

- `prefer-config-redacted` continues to catch `Config.string` for statically secret names and now also catches import-proven `Config.schema(Schema.String | Schema.NonEmptyString, "SECRET_NAME")`; dynamic names, transformed schemas, public identifiers, and unknown bindings abstain.
- `no-unredacted-value-in-diagnostic` treats import-proven `Effect.annotateCurrentSpan`, `annotateLogs`, `annotateLogsScoped`, and `annotateSpans` as diagnostic sinks alongside Effect logs, console diagnostics, and native `Error` construction. It still requires a proven `Redacted.value` binding and does not warn at an unknown or trusted protocol boundary.

These are extensions of existing identities, not new catalog aliases.

## Remaining candidate contracts

### 1. `effect-doctor/no-duplicate-context-service-key`

This is the strongest uncovered project-level candidate. Effect Solutions and Joel say service identifiers must be unique, while the RC.112 source provides the actual failure model: a service's string key is its runtime identity, and unrelated services with the same key occupy the same Context slot ([`Context.Service`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Context.ts#L151-L170), [runtime storage](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Context.ts#L589-L622)). TSGo's [`deterministicKeys`](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/docs/rules/deterministic-keys.md) enforces a naming convention; it does not report duplicate runtime identities directly.

Required proof:

- recognize `Context.Service<Shape>("literal")`, `Context.Service<Self, Shape>()("literal")`, and the class form with a `make` option;
- prove `Context` or `Service` through `effect` or `effect/Context`, including import aliases;
- collect literal keys across canonical project-relative files and compare distinct declaration sites deterministically;
- initially report only declarations with distinct declared symbols or visibly distinct inline shapes, and report every conflicting site in stable path order.

Required abstentions:

- computed or concatenated keys;
- a re-export or alias of one declaration;
- the same physical file reached through multiple project references;
- deliberately shared protocol keys whose declarations cannot be proven unrelated;
- `Context.Reference` until cross-kind identity behavior and intentional sharing are calibrated.

This must be a project aggregation pass, not a file-local Oxlint visitor.

### 2. `effect-doctor/require-atom-resource-finalizer`

Betalyra's Atom guidance identifies listener cleanup as mandatory. RC.112 independently demonstrates the same lifetime contract: `AtomContext` exposes `addFinalizer`, the built-in debounce clears its timer on disposal, and `windowFocusSignal` removes the exact listener it acquired ([context API](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/unstable/reactivity/Atom.ts#L154-L180), [timer cleanup](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/unstable/reactivity/Atom.ts#L2156-L2215), [listener cleanup](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/unstable/reactivity/Atom.ts#L2645-L2668)).

Required proof:

- prove `Atom.make`, `Atom.readable`, or `Atom.transform` from the exported `effect/unstable/reactivity` entrypoint;
- identify the exact read-context parameter;
- match a direct `target.addEventListener(staticEvent, handler)` with `get.addFinalizer(() => target.removeEventListener(staticEvent, handler))` in the same callback;
- for timers, require the same local handle to flow from `setTimeout` / `setInterval` to `clearTimeout` / `clearInterval` in that finalizer.

Required abstentions:

- `{ once: true }` or a statically present signal-owned listener;
- an Effect-valued Atom whose resource is managed by `acquireRelease`, `Scope`, or another known managed abstraction;
- `get.subscribe`, which the Atom runtime owns;
- helper calls, dynamic event names, dynamic handlers, or cleanup hidden outside the local callback;
- resource acquisition outside the Atom read callback.

### 3. `effect-doctor/no-promise-for-known-rejection`

Effect Solutions' `use` pattern uses a rejection-aware adapter at an external boundary. The official contract is definitive: `Effect.promise` is for a Promise guaranteed not to reject; rejection becomes a defect, and `Effect.tryPromise` is the failure-aware alternative ([`promise`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Effect.ts#L1292-L1334), [`tryPromise`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Effect.ts#L1336-L1410)). Existing provider rules find a Promise in an Effect success channel or a Promise returned from `Effect.sync`; neither proves this constructor mismatch.

The first version should match only an import-proven `Effect.promise` callback that directly returns:

- an unshadowed global `fetch(...)`, including a `.then(...)` chain without a rejection handler; or
- an unshadowed `Promise.reject(...)`.

It must abstain for `Promise.resolve`, unknown Promise APIs, locally shadowed `fetch` or `Promise`, a chain with a local recovery that guarantees resolution, an async body with explicit recovery, and `Effect.tryPromise`. A fetch finding may coexist with `prefer-abort-signal-passthrough`: one concerns rejection semantics, the other interruption.

### 4. `effect-doctor/no-detached-long-lived-layer-fiber`

Joel's source uses the removed name `forkDaemon`, but its lifetime warning survives translation to current `Effect.forkDetach`. RC.112 says a detached fiber is attached to global scope and continues after its parent terminates ([`forkDetach`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Effect.ts#L17145-L17183)). Betalyra's Layer example instead uses `forkScoped` for background work.

The safe initial rule is deliberately narrower than “never detach”:

- prove `Layer.effect`, `Layer.effectContext`, or `Layer.effectDiscard` and `Effect.forkDetach` imports;
- prove the detached input is already recognized as long-lived by the existing Layer contract, such as `Effect.never`, `Effect.forever`, or a direct unbounded Stream consumer;
- report only when the resulting Fiber is discarded by a top-level delegated yield or an `asVoid`-like wrapper during acquisition.

Abstain when the Fiber is bound, joined, interrupted, registered with a finalizer, forked into an explicit scope, or created outside Layer acquisition. This complements `no-long-lived-layer-acquisition`: that rule catches blocking acquisition; this candidate catches the opposite escape from Layer ownership.

### 5. `effect-doctor/no-option-get-or-throw-in-effect`

Joel and Betalyra both discourage `Option.getOrThrow`. The RC.112 source confirms that `getOrThrow` and `getOrThrowWith` throw for `None`, while also documenting fail-fast extraction as an intentional use case ([`Option.getOrThrowWith`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Option.ts#L1280-L1387), [`Option.getOrThrow`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Option.ts#L1389-L1422)). A blanket ban would therefore contradict the official API.

An advisory prototype may report only a direct import-proven `Option.getOrThrow` or `getOrThrowWith` in a proven `Effect.gen` / `Effect.fn` generator where the throw can escape. It must abstain for nested functions, local recovery (`Result.try`, an enclosing catch, or another proven capture boundary), a statically known `Some`, and ordinary non-Effect code. Corpus calibration must determine whether this adds value beyond asking authors to make intentional defects explicit with `Effect.orDie` or `Effect.die`.

## Effect Solutions inventory

The 24 normalized families below cover the complete 15-document guidance set; repeated code examples are not counted again.

| Guidance family | Disposition | Existing owner or reason |
| --- | --- | --- |
| Agent-guided setup and local source cloning | Reject | Benchmark context treatment and developer workflow, not a code diagnostic. |
| Effect language-service and workspace TypeScript setup | Reject | Tool configuration; the pinned guide still references the pre-TSGo language-service path. |
| Recommended `tsconfig` profiles | Reject | Build-target and module-system policy. |
| `Effect.gen`, named `Effect.fn`, and instrumentation through `pipe` | Delegate | `effect/effect-fn-opportunity`, `effect/prefer-effect-fn`, `effect/require-named-effect-fn`, and first-party span-name consistency. |
| Bounded retry and timeout | Delegate | `effect/no-unbounded-retry`; timeout choice remains semantic. |
| Unique service identifiers | Candidate | Project-wide duplicate-key contract described above. |
| No service requirements leaking through method return types | Delegate | TSGo `effect/leaking-requirements`, missing context, and missing service dependency diagnostics. |
| Readonly service properties | Reject | Interface style; mutation safety cannot be inferred from a property modifier alone. |
| Provide dependencies at an application/composition boundary | Delegate | `effect/no-inline-provide`, `effect/multiple-effect-provide`, and `effect/strict-effect-provide`. |
| Reuse parameterized Layer values | Delegate | `effect-doctor/no-duplicate-layer-factory-call` and `effect/no-per-call-cache-construction`. |
| Fresh test Layer by default; share only expensive resources | Reject | Test isolation and cost policy; actual floating test Effects are already typed. |
| Schema-backed boundary decoding and encoding | Delegate | `effect/prefer-schema-over-json`, `effect/prefer-typed-schema-decoder`, and schema diagnostics. |
| Schema class/struct selection and branding nearly every primitive | Reject | Domain modeling. Bare brands and broad branding policies conflict across audited sources. |
| Tagged typed errors and tag-specific recovery | Delegate | `effect/prefer-catch-tag`, catch transformations, error/channel diagnostics, and yieldable-error rules. |
| Typed errors versus defects and where defects may be caught | Reject | Requires knowledge of recoverability and the system boundary. |
| A dedicated Config service/Layer architecture | Reject | Useful composition style, not a universal invariant. |
| Config validation and defaults | Reject | Required range and fallback semantics belong to the application. |
| Redacted secret configuration | Delegate/extend | `effect-doctor/prefer-config-redacted`, including the admitted `Config.schema` extension. |
| `@effect/vitest`, `it.effect`, and TestClock | Delegate narrowly | TSGo catches floating Effects in Vitest; framework selection and `it.live` remain project choices. |
| Schema-decoded HTTP payloads | Delegate | Typed Schema decoder and JSON-boundary rules. |
| HTTP status mapping, middleware, and retry classification | Reject | Protocol semantics and idempotency are not local syntax facts. |
| Named service spans and structured telemetry | Delegate/extend | Provider `Effect.fn` rules plus first-party structured-log, span-name, and Redacted diagnostic checks. |
| CLI descriptions and flag/argument ordering | Reject | Product UX and parser behavior, not general Effect correctness. |
| Promise-based client `use` wrapper with cancellation | Candidate/Delegate | Known rejection is the `Effect.promise` candidate; cancellation is already `prefer-abort-signal-passthrough`. |

Count: 2 candidate families, 11 delegated families, and 11 rejected families.

## Joel Hooks skill inventory

The skill substantially derives from Effect Solutions and artimath material. It adds no unique authority and contains multiple APIs absent in RC.112, including `ServiceMap.Service`, `Schema.TaggedErrorClass`, `Effect.forkDaemon`, root `@effect/platform`, and `Schema.Date`. Its 22 normalized families map as follows.

| Guidance family | Disposition | Existing owner or reason |
| --- | --- | --- |
| Source-first mirror workflow | Reject | Agent treatment, not generated-code quality. |
| `Effect.gen` and named `Effect.fn` | Delegate | Existing provider and first-party naming rules. |
| Unique service tags | Candidate corroboration | Duplicate `Context.Service` runtime-key candidate; translate away from stale `ServiceMap`. |
| Service methods with `R = never` | Delegate | TSGo leaking/missing-requirement diagnostics. |
| Readonly service members | Reject | Style, not sufficient mutation proof. |
| Choosing Struct, Class, and TaggedClass | Reject | Domain and equality semantics. |
| Branding domain primitives only with constraints | Reject | Project modeling policy and inconsistent with Effect Solutions' bare-brand examples. |
| Tagged errors and targeted recovery | Delegate | Existing error, catch, and outdated-API rules; literal API examples are stale. |
| Provide once | Delegate | Existing provisioning rules. |
| Reuse Layer constructor results | Delegate | Existing Layer identity rules. |
| Choose `Layer.sync` versus `Layer.effect` | Reject | Depends on implementation effects and ownership. |
| Effect-aware tests and fresh test layers | Reject | Framework and isolation policy. |
| Config layer and secret redaction | Delegate/extend | Existing Redacted configuration contract. |
| Decode boundaries instead of casting | Delegate | Schema decoder, no-assertion, and unsafe Effect assertion rules. |
| Effect HTTP clients and bounded retry | Delegate | Global capability, decoder, and retry rules. |
| Detached-fiber cleanup and scope ownership | Candidate corroboration | Translate removed `forkDaemon` to the narrow `forkDetach` Layer candidate. |
| Effect Command instead of raw child processes | Delegate | Provider Node-capability rules; the root import shown by the skill is stale. |
| Avoid `Option.getOrThrow` inside Effect code | Candidate corroboration | Advisory generator-only contract. |
| Console, environment, and nullish domain values | Delegate | Provider global-console, process-env, no-globals, and no-nullish rules. |
| Nested runners, throw, and broad catch | Delegate/admit | TSGo runners/catch rules plus the admitted generator-only throw rule. |
| v4 migration names | Delegate | TypeScript and `effect/outdated-api`; never encode the stale replacement names. |
| CLI help and flag ordering | Reject | Application UX. |

Count: 3 candidate/corroborating families, 12 delegated families, and 7 rejected families.

## Biome rule-pack inventory

The 53 Grit rules are exact countable units. None should be copied into Effect Doctor. Sixteen delegate to an existing, stronger owner:

| Biome rule | Existing owner |
| --- | --- |
| `no-effect-all-step-sequencing` | `effect/no-sequential-effect-all` |
| `no-effect-bind` | `effect/no-effect-bind` |
| `no-effect-do` | `effect/no-effect-do` |
| `no-effect-sync-console` | `effect/global-console`, `effect/global-console-in-effect`, or `effect/no-globals` |
| `no-flatmap-ladder` | TSGo `effect/effect-map-flatten` and `effect/missed-pipeable-opportunity` |
| `no-fromnullable-nullish-coalesce` | `effect/no-nullish` |
| `no-inline-runtime-provide` | `effect/no-inline-provide`, `effect/multiple-effect-provide`, and `effect/strict-effect-provide` |
| `no-manual-data-guard` | `effect/no-runtime-typeof`, Schema boundary diagnostics |
| `no-model-overlay-cast` | `effect/no-as`, `effect/no-widen-then-assert`, and `effect/unsafe-effect-type-assertion` |
| `no-nested-effect-gen` | `effect/no-nested-effect-gen` and TSGo's nested-generator diagnostics |
| `no-pipe-ladder` | TSGo `effect/unnecessary-pipe-chain` |
| `no-return-null` | `effect/no-nullish` |
| `no-ternary` | `effect/no-ternary` |
| `no-try-catch` | `effect/no-try-catch` and `effect/try-catch-in-effect-gen` |
| `no-unknown-boolean-coercion-helper` | Runtime-guard and typed-Schema boundary rules |
| `prevent-dynamic-imports` | `effect/no-dynamic-imports` |

The remaining 37 rules are rejected:

| Rejected rules | Reason |
| --- | --- |
| `no-effect-as`, `no-option-as`, `no-effect-async`, `no-effect-never`, `no-runtime-runfork`, `warn-effect-sync-wrapper` | Blanket bans contradict valid official APIs or explicit application boundaries. The pinned `oxlint-plugin-effect` preset intentionally allows the first five relevant shapes. `Effect.sync` is the official constructor for synchronous side effects. |
| `no-effect-fn-generator` | Directly conflicts with the official and provider-supported `Effect.fn` generator form. |
| `no-arrow-ladder`, `no-branch-in-object`, `no-call-tower`, `no-effect-ladder`, `no-effect-orElse-ladder`, `no-effect-side-effect-wrapper`, `no-effect-step-const-staging`, `no-effect-succeed-variable`, `no-fragmented-const-assembly`, `no-if-statement`, `no-iife-wrapper`, `no-match-effect-branch`, `no-match-void-branch`, `no-nested-effect-call`, `no-pipeline-fragment-staging`, `no-return-in-arrow`, `no-return-in-callback`, `no-switch-statement` | Readability preferences or overbroad code-shape bans. Existing TSGo cleanup rules own the few mechanically equivalent subsets. |
| `no-effect-type-alias`, `no-effect-wrapper-alias`, `no-manual-effect-channels` | API and type-surface design policy. Explicit return and channel types can be valuable public documentation. |
| `no-atom-registry-effect-sync`, `no-family-collection-read`, `no-naked-object-state-update`, `no-option-boolean-normalization`, `no-react-state`, `no-render-side-effects`, `no-wrapgraphql-catchall` | Application-, React-, Atom-, or GraphQL-specific architecture. Several patterns rely on identifier spelling rather than import or type proof. |
| `no-string-sentinel-const`, `no-string-sentinel-return` | The first matches every string constant and the second every successful string; neither proves a sentinel. |

For clarity, the 37 rejected rule names are: `no-arrow-ladder`, `no-atom-registry-effect-sync`, `no-branch-in-object`, `no-call-tower`, `no-effect-as`, `no-effect-async`, `no-effect-fn-generator`, `no-effect-ladder`, `no-effect-never`, `no-effect-orElse-ladder`, `no-effect-side-effect-wrapper`, `no-effect-step-const-staging`, `no-effect-succeed-variable`, `no-effect-type-alias`, `no-effect-wrapper-alias`, `no-family-collection-read`, `no-fragmented-const-assembly`, `no-if-statement`, `no-iife-wrapper`, `no-manual-effect-channels`, `no-match-effect-branch`, `no-match-void-branch`, `no-naked-object-state-update`, `no-nested-effect-call`, `no-option-as`, `no-option-boolean-normalization`, `no-pipeline-fragment-staging`, `no-react-state`, `no-render-side-effects`, `no-return-in-arrow`, `no-return-in-callback`, `no-runtime-runfork`, `no-string-sentinel-const`, `no-string-sentinel-return`, `no-switch-statement`, `no-wrapgraphql-catchall`, and `warn-effect-sync-wrapper`.

Count: 16 delegations and 37 rejections; zero new candidates.

## Betalyra PR inventory

### Twenty-one named anti-patterns

| Named anti-pattern | Disposition |
| --- | --- |
| v3 APIs that no longer exist | Delegate to TypeScript and `effect/outdated-api`; the PR's own replacement `Schema.TaggedErrorClass` is now stale. |
| `runSync` / `runPromise` inside services | Delegate to `effect/run-effect-inside-effect`; first-party synchronous-runner rule owns only provably suspending inputs. |
| `throw` inside an Effect generator | Admitted narrowly as `effect-doctor/no-throw-in-effect-generator`. |
| Yielding a non-succeeding error without `return` | Delegate to `effect/missing-return-yield-star`. |
| Broad `Effect.catch` losing error information | Delegate to tagged-catch, silent-catch, and type-aware catch transformations. |
| Variadic `catchTag` | Delegate to TypeScript and outdated-API diagnostics. |
| `any` / `unknown` casts | Delegate to provider assertion and channel rules. |
| Promise-returning members in a service interface | Reject as universal rule. `Context.Service` is generic dependency injection and may intentionally expose a host SDK boundary. |
| `console.log` | Delegate to global-console / no-globals rules. |
| direct `process.env` | Delegate to process-env / no-globals rules. |
| nullish domain fields | Delegate to the cataloged no-nullish policy; whether it blocks remains provider policy. |
| `Option.getOrThrow` | Candidate, restricted to escaping calls in proven Effect generators and advisory-only. |
| `orDie` | Reject as a blanket rule. It is valid when the caller explicitly chooses an unrecoverable boundary. |
| `mapError` instead of `catchTag` | Reject as a blanket rule. `mapError` is an official error transformation and TSGo already recognizes redundant or mechanically improvable cases. |
| mixed Effect and Promise chains | Delegate to Promise-control-flow and Effect-success Promise rules; unknown interop boundaries must abstain. |
| mutable closure state without `Ref` | Reject. Local mutation can be isolated and safe; concurrency and sharing require semantic proof. |
| yielding `Ref`, `Deferred`, or `Fiber` under stale subtyping assumptions | Delegate to TypeScript / outdated API checks. |
| `Date.now()` / `new Date()` | Delegate to TSGo global-date diagnostics or the no-globals provider policy. |
| deprecated generator adapter | Delegate to `effect/effect-gen-uses-adapter`. |
| piping the constructed result of `Effect.fn` | Delegate to TypeScript and existing `Effect.fn` diagnostics; only failing current forms should be reported. |
| removed service accessors | Delegate to TypeScript and `effect/outdated-api`. |

The named list accounts for one admitted contract, one remaining candidate, 15 delegations, and 4 rejections.

### Additional positive-pattern evidence

Three positive sections add candidate evidence beyond the anti-pattern headings:

- namespaced service identifiers corroborate the duplicate runtime-key candidate, but a rule should enforce actual collision rather than one preferred namespace format;
- Atom listener cleanup corroborates `require-atom-resource-finalizer`;
- Layer background-work examples use `forkScoped`, corroborating the narrow detached-long-lived Layer candidate.

The other positive guidance delegates or remains human policy:

| Topic | Disposition |
| --- | --- |
| Data-first `pipe`, `Effect.fn`, stable names, and qualified `Service.method` span names | Existing pipe and `Effect.fn` rules own provable syntax. Requiring a qualified telemetry naming convention is style; the current consistency rule deliberately permits qualified names. |
| Context services, access, dependency wiring, Layer naming, Layer memoization, lazy Layers, and `LayerMap` | API drift goes to `outdated-api`; graph failures go to TSGo; naming and architecture remain policy; duplicate Layer identity is already first-party. |
| Error specificity, reason errors, error remapping, retryable errors, and HTTP status mapping | Tagged recovery and unbounded retry have owners; domain taxonomy and remapping remain semantic. |
| Branding, Struct/Class selection, checks, transforms, optional fields, unions, recursion, and annotations | Typechecking and Schema diagnostics own invalid forms; the model itself belongs to the domain. |
| Atom placement, `keepAlive`, families, React hooks, AsyncResult rendering, batching, and optimistic state | Hold or reject until component identity and lifecycle semantics can be proven. Only local resource cleanup is ready. |
| RPC, cluster, workflow, activity schemas, deduplication keys, and middleware | Typechecking catches invalid APIs; required schema/error/idempotency decisions are protocol policy. |
| Structured logs, metrics, spans, Config, and secret telemetry | Existing provider rules plus the two secret-handling extensions. Do not require every service method to emit a particular annotation set. |
| Test variants, shared Layers, TestClock, property tests, and assertions | Test framework and isolation policy; actual floating Effects remain typed. |
| Vercel AI SDK schema conversion and runtime capture | Integration guidance, not a universal Effect invariant; current typechecking owns API drift. |
| Equality, `Equivalence`, `Order`, and predicate combinators | Domain semantics and style. A hand-written predicate is not inherently incorrect. |

Including the three supplemental candidate sections, the PR contributes five positive/admitted mentions, 15 delegations, and 4 rejections across 24 counted units.

## Version-drift findings

No community source may supply a replacement API without RC.112 verification.

- Effect Solutions is pinned to beta.59 and still points agents at `effect-smol`, mentions `Effect.Service`, and uses `Schema.TaggedErrorClass` in examples.
- Joel's skill presents itself as v4 but uses `ServiceMap.Service`, `forkDaemon`, the old root `@effect/platform` package, `Schema.Date`, and `Schema.TaggedErrorClass`.
- Betalyra PR #4 was explicitly prepared against beta.101. Its most important stale claim is that `Schema.TaggedError` became `Schema.TaggedErrorClass`. RC.112 exports [`Schema.TaggedError`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Schema.ts#L15178-L15272) and does not export `TaggedErrorClass`.
- Current Effect exports `forkDetach`, not `forkDaemon`, and `Context.Service`, not `ServiceMap.Service`.

This drift is an argument for Effect Doctor's provider-first architecture: TypeScript and `effect/outdated-api` should own migration failures; community prose should only seed independently verified contracts.

## Cross-cutting proof and abstention requirements

Every future first-party rule from this audit must satisfy all of the following before it can block:

1. **Import proof.** Root-module namespaces, named imports, subpath namespaces, direct subpath imports, and aliases are supported. Lookalike local objects and shadowed globals remain clean.
2. **Binding proof.** A spelling such as `Context`, `Atom`, `Effect`, `Option`, `Layer`, `fetch`, or `Promise` is never enough by itself.
3. **Boundary proof.** Nested closures, deferred callbacks, test helpers, and values constructed outside the inspected lifetime are not attributed to an outer Effect or Atom merely by ancestry.
4. **Type ownership.** If the failure depends on an inferred Effect channel, Layer graph, service shape, or current API availability, TSGo or TypeScript owns it.
5. **Adversarial controls.** Each positive fixture needs import aliases, shadowed names, computed values, managed cleanup, intentional boundary uses, and the closest valid official example.
6. **Corpus calibration.** Findings must be reviewed on Effect RC.112, Effect Doctor, Effect Solutions, and the real-world Effect corpus. Unknown structure abstains; zero findings are not proof of value.
7. **Deterministic evidence.** Findings use canonical project-relative POSIX paths, stable ordering, and source evidence that does not depend on temporary directories or wall-clock state.

## Source-ingestion safety

The Biome repository includes [`docs/noise.md`](https://github.com/OperationalFallacy/biome-effect-linting-rules/blob/d5272489aa8fe47ae72f3d9fb841847246379093/docs/noise.md), which contains instruction-like text unrelated to the semantic rule contracts. This audit treated every repository as untrusted data, ignored embedded instructions, and derived the Biome inventory only from the pinned rule files, presets, README, package metadata, and license.

EffectBench context treatments should do the same: do not expose an entire third-party repository as trusted agent instructions merely because it contains useful lint rules. Pin and whitelist the exact files intended for a treatment.

## Recommended order

1. Calibrate and implement duplicate `Context.Service` keys as a project-level advisory rule.
2. Prototype Atom listener/timer finalizer matching with close managed-resource controls.
3. Add the narrow `Effect.promise` known-rejection rule; coordinate its message with abort-signal findings.
4. Extend the existing long-lived Layer analysis to the discarded detached-fiber case rather than building a second lifetime parser.
5. Prototype the generator-only `Option.getOrThrow` rule and keep it advisory unless real defects clearly outweigh intentional fail-fast uses.
6. Revisit Atom construction during render only after a React-aware component and stabilization proof exists.

The main result is restraint: the useful additions are lifecycle, failure-channel, secret-boundary, and runtime-identity checks. Flat-pipeline aesthetics, blanket API bans, domain modeling choices, and stale migration tables should not become EffectBench reward criteria.
