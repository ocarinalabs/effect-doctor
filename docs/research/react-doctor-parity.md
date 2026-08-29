# React Doctor parity research

Research date: 2026-08-29

This is a clean-room architecture note for Effect Doctor. It records three kinds of statements:

- **Fact** means a claim visible in a cited primary source at the pinned revision.
- **Measurement** means a count or timing reproduced from a pinned artifact or this checkout.
- **Recommendation** means a design choice for Effect Doctor, not a claim about another project.

No React Doctor or Agent Doctor source, message, fixture, example, threshold, or rule specification is reproduced here. Counts are inventory facts, not a request to recreate either catalog.

## Conclusion

**Fact:** Effect Doctor already has the right semantic authority and safety boundary: `@effect/tsgo` owns type-aware Effect diagnostics, Oxlint owns syntax and local structure, reports retain provider provenance, and incomplete provider runs cannot be presented as clean.

**Measurement:** The pinned `@effect/tsgo@0.38.0` provider has **99**, not 101, diagnostic rules. React Doctor at commit `4e049212052a5433e1995cc6353a0fcde3c8a2e1` has 906 registry records, of which 901 are active. Those products therefore cannot be compared by treating the current default Oxlint selection as Effect Doctor's whole coverage.

**Recommendation:** Pursue architectural parity rather than 906-rule count parity. Generate truthful provider catalogs, host independently specified first-party syntax rules directly on the official `@oxlint/plugins` API, keep project analysis separate, and make liveness, completeness, calibration, and performance budgets release criteria.

## Why a full scan is slower than syntax-only lint

**Fact:** The current pipeline creates an immutable configured snapshot, runs native TSGo and the Oxlint work concurrently, validates and normalizes their output, then recreates the configured plan and verifies exact inventory, configuration, and content integrity before returning a report. Oxlint uses a primary upstream/first-party pass plus an isolated directive-immune suppression-integrity pass. Each benchmark sample starts fresh processes. There is no content cache, incremental compiler state, or changed-file mode. See the local [scan pipeline](../../src/scan.ts), [TSGo adapter](../../src/internal/tsgo.ts), and [Oxlint adapter](../../src/internal/oxlint.ts).

**Measurement:** Before this parity upgrade, the historical packaged self-scan baseline was about 1,345 ms p50. A review-time seven-sample run of the upgraded deterministic benchmark was about 585 ms p50 without caching. After the isolated directive-immune integrity pass was added, an acceptance run was 632.6 ms p50 across seven measured samples after two warmups. With nine first-party rules and their liveness corpus present, the next acceptance run was 683.0 ms p50. After expanding to 15 first-party rules and 61 configured self-scan files, the next acceptance run was 687.4 ms p50. With 16 first-party rules and 62 configured files, the current seven-sample run after two warmups is 680.6 ms p50. These are measurements from different implementation states on the same development machine, not portable service-level claims; the current number should always be reproduced with `bun run bench` in the checkout under review.

These measurements show that native TSGo resolution and concurrent provider execution materially reduced the historical cost while retaining completeness checks. Real type checking, fresh process startup, two Oxlint processes, integrity I/O, CLI startup, and rendering remain part of a full scan. React Doctor does not pay for a TypeScript typecheck, so its syntax-heavy timings are not an equivalent baseline.

**Recommendation:** Keep TSGo and optimize around it. Continue benchmarking cold CLI, warm worker, and any future cache-hit paths separately. Do not trade away the current source-integrity or completeness proof for a smaller timing number.

## React Doctor snapshot

### Inventory

**Measurement:** Counting the generated registry at commit `4e049212052a5433e1995cc6353a0fcde3c8a2e1` gives:

| Registry surface | Count |
| --- | ---: |
| Registry records | 906 |
| Active records | 901 |
| Active per-file AST rules | 852 |
| Active whole-tree file scans | 42 |
| Active project rules | 7 |
| Active by default | 734 |
| Retired compatibility records | 5 |

The execution counts reconcile exactly: 852 + 42 + 7 = 901. The registry total is larger because retired identities remain represented. The 734 default count is a policy subset of the 901 active rules.

### Architecture and rule engine

**Fact:** React Doctor uses a generated registry and three execution modes. Its JavaScript Oxlint plugin hosts per-file AST visitors, adds framework and version gates, and lazily shares scope and control-flow context. File-scan and project records are excluded from the lint rule map and run in core-owned stages. This is a multi-provider product behind one report, not a native Oxlint preset with every category enabled.

**Fact:** Its performance design is optimized for a large JS-plugin catalog. The core plans balanced batches, starts multiple Oxlint subprocesses because each JS-plugin process is single-threaded, sizes concurrency from CPU and memory, caches cacheable file-local results by content, maintains dependency-aware sidecar cache entries for eligible cross-file work, and uses split and serial retries for pathological or resource-constrained batches. Rules that cannot prove a complete dependency set are not safely replayed from the cross-file cache.

**Fact:** Its test system checks generated-registry consistency and the exact scan/project partitions. A liveness suite requires a positive control or a documented exemption for every registered identity. Separate suites exercise rule behavior, large AST shapes, fuzz properties, and pinned-repository evaluation. The large-shape performance test at this revision checks successful analysis but does not assert an elapsed-time ceiling, so it should not be cited as a benchmark guarantee.

**Fact:** React Doctor reports analyzed and scanned counts, skipped checks, skip reasons, and a `complete` flag. Partial results can be returned, so consumers must inspect completeness rather than interpreting a successful top-level response as proof that every planned check ran.

**Recommendation:** Copy none of this implementation. Adopt only the independently expressible product properties: explicit execution modes, generated metadata, capability gates, shared analysis, positive-control liveness, adversarial negatives, deterministic fuzzing, pinned-corpus calibration, sound cache invalidation, and explicit completeness.

## Effect provider inventory

### `@effect/tsgo@0.38.0`

**Measurement:** Effect Doctor pins package 0.38.0 at tag commit `73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9`. Its authoritative generated metadata contains:

| Property | Count |
| --- | ---: |
| Rules | 99 |
| Default error | 13 |
| Default warning | 15 |
| Default suggestion | 36 |
| Default off | 35 |
| Fixable rules | 43 |
| Unique diagnostic codes | 109 |

| Group | Count |
| --- | ---: |
| Correctness | 18 |
| Antipattern | 20 |
| Effect-native | 22 |
| Style | 39 |

**Fact:** Current TSGo `main` at `f134c316b685b70fc513d10ed9b7c899088667f5` contains 101 rules because two rules were added after 0.38.0. That moving-main count is not the package inventory, the local provider count, or a valid input to 0.38.0 catalog generation.

**Recommendation:** Generate the runtime catalog from the pinned metadata, check it against the installed package schema, and fail drift tests when the version, names, defaults, descriptions, codes, or supported Effect versions change. Preserve TSGo's native rule and code provenance. Let TSGo own all semantic and type-aware contracts.

### `oxlint-plugin-effect@0.11.0`

**Measurement:** Tag commit `f3464b3a1c3cacf55965ed2aa273b4accd715bfa` exports 40 rules. Its recommended preset enables all 40 as errors. Rule metadata classifies 23 as problems and 17 as suggestions; one declares an automatic fix. Ten rules are attributed as anti-slop-derived, while the rest target Effect or adjacent TypeScript practices.

**Recommendation:** Catalog all 40, but never import the recommended preset as benchmark policy. The conservative audit split is 7 blocking, 8 advisory, 3 preview-only, 11 delegated to the more authoritative TSGo provider, and 11 rejected as broad style or unsafe policy. Only the first 15 are default-visible. Deduplicate by declared provider ownership, not by fuzzy message matching, and retain the upstream rule identity in every finding.

This split treats narrow operational and structural defects differently from blanket bans on valid JavaScript or TypeScript constructs. Preview rules need corpus evidence before promotion. Delegated rules must not be locally reimplemented merely to change their name.

## Agent Doctor audit

**Fact:** At audited commit `007644b4899804b03ed9836230d681f5863f3b37`, `all_metas()` is asserted to contain **118** unique rules. The repository's 101-entry website export is a partial publication surface, not the complete core catalog.

**Measurement:** The Effect Doctor clean-room audit assigned each of the 118 rules to one mutually exclusive class:

| Disposition | Count |
| --- | ---: |
| Already owned by TSGo | 48 |
| Already owned by `oxlint-plugin-effect` | 12 |
| Potential independent Effect Doctor contracts | 8 |
| Generic TypeScript or project health | 22 |
| Reject as style or adoption policy | 18 |
| Reject as stale or materially false-positive | 10 |
| Total | 118 |

These are Effect Doctor audit judgments, not Agent Doctor's categories. The first two rows mean upstream ownership of the valid contract, not necessarily identical matching behavior.

**Recommendation:** Map the 60 overlaps to their upstream providers, independently research only the 8 potential gaps, route the 22 generic checks to core lint or project-health tooling, and exclude the remaining 28 from the Effect quality score. Agent Doctor has no top-level license at the audited commit, so its implementation and expression must not be reused.

## Other candidate substrates

### `mpsuesser/effect-oxlint`

**Fact:** Package 0.3.4 at `d8c892f4fedc072409dca290ac44733bf5dc3e87` is an Effect-based rule-authoring SDK. It ships authoring, AST, visitor, diagnostic, scope, token, source, and testing utilities, but **no built-in diagnostic rules**. Its rule bridge creates the rule with `Effect.runSync` and invokes visitor handlers through `Effect.runSync`, placing an Effect runtime boundary on the per-node hot path.

**Recommendation:** Do not use it as Effect Doctor's rule host. It contributes no coverage and the per-visitor boundary should be avoided unless benchmark evidence proves it negligible. Use it only as an API-design reference.

### Official Oxlint and Effect's own Oxc tool

**Fact:** `@oxlint/plugins` supplies the direct JavaScript-plugin API, including `createOnce` for one-time plugin initialization and per-file lifecycle hooks. Effect's main repository independently demonstrates a small custom plugin and test harness under `packages/tools/oxc`. This is first-party evidence that Effect itself separates custom Oxlint syntax checks from TSGo semantic diagnostics.

**Recommendation:** Build first-party rules directly on `@oxlint/plugins`, initialized with `createOnce`. Keep visitor logic synchronous and plain, share immutable analysis at plugin scope, and use Effect for orchestration outside the node-visitor loop. Load the community plugin and the first-party plugin in the same Oxlint run so each file is parsed once.

### Fallow 3.20.0

**Fact:** Fallow analyzes general repository health: unused code, cycles, duplication, complexity, boundaries, and design-system drift. Its plugin model declares framework entry points and reachability conventions rather than exposing an Effect-aware arbitrary AST rule host. Its own documentation distinguishes optional type-aware project analysis from TypeScript and local lint.

**Recommendation:** Use `fallow audit` for Effect Doctor self-audit now. If calibrated later, expose it as a separately identified project-health provider. Do not use it to host Effect AST rules or relabel generic maintainability findings as Effect semantics.

## Useful Effect-TS organization sources

**Measurement:** The public organization inventory contained 25 repositories on 2026-08-29. The useful clean-room evidence surfaces were:

| Repository or path | Use |
| --- | --- |
| `Effect-TS/effect` | Runtime, tests, documentation, and real first-party usage as contract evidence |
| `effect/packages/tools/oxc` | Official custom Oxlint plugin and test-harness blueprint |
| `effect/migration/annotations` | 536 YAML files with about 7,208 API-key mappings for future typed migration research |
| `Effect-TS/tsgo` | Authoritative semantic and type-aware diagnostic provider |
| `Effect-TS/skills` | Official domain guidance and abstention evidence |
| `Effect-TS/website` | Documentation source and supported usage evidence |
| `Effect-TS/language-service` | Legacy historical evidence only; its README directs newer TypeScript users to TSGo |

No public Effect-TS repository named `solutions`, `biome`, or `oxlint` appeared in that inventory. Absence from this snapshot is not evidence that no private or future repository exists.

**Recommendation:** Derive new rule contracts from pinned Effect source, tests, skills, documentation, migration data, and real merged fixes. Treat migration annotations as future typed-rule evidence, not as automatic syntax replacements.

## Clean-room and licensing boundary

**Fact:** React Doctor's controlling Modified MIT license requires prior written permission for specified uses involving AI training, evaluation data, or automated systems intended to improve AI. Agent Doctor's audited tree has package manifests that mention MIT but no top-level license text granting use of the repository source.

**Recommendation:** React Doctor and Agent Doctor remain prior-art inventories only. Do not copy or paraphrase their source, rule prose, diagnostics, tests, examples, fixtures, thresholds, scoring, or docs into Effect Doctor. Do not run React Doctor inside EffectBench without permission and legal review. Record provenance for each first-party contract and derive it from official Effect materials, permissively licensed tooling, and independently observed failures. High-level ideas such as generated registries or cache partitioning must be implemented without access to protected expression by the implementer responsible for the rule behavior.

## Chosen architecture

1. A deterministic planner resolves the root, TypeScript configuration, Effect version/capabilities, immutable file inventory, provider versions, and rule plan.
2. The pinned TSGo adapter owns all semantic and type-aware diagnostics. The catalog for 0.38.0 contains exactly 99 entries.
3. Primary Oxlint owns syntax and local structure. It loads the conservatively configured community plugin plus a first-party direct `@oxlint/plugins` plugin using `createOnce`; a separate isolated Oxlint pass owns suppression integrity so directives cannot hide themselves.
4. A separate project stage owns graph, repository-artifact, and cross-file contracts. Fallow may contribute only under its own project-health provenance.
5. A normalization layer maps stable public IDs without hiding native provider IDs, keeps deterministic ordering and fingerprints, and reports planned, analyzed, skipped, and failed work per provider receipt.
6. Complete reports require exact planned/analyzed inventory agreement and live provider output. Timeout, crash, malformed output, unknown emitted rules, or inventory mismatch fails closed.

## Phased parity criteria

| Phase | Exit criteria |
| --- | --- |
| 0. Truthful inventory | Generated catalogs exactly match 99 TSGo and 40 community Oxlint rules; provider-version drift fails tests; every emitted native identity resolves; planned and analyzed files match per provider receipt. |
| 1. Upstream closure | All 48 TSGo and 12 Oxlint Agent Doctor overlaps map to an upstream provider or a written waiver; no duplicate first-party implementation exists; provenance and severity policy are stable. |
| 2. Independent gaps | Each of at most 8 candidate contracts has official provenance, a written failure model, firing and close-valid adversarial fixtures, version and import gates, a liveness proof, and no unexplained false positives on the pinned calibration corpus. New rules begin as preview or advice. |
| 3. Project discipline | The 22 generic candidates remain outside Effect-specific coverage; 18 style and 10 stale/false-positive candidates remain rejected; any project rule has an explicit dependency model and completeness proof. |
| 4. Operational parity | Cold CLI, warm worker, and cache-hit benchmarks use fixed small, medium, and large corpora; performance budgets are declared before optimization; concurrent providers and caches pass equivalence, invalidation, determinism, timeout, and partial-failure tests. |

Parity is achieved when accepted Effect contracts are completely and reproducibly covered, not when the catalog reaches React Doctor's raw count.

## Decision table

| Question | Decision |
| --- | --- |
| Semantic authority | Keep pinned `@effect/tsgo@0.38.0`, 99-rule catalog |
| Local syntax host | Direct `@oxlint/plugins` with `createOnce` |
| Community defaults | Curate by blocking/advisory/preview/delegate/reject policy |
| `mpsuesser/effect-oxlint` | Reference only, not the runtime substrate |
| Project health | Separate Effect Doctor/Fallow stage and provenance |
| React Doctor and Agent Doctor | Clean-room prior art only |
| Parity target | Completeness, rule quality, and operational architecture, not count |

## Primary sources

- Effect Doctor: [scan orchestration](../../src/scan.ts), [TSGo adapter](../../src/internal/tsgo.ts), [Oxlint adapter](../../src/internal/oxlint.ts), and [contributor policy](../../AGENTS.md).
- React Doctor `4e049212`: [generated registry](https://github.com/millionco/react-doctor/blob/4e049212052a5433e1995cc6353a0fcde3c8a2e1/packages/oxlint-plugin-react-doctor/src/plugin/core-rule-registry-data.json), [plugin host](https://github.com/millionco/react-doctor/blob/4e049212052a5433e1995cc6353a0fcde3c8a2e1/packages/oxlint-plugin-react-doctor/src/plugin/react-doctor-plugin.ts), [rule-mode partition](https://github.com/millionco/react-doctor/blob/4e049212052a5433e1995cc6353a0fcde3c8a2e1/packages/oxlint-plugin-react-doctor/src/rules.ts), and [core runner](https://github.com/millionco/react-doctor/blob/4e049212052a5433e1995cc6353a0fcde3c8a2e1/packages/core/src/run-oxlint.ts).
- React Doctor performance: [batch runner](https://github.com/millionco/react-doctor/blob/4e049212052a5433e1995cc6353a0fcde3c8a2e1/packages/core/src/runners/oxlint/spawn-batches.ts), [file cache](https://github.com/millionco/react-doctor/blob/4e049212052a5433e1995cc6353a0fcde3c8a2e1/packages/core/src/runners/oxlint/file-lint-cache.ts), and [sidecar cache](https://github.com/millionco/react-doctor/blob/4e049212052a5433e1995cc6353a0fcde3c8a2e1/packages/core/src/runners/oxlint/sidecar-lint-cache.ts).
- React Doctor quality and completeness: [liveness](https://github.com/millionco/react-doctor/blob/4e049212052a5433e1995cc6353a0fcde3c8a2e1/packages/oxlint-plugin-react-doctor/src/plugin/liveness/liveness.test.ts), [registry test](https://github.com/millionco/react-doctor/blob/4e049212052a5433e1995cc6353a0fcde3c8a2e1/packages/oxlint-plugin-react-doctor/src/plugin/rule-registry.test.ts), [project registry test](https://github.com/millionco/react-doctor/blob/4e049212052a5433e1995cc6353a0fcde3c8a2e1/packages/oxlint-plugin-react-doctor/src/plugin/project-rule-registry.test.ts), [large-shape test](https://github.com/millionco/react-doctor/blob/4e049212052a5433e1995cc6353a0fcde3c8a2e1/packages/oxlint-plugin-react-doctor/src/plugin/rules/heavy-rules.performance.test.ts), [evaluation design](https://github.com/millionco/react-doctor/blob/4e049212052a5433e1995cc6353a0fcde3c8a2e1/packages/evals/README.md), and [completion predicate](https://github.com/millionco/react-doctor/blob/4e049212052a5433e1995cc6353a0fcde3c8a2e1/packages/core/src/utils/is-scan-complete.ts).
- React Doctor licensing: [Modified MIT license](https://github.com/millionco/react-doctor/blob/4e049212052a5433e1995cc6353a0fcde3c8a2e1/LICENSE).
- TSGo 0.38.0 at `73b4c54`: [generated metadata](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/_packages/tsgo/src/metadata.json), [registered rules](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/internal/rules/rules.go), and [structured diagnostic CLI](https://github.com/Effect-TS/tsgo/blob/73b4c54fdbf7dd4dc506bb1dcc3d938f0a4fe3e9/_packages/tsgo/src/cli/diagnostics.ts). Current unreleased comparison: [main at `f134c31`](https://github.com/Effect-TS/tsgo/tree/f134c316b685b70fc513d10ed9b7c899088667f5).
- `oxlint-plugin-effect` 0.11.0 at `f3464b3`: [rule registry](https://github.com/cevr/effect-oxlint/blob/f3464b3a1c3cacf55965ed2aa273b4accd715bfa/src/rules/index.ts), [recommended preset](https://github.com/cevr/effect-oxlint/blob/f3464b3a1c3cacf55965ed2aa273b4accd715bfa/src/presets/recommended.ts), and [plugin policy](https://github.com/cevr/effect-oxlint/blob/f3464b3a1c3cacf55965ed2aa273b4accd715bfa/README.md).
- Official Oxlint 1.80.0 at `97e99b8`: [`@oxlint/plugins` API](https://github.com/oxc-project/oxc/blob/97e99b85483776a72928d675cc05b1cfc1130ba0/npm/oxlint-plugins/README.md) and [`createOnce` fixture](https://github.com/oxc-project/oxc/blob/97e99b85483776a72928d675cc05b1cfc1130ba0/apps/oxlint/test/fixtures/createOnce/plugin.ts).
- Effect at `145d8e1`: [custom Oxc plugin](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/tools/oxc/src/oxlint/index.ts), [test harness](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/packages/tools/oxc/test/utils.ts), and [migration annotation guide](https://github.com/Effect-TS/effect/blob/145d8e1013220425b8edf34f7011c73f73e1cdcf/migration/annotations/README.md).
- Other official Effect sources: [skills at `2309e6f`](https://github.com/Effect-TS/skills/tree/2309e6f27d9955b434c0e3f394b945c136e89fd2), [website at `902b3a1`](https://github.com/Effect-TS/website/tree/902b3a10649ffa308d602d684be0566c8a7a256c), and [legacy language service notice at `5e4d380`](https://github.com/Effect-TS/language-service/blob/5e4d380b6fcd20f048dd8d41515bcd9ea47ffda4/README.md).
- Agent Doctor at `007644b`: [118-rule catalog assertion](https://github.com/JGalbss/agent-doctor/blob/007644b4899804b03ed9836230d681f5863f3b37/crates/core/tests/catalog.rs), [core registry](https://github.com/JGalbss/agent-doctor/blob/007644b4899804b03ed9836230d681f5863f3b37/crates/core/src/rules/mod.rs), and [repository root](https://github.com/JGalbss/agent-doctor/tree/007644b4899804b03ed9836230d681f5863f3b37).
- `mpsuesser/effect-oxlint` 0.3.4 at `d8c892f`: [package surface](https://github.com/mpsuesser/effect-oxlint/blob/d8c892f4fedc072409dca290ac44733bf5dc3e87/src/index.ts) and [`Effect.runSync` rule bridge](https://github.com/mpsuesser/effect-oxlint/blob/d8c892f4fedc072409dca290ac44733bf5dc3e87/src/Rule.ts).
- Fallow 3.20.0 at `85d490c`: [project scope](https://github.com/fallow-rs/fallow/blob/85d490ce31ada36388dd59f7860716b261b48694/README.md) and [plugin authoring model](https://github.com/fallow-rs/fallow/blob/85d490ce31ada36388dd59f7860716b261b48694/docs/plugin-authoring.md).
