# Kit Effect skill rule audit

Audit date: 2026-08-30

Source revision: [`kitlangton/skills@22c35cb`](https://github.com/kitlangton/skills/tree/22c35cb7fd29f931789253fc3c8eb142f2863a8a/skills/effect), licensed MIT. The audit read the complete [`SKILL.md`](https://github.com/kitlangton/skills/blob/22c35cb7fd29f931789253fc3c8eb142f2863a8a/skills/effect/SKILL.md) and all eight referenced guides: caching, configuration, HTTP clients, scheduling, schema, services and layers, streams, and testing.

The skill is a source of candidate contracts, not a verifier preset. EffectBench will compare agents with and without skill context. If Effect Doctor simply encoded every stylistic preference from that context, it would reward resemblance to one treatment instead of independently measuring correctness. A recommendation enters the default verifier only when a local syntax rule can prove a concrete problem without guessing types, business meaning, or team policy.

## Result

Two previously uncovered contracts became first-party Oxlint rules:

| Rule | Locally proven condition | Important abstentions |
| --- | --- | --- |
| `effect-doctor/no-network-in-sql-transaction` | A global `fetch` adapted directly with `Effect.promise` / `Effect.tryPromise`, or a direct Effect `HttpClient` accessor, occurs inside the effect passed to `withTransaction` on a lexically proven Effect `SqlClient`. | Indirect effect values, service methods whose implementation is unknown, unproven SQL clients, unrelated `withTransaction` methods, deferred function values, and calls completed before the transaction. |
| `effect-doctor/no-long-lived-layer-acquisition` | `Layer.effect`, `Layer.effectContext`, or `Layer.effectDiscard` directly runs a proven `Effect.never`, `Effect.forever`, unbounded `Stream.never` / `Stream.forever` consumer, or a top-level delegated yield of one of those. | Forked work, finite or unknown streams, indirect Effect values, effects stored in service members, nested functions, lookalike modules, and any shape whose lifetime is not locally evident. |

Both rules are advisory. Their executable contracts include invalid examples and close valid controls through the packaged `scanProject` boundary.

## Existing ownership

The following skill guidance was already encoded, so Effect Doctor keeps the upstream identity instead of cloning it under a first-party name.

| Skill area | Existing rule ownership |
| --- | --- |
| Construct a shared cache once in its owning layer | Default-blocking `effect/no-per-call-cache-construction` from `oxlint-plugin-effect`. |
| Bound retry policies | Default-blocking `effect/no-unbounded-retry` from `oxlint-plugin-effect`. |
| Bound collection concurrency | Default-blocking `effect/no-unbounded-concurrency` from `oxlint-plugin-effect`. |
| Do not collect a clearly unbounded stream | Default-blocking `effect/no-run-collect-on-unbounded-stream` from `oxlint-plugin-effect`. |
| Prefer test service layers to module mocks | Default-advisory `effect/no-module-mocks` from `oxlint-plugin-effect`. |
| Validate Layer implementations with `Service.of` | Default-advisory `effect/prefer-service-of` from `oxlint-plugin-effect`. |
| Give `Effect.fn` operations stable names | Default-advisory `effect/require-named-effect-fn`, with the broader `effect/prefer-effect-fn` delegated to TSGo. |
| Recover typed tagged failures specifically | Default-advisory `effect/prefer-catch-tag` plus TSGo's catch/refail transformations. |
| Prevent dependent layers from being blindly merged | Default-advisory TSGo `effect/layer-merge-all-with-dependencies`. |
| Choose a scoped Layer constructor when acquisition needs `Scope` | Default-advisory TSGo `effect/scope-in-layer-effect`. |
| Keep Effect values from floating in tests and ordinary code | Default-blocking TSGo `effect/floating-effect-in-vitest` and `effect/floating-effect`. |
| Preserve errors and required services at program boundaries | Default-blocking TSGo missing-error, missing-context, and missing-layer-context diagnostics. |
| Redact statically named credentials | First-party `effect-doctor/prefer-config-redacted`. |
| Preserve cancellation in raw fetch adapters | First-party `effect-doctor/prefer-abort-signal-passthrough`. |
| Let Effect own SQL transaction control | First-party `effect-doctor/no-manual-sql-transaction`. |

Several other recommendations already exist in the exhaustive catalog but remain disabled or preview-only under their provider's policy: `effect/effect-fn-opportunity`, `effect/process-env`, `effect/process-env-in-effect`, `effect/global-fetch`, `effect/global-fetch-in-effect`, `effect/global-timers`, `effect/global-timers-in-effect`, `effect/extends-native-error`, `effect/prefer-schema-over-json`, `effect/prefer-typed-schema-decoder`, `effect/schema-struct-with-tag`, `effect/strict-effect-provide`, and the cause-aware catch transformations. They remain discoverable through `effect-doctor rules list` and `rules explain`; a syntax duplicate would be less accurate than the type-aware TSGo rule.

## Guidance that is not a universal syntax invariant

The remaining recommendations are useful design guidance but are deliberately not default lint findings:

- Choosing `Schema.Struct` over `Schema.Class`, a same-name interface, `Data.TaggedEnum`, a brand, or a tagged schema depends on domain and serialization needs.
- `Schema.optionalKey`, `Schema.optional`, nullish schemas, defaults, and decoder selection describe boundary semantics that syntax alone cannot infer.
- Whether a native error should become `Schema.TaggedError`, or broad cause handling can become typed-error handling, requires knowledge of the failure boundary.
- Whether `Context.Reference` hides required authority, `Layer.provideMerge` exposes a dependency intentionally, or a `Layer.mergeAll` is “blind” requires service-graph semantics; TSGo owns the provable graph failures.
- Whether retry is idempotent, a failure has a truthful fallback, an HTTP status must be classified before decoding, or an error payload should be decoded requires protocol semantics.
- Whether a `Map` should become `Cache`, one value should use `Effect.cached`, a resource needs `ScopedCache`, or a backend supports real request batching cannot be proven from a local AST shape.
- Whether `Queue`, `PubSub`, `SubscriptionRef`, `Stream`, or an ordinary Effect is the correct abstraction depends on delivery and lifetime requirements.
- An `Effect.sleep` in `it.effect` is driven by Effect's test clock; a blanket test-sleep rule would reject deterministic code. Real-time `it.live` tests can also be intentional. The verifier instead keeps the actual floating-test failure typed and blocking.
- Module namespace layout, export style, handler thinness, service naming, and the threshold for “non-trivial” `Effect.fn` operations are human architecture conventions.

These decisions keep the benchmark treatments independent from the quality verifier while still turning the skill's concrete resource-safety lessons into deterministic checks.
