# Official Effect blog and documentation rule candidates

Audit date: 2026-08-30

This audit uses only first-party Effect material: the Effect website and blog, the official Effect repository, and the official `@effect/tsgo` rule inventory. The website revision inspected was [`Effect-TS/website@366419b`](https://github.com/Effect-TS/website/tree/366419b44eb2bd353cbe3d3e41fa4e8c735e63ee), current Effect `main` was [`Effect-TS/effect@145d8e1`](https://github.com/Effect-TS/effect/tree/145d8e1013220425b8edf34f7011c73f73e1cdcf), and Effect Doctor's installed calibration target was [`effect@4.0.0-rc.112`](https://github.com/Effect-TS/effect/tree/2600f62f4532026928454dcea8d1c48557b3f942).

## Conclusion

`This Week in Effect` is useful as a discovery feed, but most entries report library implementation changes, releases, or community work rather than universal application-code contracts. For example, issue 130 announces that the Effect LSP rules are available as type-aware OXLint rules, while issue 132 reports RPC backpressure and runtime fixes. Those posts support analyzer ownership and research direction; they do not, by themselves, justify cloning every mentioned concern into Effect Doctor ([issue 130](https://www.effect.website/blog/this-week-in-effect/130), [issue 132](https://www.effect.website/blog/this-week-in-effect/132)).

The current official docs do expose four promising first-party experiments whose bad cases are locally provable:

1. direct `Redacted.value` use in a logging or diagnostic sink;
2. multiple reachable `resume` calls in one `Effect.callback` execution;
3. repeated Layer factory calls inside one dependency graph expression;
4. mutation of an array after it has been wrapped by `Chunk.fromArrayUnsafe`.

Three more candidates merit prototypes with stricter abstention and corpus calibration: eager Effect recursion, locally provable PubSub publish-before-subscribe hangs, and use of an unconstrained numeric Config constructor for a statically named port. The remaining themes should stay upstream, opt-in, or rejected because intent cannot be proved from syntax.

The official tooling announcement also reinforces Effect Doctor's current provider split: semantic and type-aware rules belong to `@effect/tsgo`; a first-party OXLint rule should be added only when local syntax proves the defect and no upstream rule owns it ([This Week in Effect 130](https://www.effect.website/blog/this-week-in-effect/130#technology), [Effect v4 devtools](https://www.effect.website/docs/v4/getting-started/devtools/)).

## Candidate summary

| Candidate | Initial decision | Confidence | Analysis needed | Existing upstream owner |
| --- | --- | --- | --- | --- |
| `no-unredacted-value-in-diagnostic` | Prototype now | High for direct sinks | Syntax-only, import-aware | None found |
| `no-multiple-callback-resume` | Prototype now | High for same-path calls | Syntax plus a small local control-flow check | None found |
| `no-duplicate-layer-factory-call` | Prototype now | High for identical calls inside one Layer graph | Syntax-only, import-aware | None found |
| `no-mutation-after-unsafe-chunk-wrap` | Prototype now | High for direct local mutation | Syntax plus local binding tracking | None found |
| `no-eager-recursive-effect-construction` | Prototype, then calibrate | High for exact self-call; medium overall | Prefer type-aware; narrow syntax fallback is possible | None found |
| `no-local-pubsub-missed-first-message` | Prototype, then calibrate | Medium-high under strict escape analysis | Local control/data flow | None found |
| `prefer-constrained-port-config` | Prototype as advisory | High for a literal `*PORT*` key | Syntax-only, version-aware | None found |
| `prefer-config-with-default` | Do not enable by default | Medium-low | Syntax-only | None, but intent is ambiguous |
| `require-nonserializable-secret-schema` | Opt-in security policy only | Medium | Syntax plus naming/config policy | None, but serialization can be intentional |
| `no-unbounded-pubsub-or-queue` | Reject as a universal rule | Low | Syntax-only | No exact owner; existing boundedness rules cover other operations |
| `no-tacit-effect-call` | Reject as a universal rule | Low | Syntax-only | None; official source uses the shape extensively |
| `prefer-run-main-at-entrypoint` | Project policy only | Medium | File/entrypoint heuristics | None |

The upstream-ownership checks above were compared against Effect Doctor's exhaustive generated catalog rather than inferred from rule names in prose ([generated catalog](../../../src/generated/rule-catalog.ts)).

## 1. Directly unwrapping `Redacted` into diagnostics

Proposed identity: `effect-doctor/no-unredacted-value-in-diagnostic`

Official Effect guidance says `Redacted` prevents accidental exposure in logs and error messages, while `Redacted.value` exposes the underlying value and should be used carefully. The source-level API contract narrows its intended use to a trusted boundary ([Redacted guide](https://www.effect.website/docs/v4/data-types/redacted/), [`Redacted.value` source](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Redacted.ts#L224-L245)). Effect's HTTP request helpers accept `Redacted` directly, so an authentication boundary does not require eager unwrapping ([`bearerToken` source](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/unstable/http/HttpClientRequest.ts#L471-L496)).

Bad shape:

```ts
import { Effect, Redacted } from "effect"

Effect.logError("request failed", Redacted.value(apiKey))
console.warn(`using token ${Redacted.value(apiKey)}`)
new Error(`authentication failed for ${Redacted.value(apiKey)}`)
```

Good shape:

```ts
import { Effect, Redacted } from "effect"
import { HttpClientRequest } from "effect/unstable/http"

Effect.logError("request failed", apiKey)
HttpClientRequest.bearerToken(request, apiKey)
```

- **What the rule can prove:** a call to the imported `Redacted.value` is directly nested in a known logging, error-message, or tracing attribute expression. The protection has already been removed before the diagnostic system sees the value.
- **Important abstentions:** values unwrapped into HTTP headers, cryptographic APIs, database drivers, or unknown calls; indirect aliases such as `const raw = Redacted.value(secret)`; unrelated `Redacted` objects; and a bare `Redacted.value` call with no known sink.
- **False-positive risk:** low for direct log/error sinks. A test that deliberately demonstrates a leak may need a suppression, but production intent does not make disclosure safe.
- **Analysis owner:** syntax-only and import-aware. Type information adds little for the direct shape.
- **Upstream ownership:** no current TSGo or `oxlint-plugin-effect` rule in the generated catalog covers secret unwrapping into a diagnostic sink. `prefer-config-redacted` protects acquisition, not later disclosure ([existing first-party contract](../first-party-rules.md#accepted-contracts)).

This is the highest-value candidate from the documentation audit.

## 2. Calling an `Effect.callback` continuation more than once

Proposed identity: `effect-doctor/no-multiple-callback-resume`

The official creating-effects guide states that `resume` should be called exactly once and demonstrates that a second call is ignored ([guide](https://www.effect.website/docs/v4/getting-started/creating-effects/#callback), [pinned guide source](https://github.com/Effect-TS/website/blob/366419b44eb2bd353cbe3d3e41fa4e8c735e63ee/apps/web/src/content/docs/v4/getting-started/creating-effects.mdx#L437-L463)). An ignored second completion often means lost errors, duplicated callback wiring, or a mistaken assumption that the continuation is multi-shot.

Bad shape:

```ts
import { Effect } from "effect"

const program = Effect.callback<number>((resume) => {
  resume(Effect.succeed(1))
  resume(Effect.succeed(2))
})
```

Good shapes:

```ts
const program = Effect.callback<number>((resume) => {
  if (cached !== undefined) {
    return resume(Effect.succeed(cached))
  }
  load((error, value) => {
    if (error !== null) resume(Effect.fail(error))
    else resume(Effect.succeed(value))
  })
})
```

- **What the rule can prove:** two direct calls to the callback's continuation parameter are reachable on the same local path without an intervening terminating `return` or mutually exclusive branch.
- **Important abstentions:** calls in opposing `if`/`else` branches; success and error callbacks passed to a Promise or Node callback API; calls inside nested functions unless a local control-flow analysis proves both execute; continuation aliases; and callbacks imported from lookalike modules.
- **False-positive risk:** low if the first version only reports plainly sequential same-block calls. It should not merely count identifier occurrences.
- **Analysis owner:** a syntax rule with a small local control-flow analysis is sufficient.
- **Upstream ownership:** no Effect-specific TSGo or OXLint provider rule currently covers this contract. Generic Promise rules such as `promise/no-multiple-resolved` do not understand `Effect.callback`.

## 3. Recreating the same Layer factory inside one graph

Proposed identity: `effect-doctor/no-duplicate-layer-factory-call`

Layers are memoized by reference equality. The official memoization guide explicitly warns that a layer-producing function should be called once and its result reused; `Layer.fresh` is the explicit operation when distinct acquisition is desired ([Layer memoization guide](https://www.effect.website/docs/v4/requirements-management/layer-memoization/), [pinned guide source](https://github.com/Effect-TS/website/blob/366419b44eb2bd353cbe3d3e41fa4e8c735e63ee/apps/web/src/content/docs/v4/requirements-management/layer-memoization.mdx#L10-L23)).

Bad shape:

```ts
import { Layer } from "effect"

const AppLive = Layer.merge(
  Layer.provide(ApiLive, makeDatabaseLive()),
  Layer.provide(WorkerLive, makeDatabaseLive()),
)
```

Good shapes:

```ts
const DatabaseLive = makeDatabaseLive()

const AppLive = Layer.merge(
  Layer.provide(ApiLive, DatabaseLive),
  Layer.provide(WorkerLive, DatabaseLive),
)

const IntentionallyDistinct = Layer.merge(
  Layer.fresh(makeDatabaseLive()),
  Layer.fresh(makeDatabaseLive()),
)
```

- **What the rule can prove:** the same zero-argument call expression, with the same resolved local callee, appears more than once beneath one imported `Layer` graph-building expression and neither occurrence is wrapped in `Layer.fresh`.
- **Important abstentions:** calls with different arguments; calls in unrelated graphs; arbitrary function calls outside a Layer expression; computed/member callees whose identity is unclear; and any occurrence explicitly wrapped by `Layer.fresh`.
- **False-positive risk:** medium-low. A factory may intentionally return fresh resources, but the official API provides `Layer.fresh` to make that intent explicit.
- **Analysis owner:** syntax-only is viable when restricted to an imported `Layer` composition tree. A type-aware version could recognize user graph helpers more broadly.
- **Upstream ownership:** `effect/layer-merge-all-with-dependencies` catches dependency ordering inside `Layer.mergeAll`; it does not catch reference-identity loss caused by invoking the same factory twice.

## 4. Mutating an array after `Chunk.fromArrayUnsafe`

Proposed identity: `effect-doctor/no-mutation-after-unsafe-chunk-wrap`

The official Chunk guide explains that `Chunk.fromArrayUnsafe` avoids a copy and bypasses the usual immutability guarantee; mutating the original array after wrapping can change the Chunk unexpectedly. It recommends `Chunk.fromIterable` for the safe copy ([Chunk guide](https://www.effect.website/docs/v4/data-types/chunk/#unsafefromarray), [pinned guide source](https://github.com/Effect-TS/website/blob/366419b44eb2bd353cbe3d3e41fa4e8c735e63ee/apps/web/src/content/docs/v4/data-types/chunk.mdx#L65-L97)).

Bad shape:

```ts
import { Chunk } from "effect"

const values = [1, 2]
const chunk = Chunk.fromArrayUnsafe(values)
values.push(3)
```

Good shapes:

```ts
const copied = Chunk.fromIterable(values)

const immutableInput = [1, 2] as const
const wrapped = Chunk.fromArrayUnsafe(immutableInput)
```

- **What the rule can prove:** a local array binding is passed directly to the imported unsafe constructor and the same binding is later directly mutated with an assignment, update, or known mutating array method.
- **Important abstentions:** mutations before wrapping; arrays that escape to unknown code; alias-based mutations; immutable/readonly bindings; and other `fromArrayUnsafe` functions.
- **False-positive risk:** low for a direct subsequent mutation. The rule remains incomplete by design because indirect aliasing requires semantic analysis.
- **Analysis owner:** syntax plus local binding tracking.
- **Upstream ownership:** no current Effect TSGo or Effect OXLint rule covers the aliasing contract.

## 5. Eager recursive Effect construction

Proposed identity: `effect-doctor/no-eager-recursive-effect-construction`

The official `Effect.suspend` guide shows a recursive Effect constructor that exhausts memory because it invokes itself while building the Effect value. Wrapping recursive edges in `Effect.suspend` defers construction to the runtime and avoids the crash ([creating-effects guide](https://www.effect.website/docs/v4/getting-started/creating-effects/#handling-circular-dependencies), [pinned example](https://github.com/Effect-TS/website/blob/366419b44eb2bd353cbe3d3e41fa4e8c735e63ee/apps/web/src/content/docs/v4/getting-started/creating-effects.mdx#L612-L650)).

Bad shape:

```ts
const fibonacci = (n: number): Effect.Effect<number> =>
  n < 2
    ? Effect.succeed(1)
    : Effect.zipWith(fibonacci(n - 1), fibonacci(n - 2), (a, b) => a + b)
```

Good shape:

```ts
const fibonacci = (n: number): Effect.Effect<number> =>
  n < 2
    ? Effect.succeed(1)
    : Effect.zipWith(
        Effect.suspend(() => fibonacci(n - 1)),
        Effect.suspend(() => fibonacci(n - 2)),
        (a, b) => a + b,
      )
```

- **What the rule can prove:** a named local function whose result is an Effect directly invokes itself in an eagerly evaluated argument to an Effect constructor, outside a thunk/callback/suspension boundary.
- **Important abstentions:** recursion inside callbacks passed to `flatMap`, `andThen`, `suspend`, or other runtime-invoked functions; deliberately tiny bounded recursion; mutually recursive aliases not locally resolvable; and recursive non-Effect functions.
- **False-positive risk:** medium. The exact official bad shape is real, but small bounded recursion can be intentional.
- **Analysis owner:** preferably TSGo, because proving that the function returns an Effect and classifying callback positions is type/API aware. A first-party syntax rule should recognize only imported Effect constructors and direct self-binding calls.
- **Upstream ownership:** `effect/lazy-effect` concerns exported zero-argument Effect/Stream accessors, not eager recursive construction. No exact owner was found.

This should remain advisory until it has real merged-fix provenance and corpus calibration.

## 6. Locally provable PubSub publish-before-subscribe hangs

Proposed identity: `effect-doctor/no-local-pubsub-missed-first-message`

The official PubSub guide states that subscribers receive only messages published while they are actively subscribed and cautions users to subscribe before publishing when a message must be observed ([PubSub guide](https://www.effect.website/docs/v4/concurrency/pubsub/#basic-operations), [pinned guide source](https://github.com/Effect-TS/website/blob/366419b44eb2bd353cbe3d3e41fa4e8c735e63ee/apps/web/src/content/docs/v4/concurrency/pubsub.mdx#L14-L55)).

Bad, locally closed shape:

```ts
const program = Effect.scoped(
  Effect.gen(function* () {
    const bus = yield* PubSub.bounded<string>(1)
    yield* PubSub.publish(bus, "ready")
    const subscription = yield* PubSub.subscribe(bus)
    return yield* PubSub.take(subscription)
  }),
)
```

Good shape:

```ts
const subscription = yield* PubSub.subscribe(bus)
yield* PubSub.publish(bus, "ready")
return yield* PubSub.take(subscription)
```

- **What the rule can prove:** a PubSub is created locally, does not escape, has no replay, receives a publish before its first subscription, and the same straight-line program then waits on that subscription without starting another publisher.
- **Important abstentions:** externally supplied buses; replaying PubSubs; any escaped bus; forked or callback publishers; branches and loops; and code that publishes without subsequently waiting for the missed message.
- **False-positive risk:** medium unless escape and concurrency checks are strict. Publish-before-subscribe is often intentional when the new subscriber should see only future events.
- **Analysis owner:** local control/data flow. A mere ordering grep would be too noisy.
- **Upstream ownership:** no exact upstream rule was found.

## 7. An unconstrained numeric constructor for a statically named port

Proposed identity: `effect-doctor/prefer-constrained-port-config`

The official Config guide says the general number constructor accepts `NaN` and infinities, recommends the finite constructor for ordinary numeric settings, and provides a dedicated port constructor constrained to integers from 1 through 65,535 ([Config guide](https://www.effect.website/docs/v4/configuration/#primitive-configurations), [`effect@rc.112` constructors](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Config.ts#L1490-L1530), [`port` source](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Config.ts#L1697-L1733)).

Bad shape:

```ts
import { Config } from "effect"

const port = Config.number("HTTP_PORT")
```

Good shape:

```ts
const port = Config.port("HTTP_PORT")
```

- **What the rule can prove:** the imported unconstrained number constructor receives a static key equal to `PORT` or ending in `_PORT` / `-PORT` / `.port`.
- **Important abstentions:** dynamic keys; non-port numeric settings; schemas already applying a range check; unrelated Config objects; and explicit comments/configuration opting into non-finite values.
- **False-positive risk:** low for a statically port-named key. A wider “always prefer finite” rule would be policy rather than correctness.
- **Analysis owner:** syntax-only and import-aware.
- **Upstream ownership:** no current TSGo or Effect OXLint rule covers Config constructor specificity.

### Version-awareness requirement

The published RC and current website examples use lower-case `Config.number`, `Config.finite`, and `Config.port`, while Effect `main` after the inspected RC uses `Config.Number`, `Config.Finite`, and `Config.Port` ([current `Config` source](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/effect/src/Config.ts#L1024-L1067)). A rule must bind to supported Effect versions or recognize both spellings; silently assuming one current spelling would make the analyzer stale immediately.

## 8. Literal fallback through `Config.orElse`

Possible identity: `effect-doctor/prefer-config-with-default`

`Config.withDefault` substitutes only semantic absence, while `Config.orElse` catches every `ConfigError`, including invalid supplied input. The website recommends `withDefault` for the common default-value case ([Config defaults guide](https://www.effect.website/docs/v4/configuration/#defaults-and-optional-values), [`orElse` source contract](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Config.ts#L444-L478)).

Potentially bad shape:

```ts
const port = Config.port("PORT").pipe(
  Config.orElse(() => Config.succeed(8080)),
)
```

Preferred when only absence should default:

```ts
const port = Config.port("PORT").pipe(Config.withDefault(8080))
```

- **What the rule can prove:** `orElse` has a zero-argument fallback that directly returns `Config.succeed` with a literal or locally constant value.
- **False-positive risk:** medium-high. The official `Config` source itself documents a literal `orElse` as a valid example, and callers may intentionally replace invalid input.
- **Analysis owner:** syntax-only.
- **Upstream ownership:** none found.
- **Decision:** do not enable by default. It could be an opt-in policy or a suggestion worded as a semantic question, not a correctness claim.

## 9. JSON encoding of secret schemas

Possible identity: `effect-doctor/require-nonserializable-secret-schema`

The official Schema guide is explicit that `Schema.Redacted(value)` exposes its encoded inner value in the default JSON representation. Passing `{ disallowJsonEncode: true }` makes JSON encoding fail instead ([Schema Redacted guide](https://www.effect.website/docs/v4/schema/effect-data-types/#redacted), [`Schema.Redacted` source contract](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Schema.ts#L10152-L10180)).

Potentially bad shape under a “never serialize secrets” policy:

```ts
const Credentials = Schema.Struct({
  password: Schema.Redacted(Schema.String),
})
```

Policy-compliant shape:

```ts
const Credentials = Schema.Struct({
  password: Schema.Redacted(Schema.String, {
    disallowJsonEncode: true,
  }),
})
```

- **What the rule can prove:** a Redacted schema under a statically sensitive field name omits `disallowJsonEncode: true`.
- **False-positive risk:** high enough to prevent a universal rule. Credentials often must be encoded at an outbound trusted boundary. Effect's own AI HTTP metadata schemas intentionally permit serializable redacted header values ([current source](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/effect/src/unstable/ai/Response.ts#L2158-L2213)).
- **Analysis owner:** syntax plus a project-provided sensitive-name policy.
- **Upstream ownership:** none found.
- **Decision:** opt-in security profile only. The direct logging rule is a much safer default.

## 10. Additional candidates worth retaining as research notes

### Explicit side effects passed to `Effect.succeed`

The official guide contrasts a top-level `Effect.succeed(i++)`, which executes once during construction, with `Effect.suspend(() => Effect.succeed(i++))`, which executes on each run ([guide](https://www.effect.website/docs/v4/getting-started/creating-effects/#lazy-evaluation)). A top-level update or assignment directly inside `Effect.succeed` is a plausible advisory rule.

It is not safe to ban the shape in arbitrary callbacks: Effect's own implementation uses `Effect.succeed(array[index++])` inside runtime-invoked functions where eager evaluation at that callback invocation is correct. A first version would need to restrict itself to module-scope Effect values or otherwise prove the construction lifecycle. `effect/sync-to-succeed` is the inverse optimization and does not own this misuse.

### Repeated right-hand effects in `Stream.cross`

The official Stream guide warns that the right-hand stream in a Cartesian product is iterated once per left element, repeating expensive or side-effecting work ([Stream operations guide](https://www.effect.website/docs/v4/stream/operations/#cartesian-product-of-streams)). Detecting `Stream.cross(left, Stream.fromEffect(...))` is deterministic, but repeated execution may be the intended product semantics. Keep this as an opt-in performance warning unless real fixes establish a narrower failure shape.

### Entry points using `Effect.runPromise` instead of platform `runMain`

The official code-style guide recommends platform `runMain` because it observes interruption signals and supports graceful teardown, unlike a bare `Effect.runPromise` main entry ([guideline](https://www.effect.website/docs/v4/code-style/guidelines/#using-runmain)). File names and top-level position do not reliably identify an application entrypoint; tests, scripts, workers, and adapters legitimately use `runPromise`. This belongs in a project-configured entrypoint policy, not the universal preset.

## Rejected broad rules

### Blanket tacit/point-free ban

The official style guide advises explicit callbacks over tacit calls such as `Effect.map(fn)` because optional parameters, overloads, inference, and stack traces can make point-free use risky ([guideline](https://www.effect.website/docs/v4/code-style/guidelines/#avoid-tacit-usage)). However, current Effect source and its JSDoc use partial `Effect.map`, `Effect.flatMap`, and other dual APIs extensively. A universal syntax ban would flag the source of truth it is supposed to model. Only a type-aware rule for a specifically proven overload/inference loss would be defensible.

### Blanket ban on unbounded Queue or PubSub constructors

The Queue source says `Queue.unbounded` accepts unbounded memory growth, and the PubSub guide recommends bounded, dropping, or sliding variants unless unbounded behavior is specifically required ([Queue API](https://www.effect.website/docs/v4/api/effect/Queue#unbounded), [PubSub guide](https://www.effect.website/docs/v4/concurrency/pubsub/#unbounded-pubsub)). Unbounded structures are nevertheless deliberate public APIs and are used inside Effect itself. Syntax cannot know arrival rate, lifetime, or the required loss/backpressure policy. Keep the existing operation-specific rules—unbounded collection concurrency, unbounded retries, and collecting provably unbounded streams—rather than banning the data structures.

### Blanket ban on `Schema.Struct({})`

The official schema guide cautions that an empty struct accepts any non-nullish value ([schema guide](https://www.effect.website/docs/v4/schema/basic-usage/#structs)). Effect itself uses empty structs to model real protocol shapes, including MCP capability and success objects. Without boundary intent, the permissiveness is not a defect.

### Blanket ban on unsafe constructors

Official docs describe when unsafe constructors throw and when callers may use them with trusted values. A name-based ban would reject valid constants and internal invariant boundaries. Report a locally proven unsafe alias mutation, as with `Chunk.fromArrayUnsafe`, rather than the word `Unsafe`.

## Existing ownership: do not duplicate

| Official guidance or blog theme | Existing owner in Effect Doctor |
| --- | --- |
| Effect values must be yielded, returned, assigned, or run | Type-aware `effect/floating-effect` and `effect/floating-effect-in-vitest` from TSGo |
| Do not run an Effect from inside Effect code | Type-aware `effect/run-effect-inside-effect` from TSGo |
| Service operations should not leak implementation requirements | Type-aware `effect/leaking-requirements` from TSGo |
| Layer merge graphs must respect dependencies | Type-aware `effect/layer-merge-all-with-dependencies` from TSGo |
| Promise values must not remain in an Effect success channel | Type-aware `effect/promise-in-effect-success` and `effect/lazy-promise-in-effect-sync` from TSGo |
| Prefer Schema boundaries over ad hoc JSON parsing/serialization | Type-aware `effect/prefer-schema-over-json`, plus Effect Doctor's narrower HTTP/logging boundary rules |
| Avoid unbounded retries and collection concurrency | `effect/no-unbounded-retry` and `effect/no-unbounded-concurrency` from `oxlint-plugin-effect` |
| Do not collect a stream proven to be unbounded | `effect/no-run-collect-on-unbounded-stream` from `oxlint-plugin-effect` |
| Keep implementation requirements out of public Layers/services | TSGo missing/leaking-context diagnostics |
| Redact secret Config values | `effect-doctor/prefer-config-redacted` |
| Preserve raw Promise/fetch cancellation | TSGo `effect/abort-controller-in-effect` / `effect/global-fetch-in-effect` and `effect-doctor/prefer-abort-signal-passthrough` |
| Do not block Layer acquisition with proven never-ending work | `effect-doctor/no-long-lived-layer-acquisition` |

The rule identities and current selection status are recorded in the [generated catalog](../../../src/generated/rule-catalog.ts); the rationale for the existing first-party subset is in [First-party rule contracts](../first-party-rules.md).

## What the weekly blog changed in this audit

- The official August 2026 announcement makes type-aware OXLint integration an upstream fact, so Effect Doctor should consume TSGo's rule identities rather than reproduce semantic rules ([This Week in Effect 130](https://www.effect.website/blog/this-week-in-effect/130#technology)).
- RPC stream backpressure, bounded SQL cleanup, tracer header filtering, and resource/finalizer fixes are valuable failure themes, but the reported changes are predominantly inside Effect itself. They do not imply that a local application AST contains a universally bad spelling ([This Week in Effect 132](https://www.effect.website/blog/this-week-in-effect/132#effect-v4-rc-updates), [June beta recap](https://www.effect.website/blog/effect-v4beta-june-recap)).
- The RC post says the interface is presumed final and asks users to validate real applications. That supports pinning rules to an Effect version and calibrating on real repositories instead of treating unreleased `main` spellings as timeless ([Effect v4 RC post](https://www.effect.website/blog/releases/effect/40-rc)).
- The team's source-vendoring article is guidance for coding-agent context, not verifier behavior. It belongs in an EffectBench treatment; encoding source resemblance into Effect Doctor would contaminate the independent quality signal ([source-vendoring article](https://www.effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive)).

## Recommended next step

Prototype the first two candidates through the packaged `scanProject` seam first:

1. `no-unredacted-value-in-diagnostic`, with direct log/error sinks and close safe boundary controls;
2. `no-multiple-callback-resume`, initially limited to plainly sequential same-path calls.

Then calibrate them against Effect, Effect Solutions, EffectBench, and several real Effect applications before enabling either. The Layer and Chunk candidates should follow only after the first pair demonstrates low noise. The other candidates should remain research notes until they gain real merged-fix provenance or an upstream type-aware owner.
