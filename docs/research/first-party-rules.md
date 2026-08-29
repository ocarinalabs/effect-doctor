# First-party rule contracts

Research and calibration date: 2026-08-29

Effect Doctor currently catalogs 146 rules: 99 from `@effect/tsgo`, 40 from `oxlint-plugin-effect`, and 7 first-party rules. The first-party rules are deliberately small, import-aware, and advisory. They fill contracts that are either outside an upstream provider or narrower than an upstream policy rule; they do not try to make the catalog look large. Effect source links below are pinned to the installed `effect@4.0.0-rc.112` release commit, `2600f62f4532026928454dcea8d1c48557b3f942`.

## Admission standard

A first-party rule is admitted only when all of the following are true:

1. An official Effect source or an independently documented product-integrity requirement states the failure model.
2. The syntax checker can prove the relevant import and local structure without guessing types or intent.
3. A public packaged scan fixture contains both a firing case and close valid cases.
4. The rule has a stable catalog identity and provider provenance.
5. A completed scan over the pinned calibration corpus has no unexplained finding.

Type-aware contracts stay in TSGo. Broad style preferences stay out. Unknown local structure causes the first-party rule to abstain.

## Accepted contracts

| Rule | Proven failure | Deliberate abstentions | Primary evidence |
| --- | --- | --- | --- |
| `diagnostic-suppression` | A real analyzer-suppression directive can hide evidence from review. The isolated integrity pass reports the directive itself. | Directive-shaped text in strings, templates, and ordinary prose comments. | Effect Doctor's fail-closed and review-integrity product contract. |
| `prefer-config-redacted` | `Config.string` is used for a statically named private credential, so the value is not redacted by construction. | Dynamic names, public or publishable keys, client IDs, unrelated objects, and shadowed imports. | Effect [`Config.redacted`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Config.ts#L1775-L1816) and Effect Solutions' [secret-config guidance](https://github.com/kitlangton/effect-solutions/blob/09f82e6c5c928e7232cd32daf04d7c6a830b63f7/packages/website/docs/07-config.md#using-redacted-for-secrets). |
| `no-run-sync-on-suspending-effect` | `runSync` or `runSyncExit` directly receives a constructor that is known to suspend, so it cannot successfully evaluate synchronously. | Indirect Effect values, immediate `Effect.callback`, `yieldNow`, zero or non-provable sleep durations, synchronous constructors, unrelated namespaces, and all calls whose suspension cannot be proven locally. | Effect's [`runSync`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Effect.ts#L17620-L17674) and [`runSyncExit`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Effect.ts#L17720-L17762) contracts, plus executable controls showing that immediate callbacks, zero sleeps, and `yieldNow` remain synchronous. |
| `prefer-structured-log-data` | A one-argument global `JSON.stringify` is passed directly to an Effect logger, discarding the original structured value before the logger sees it. | Formatted serialization, non-Effect loggers, shadowed `JSON`, and JSON at storage or wire boundaries. | Effect logging accepts [one or more values](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Effect.ts#L22190-L22221), and its structured logger preserves the [message as structured data](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Logger.ts#L655-L685). |
| `prefer-http-json-response` | `HttpServerResponse.text(JSON.stringify(value))` manually creates a JSON-shaped text response instead of using the Effect JSON boundary. | Formatted text, existing JSON responses, unrelated response builders, and shadowed `JSON`. | Effect's [`text`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/unstable/http/HttpServerResponse.ts#L190-L210) and failure-aware [`json`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/unstable/http/HttpServerResponse.ts#L299-L330) constructors. |
| `no-manual-sql-transaction` | A value proven to be the Effect `SqlClient` service sends a static transaction-control statement itself, bypassing Effect's transaction owner. | Unrelated SQL tags, ordinary query text, managed `withTransaction`, dynamic SQL, and values not proven to be the imported client service. | `SqlClient.withTransaction` owns the [transaction boundary](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/unstable/sql/SqlClient.ts#L39-L62) and its implementation wires [begin, commit, rollback, and savepoints](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/unstable/sql/SqlClient.ts#L147-L170). |
| `prefer-abort-signal-passthrough` | A direct global `fetch` with a literal URL is returned from `Effect.promise` or `Effect.tryPromise`, and its request options definitively omit `signal`; Effect interruption therefore cannot cancel that request. | `Request` inputs, opaque or spread options, an existing `signal` property, dynamic URLs, nested callbacks, local `fetch` bindings, and non-Effect adapters. | Effect promise adapters receive an [`AbortSignal`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Effect.ts#L1290-L1334), and interruption stops the operation only when it [observes the signal](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Effect.ts#L1350-L1408). Effect Solutions independently demonstrates the [signal-preserving adapter shape](https://github.com/kitlangton/effect-solutions/blob/09f82e6c5c928e7232cd32daf04d7c6a830b63f7/packages/website/docs/14-use-pattern.md#the-pattern). |

The executable positive and adversarial cases live in [`tests/fixtures/doctor`](../../tests/fixtures/doctor), and [`first-party-liveness.test.ts`](../../tests/first-party-liveness.test.ts) asserts that every enabled public first-party identity fires through the packaged `scanProject` seam.

## Candidate decisions

Seven independently phrased candidates were checked against current Effect source in this iteration. Five became the narrow rules above; two were rejected.

| Candidate | Decision | Reason |
| --- | --- | --- |
| Direct known-suspending Effect passed to a synchronous runner | Accept narrowly | The runtime contract explicitly fails or dies for async work, and direct constructors are locally provable. A blanket `runSync` ban would duplicate TSGo policy and reject valid application boundaries. |
| JSON stringification at an Effect logging boundary | Accept narrowly | Effect loggers retain structured values. JSON serialization elsewhere is often intentional. |
| JSON string passed to an Effect text response | Accept narrowly | The first-party JSON response constructor captures serialization failure and content type. |
| Manual transaction control through a proven Effect SQL client | Accept narrowly | `withTransaction` owns connection, commit, rollback, savepoint, and interruption behavior. |
| Direct fetch adapter that definitively omits a signal | Accept narrowly | The promise adapter's cancellation contract is explicit. Arbitrary Promise APIs are not flagged because support for `AbortSignal` cannot be inferred syntactically. |
| Immediate `forkChild` followed by `Fiber.join` | Reject | Effect's own [`forkChild` example](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Effect.ts#L16940-L16990) uses this exact shape. It can also carry supervision and concurrency semantics that are not equivalent to simple sequencing. |
| Always replace Vitest callbacks with `it.effect` | Reject | `it.effect` is useful, but dependency choice is project policy. TSGo already blocks the actual correctness failure with `floatingEffectInVitest` and explicitly permits either an Effect-aware test API or `Effect.runPromise`. |

Related TSGo rules remain authoritative: `runEffectInsideEffect`, `preferUnsafeConstructor`, `floatingEffectInVitest`, `abortControllerInEffect`, `globalFetchInEffect`, and `preferSchemaOverJson`. Effect Doctor does not clone them. The accepted JSON and fetch rules describe narrower boundary failures, while the broader TSGo preferences remain visible in the generated catalog under their upstream identities and severities.

## Pinned corpus calibration

Every row below produced a complete three-provider report. The file count is the maximum analyzed-file receipt across the providers. Calibration considers the five new rules in this iteration; the two older rules retain their own fixtures and prior review history.

| Corpus | Revision | Configured TypeScript files | New-rule findings |
| --- | --- | ---: | ---: |
| Effect Doctor | this branch | 50 | 0 |
| Effect `packages/effect` | `df431ae72235ad7156901caa30b053688ab40a17` | 437 | 0 |
| Effect Solutions website | `09f82e6c5c928e7232cd32daf04d7c6a830b63f7` | 62 | 0 |
| EffectBench: context, runner, doctor, CLI, protocol, results | `ab1b349f042b6c3c413f7aec4558a5f1308599e6` | 65 | 0 |
| Feather: Effect ACP, Codex app server, shared | `e476b625b92ad16116e2d1e3bbb46a672ee62b2b` | 43 | 0 |
| **Total** |  | **657** | **0** |

The same reports contained 81 `diagnostic-suppression` findings, each tied to an actual directive: 64 in Effect, 12 in Effect Solutions, and 5 in EffectBench. That rule intentionally makes suppressions visible; it does not claim each suppression is unjustified. No other first-party rule fired on this corpus.

The Effect Solutions CLI and several smaller Effect package roots were not counted because their standalone configurations did not produce a complete report in this dependency checkout. Effect Doctor failed those scans closed, as required, instead of treating partial analysis as clean calibration evidence.

Zero corpus findings are evidence against noisy matching, not evidence that the rules are valuable by themselves. Before any first-party rule becomes blocking, the corpus must include independently reviewed real defects for that rule, preserve zero unexplained findings, and exercise every supported Effect version.
