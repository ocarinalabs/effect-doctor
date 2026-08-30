# `no-inline-schema-compile` contract research

Research date: 2026-08-30

Target: `effect@4.0.0-rc.112`, tag
[`2600f62`](https://github.com/Effect-TS/effect/tree/2600f62f4532026928454dcea8d1c48557b3f942).
The current Effect `main` revision at the time of this audit,
[`145d8e1`](https://github.com/Effect-TS/effect/tree/145d8e1013220425b8edf34f7011c73f73e1cdcf),
still declares `4.0.0-rc.112`, and its `SchemaParser.ts` is byte-identical to
the tagged file.

## Decision

Do **not** implement either community rule verbatim, and do not describe every
inline `Schema.is` / decoder / encoder factory as recompiling a parser. That
claim is false for a reused schema object in the supported Effect release.

There is nevertheless a defensible, much narrower first-party candidate:

- `no-inline-schema-compile` may report an immediately invoked Effect Schema
  adapter inside a function **only when the rule can also prove that the call
  constructs a fresh, closed schema AST there**. A fresh AST identity misses
  Effect's object-identity compiler cache.
- Repeated `Schema.decodeEffect(User)(input)` where `User` is already a stable
  schema is a different and much cheaper issue: it allocates adapter/wrapper
  closures, but the underlying compiler cache is reused. If Effect Doctor ever
  reports that shape, it should be a separate advisory rule named along the
  lines of `prefer-reused-schema-adapter`; it must not use “compile” language.
- The proposed compile rule should begin as advisory and without an autofix.
  It should not become blocking until the calibration gates below pass.

This split preserves the official recommendation to reuse parsers without
overstating the runtime failure.

## What Effect actually allocates and caches

Effect's official AI-facing Schema introduction explicitly tells users to
reuse parsers at application edges instead of rebuilding them for each request,
then creates the decoder and encoder at module scope
([guidance and example](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/ai-docs/src/01_effect/02_schema/10_schema-basics.ts#L29-L41)).
That is direct first-party provenance for parser reuse.

The implementation makes the cost model more precise:

1. `SchemaParser.is` creates a guard closure, while decoder and encoder APIs
   create runner and result-adapter closures
   ([guard](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/SchemaParser.ts#L148-L163),
   [decoder](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/SchemaParser.ts#L236-L247),
   [encoder](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/SchemaParser.ts#L587-L598),
   [result adapters](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/SchemaParser.ts#L948-L1012)).
   The higher-level `Schema` APIs can add another wrapper which maps
   `SchemaIssue` into `SchemaError`
   ([decode wrapper](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Schema.ts#L1516-L1535),
   [encode wrapper](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Schema.ts#L1989-L1997)).
2. Each runner lazily resolves its parser on first use, but the shared compiler
   is memoized
   ([runner and lazy lookup](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/SchemaParser.ts#L923-L946),
   [compiler definitions](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/SchemaParser.ts#L1023-L1035)).
3. Effect's memoizer is a `WeakMap` keyed by object identity; structurally equal
   objects do not share an entry
   ([contract and implementation](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Function.ts#L1315-L1347)).
   `SchemaAST.toType`, `toEncoded`, and `flip` are also identity-memoized
   ([AST transforms](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/SchemaAST.ts#L3758-L3869)).
4. Constructors such as `Literal`, `Struct`, `Record`, `Tuple`, `Array`,
   `Union`, and `Literals` create new schema/AST objects
   ([`Literal`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Schema.ts#L2785-L2796),
   [`Struct`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Schema.ts#L3534-L3583),
   [`Record`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Schema.ts#L3961-L3966),
   [`Tuple`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Schema.ts#L4380-L4414),
   [`Array` and `NonEmptyArray`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Schema.ts#L4621-L4700),
   [`Union` and `Literals`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Schema.ts#L4889-L4988)).
   Schema construction itself also attaches maker adapters to the new schema
   object
   ([internal constructor](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/internal/schema/schema.ts#L44-L72)).

The resulting truth table is:

| Runtime shape | Fresh adapter wrappers | Fresh AST identity | Parser compilation |
| --- | ---: | ---: | --- |
| Hoisted `const decode = Schema.decodeEffect(User)` | Once | No | Once, lazily |
| Repeated `Schema.decodeEffect(User)(input)` | Every execution | No | First execution compiles; later factories hit the shared cache |
| Repeated `Schema.decodeEffect(Schema.Struct(...))(input)` | Every execution | Every execution | Every execution misses the identity cache and compiles on first use |
| `Schema.asserts(User, input)` | Internal wrappers each call | No | Shared compiler cache is reused |

Effect's own runtime-performance work reinforces this distinction. PR
[#6649](https://github.com/Effect-TS/effect/pull/6649) measured schema creation,
schema-plus-decoder initialization, cold first-decode cases, and steady-state
adapters separately. Its steady-state fixtures create adapters outside the
timed operation
([adapter fixture](https://github.com/Effect-TS/effect/blob/d48506d97525040aa714305e928126df799795b4/packages/effect/runtimeperf/suites/schema/fixtures/adapters.ts#L14-L81)),
whereas the cold suite deliberately constructs a new schema before its first
decode
([cold fixture](https://github.com/Effect-TS/effect/blob/d48506d97525040aa714305e928126df799795b4/packages/effect/runtimeperf/suites/schema/fixtures/cold.ts#L51-L84)).

The canonical source also contains both stable-schema inline calls and dynamic
schema calls. For example, `McpServer` invokes adapters over module schemas
inside helpers
([examples](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/unstable/ai/McpServer.ts#L107-L118),
[`InitializeJsonRpcMessage`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/unstable/ai/McpServer.ts#L1483-L1499)),
and EventLog builds adapters from schemas selected by runtime tags
([dynamic example](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/unstable/eventlog/EventLog.ts#L587-L607)).
Those examples are evidence against a blanket “factory inside any function”
blocking rule and in favor of deliberate abstention.

## Directional local measurement

A small local check on Node `22.22.2`, Apple M4 Pro, arm64, using the pinned
`effect@4.0.0-rc.112`, warmed each case and recorded nine samples. Median time
per successful operation was:

| Adapter | Hoisted | Recreated over stable schema | Recreated with inline `Struct` |
| --- | ---: | ---: | ---: |
| `Schema.is` | 63.5 ns | 80.2 ns | 2,333 ns |
| `Schema.decodeUnknownOption` | 63.1 ns | 80.3 ns | 2,597 ns |

This is directional, single-machine evidence, not an admission benchmark. It
does show why the two contracts must not be conflated: stable-schema adapter
allocation was about 17 ns in this fixture, while recreating even a two-field
`Struct` was measured in microseconds. A reproducible, paired benchmark across
Node and Bun belongs in calibration before severity is promoted.

## Supported API surface

For Effect 4 RC.112, the adapter-producing surface is `is` plus the following
decode and encode families:

- Decode: `decodeEffect`, `decodeExit`, `decodeOption`, `decodePromise`,
  `decodeResult`, `decodeSync`, and each corresponding `decodeUnknown*` form.
- Encode: `encodeEffect`, `encodeExit`, `encodeOption`, `encodePromise`,
  `encodeResult`, `encodeSync`, and each corresponding `encodeUnknown*` form.

The signatures are defined together in the tagged
[`SchemaParser` source](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/SchemaParser.ts#L215-L909)
and wrapped or re-exported by
[`Schema`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Schema.ts#L1420-L2358).

The proposed contract should recognize bindings from both public modules:

- `effect` named namespace imports: `import { Schema as S, SchemaParser as P } from "effect"`;
- namespace imports from `effect/Schema` and `effect/SchemaParser`; and
- named adapter imports from those two subpaths, including aliases.

It should not infer through re-exports, arbitrary wrappers, CommonJS `require`,
dynamic imports, or an `import * as Effect` then `Effect.Schema.*` chain in the
first version. Those shapes can be added only with separate binding fixtures.

`Schema.asserts` is intentionally excluded: in v4 it is a direct
`asserts(schema, input)` operation, not an adapter factory
([signature](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/SchemaParser.ts#L177-L213)).
`make*`, Standard Schema conversion, formatters, and AST derivation APIs are
also outside this contract.

This rule should declare support for **Effect v4 only**, initially pinned to the
verified RC.112 API. V3 used different names and implementation history. Do not
silently add `decode`, `encode`, `*Either`, `validate*`, or `parse*` spellings
until their exact release semantics and corpus are independently audited.

## Narrow import-aware AST contract

Report one finding only when every condition below is satisfied:

1. The candidate occurs beneath a function declaration, function expression,
   or arrow function.
2. The adapter factory binding resolves lexically to one of the supported
   exports above from `effect`, `effect/Schema`, or `effect/SchemaParser`.
   Aliases are followed; shadowed identifiers and local lookalikes abstain.
3. The factory call is immediately used as the callee of a second call, after
   unwrapping only parentheses and TypeScript assertion/satisfaction wrappers.
   Optional calls and computed adapter properties abstain.
4. The factory receives exactly one non-spread argument. Factory-time parse
   options abstain in v1; application-time options on the outer call are fine.
5. The schema argument is a **fresh closed schema construction** rooted in one
   of this initial whitelist: `Struct`, `Record`, `Tuple`, `Array`,
   `NonEmptyArray`, `Union`, `Literal`, or `Literals`, resolved to the genuine
   Effect `Schema` binding.
6. The complete construction is closed relative to the containing function.
   Its leaves may be Effect's statically named built-in schema exports,
   literals, or immutable schema bindings declared in an enclosing scope.
   `Struct` objects require static keys and no spread/accessor/method;
   tuple/union/literal arrays require no spread; nested calls must come from the
   same whitelist. A binding declared in the current function, a writeable
   binding, `this`, `super`, `await`, `yield`, computed access, an arbitrary
   call, or a function-local reference makes the rule abstain.

This deliberately does **not** report `Schema.decodeEffect(User)(input)` when
`User` already exists. It also does not report a local two-step form. The rule
proves repeated compilation, not every opportunity to shave off a closure.

The finding should point to the adapter factory call. Message intent:

> Reuse this schema and its adapter from an enclosing stable scope; rebuilding
> the schema creates a new AST identity, so Effect cannot reuse its compiled
> parser cache.

The wording should name the actual method, avoid “hot path” claims, avoid saying
that all inline factories recompile, and avoid prescribing module scope when a
closure scope is the correct lifetime. No autofix: moving construction can
change initialization order, interact with module cycles, require a new name,
or cross an intentional lifetime boundary.

## Required close-valid fixtures

Before implementation can be admitted, packaged `scanProject` fixtures should
show that all of these remain clean:

- a module- or closure-scoped reusable adapter;
- immediate invocation over an already-stable schema identifier;
- a schema parameter or function-local schema binding;
- an inline schema whose literal, field, or member depends on a function local;
- factory-time options, spreads, computed keys, accessors, and optional calls;
- an adapter returned or passed to `pipe` rather than immediately invoked;
- module-scope one-shot invocation;
- `Schema.asserts(schema, input)`;
- `Schema.toType`, `Schema.flip`, `Schema.fromJsonString`, checks,
  transformations, classes, and other non-whitelisted construction paths;
- aliases which are later shadowed, a local object named `Schema`, and imports
  from a package other than Effect;
- CommonJS, re-exported wrappers, and `Effect.Schema.*`, until explicitly
  supported;
- v3-only API spellings.

Invalid fixtures should independently cover the root named namespace, subpath
namespace, direct named adapter alias, `SchemaParser`, transparent TypeScript
wrappers, nested whitelisted constructors, and an enclosing immutable schema
binding. Every invalid fixture needs a close valid neighbor differing in one
proof condition.

## Upstream duplication audit

At candidate-review time, Effect Doctor's 148-rule catalog contained no parser-reuse or inline
Schema-compilation diagnostic. The closest TSGo rule is
[`preferTypedSchemaDecoder`](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/docs/rules/prefer-typed-schema-decoder.md#L3-L28),
which chooses typed rather than unknown-input adapters; it does not address
allocation or schema identity. The closest `oxlint-plugin-effect` concept is
[`no-per-call-cache-construction`](https://github.com/cevr/effect-oxlint/blob/f3464b3a1c3cacf55965ed2aa273b4accd715bfa/src/rules/no-per-call-cache-construction.ts#L1-L64),
which concerns Effect `Cache` state and is already preserved under its upstream
identity. Neither owns this contract.

Two production repositories provide independent community provenance:
[`pingdotgg/t3code`](https://github.com/pingdotgg/t3code/blob/c0e09f323ac9f6bf4b9119cbad841db3379588d6/oxlint-plugin-t3code/rules/no-inline-schema-compile.ts)
and
[`RhysSullivan/executor`](https://github.com/RhysSullivan/executor/blob/1e8ce10e83b8255e2c186b2da9e027871b1a405e/scripts/oxlint-plugin-executor/rules/no-inline-schema-compile.js).
They are useful evidence that teams encounter the pattern, not normative
contracts. Their broader matching, messages, tests, thresholds, and API lists
must not be copied. In particular, current v4 `asserts` and the compiler cache
make a fresh RC.112 specification necessary.

## Calibration result and promotion gate

The rule was implemented only after the public-seam fixtures above failed, then
passed through the packaged `scanProject` path. Its matcher was run with all
three providers over the 3,489-file configured corpus recorded in
[`first-party-rules.md`](./first-party-rules.md), including every repository in
the `real-world-effect` sample. It produced no unexplained finding. Stable-schema
inline adapters and Effect's own canonical examples stayed clean.

The rule ships as advisory and without an autofix. Promotion to blocking still
requires at least one independently verified real defect, repeated clean corpus
runs over every supported Effect release, and a reproducible paired performance
benchmark that separates schema construction, stable-adapter construction,
cold parse, and steady-state parse on Node and Bun.
