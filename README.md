# Effect Doctor

Effect Doctor is a deterministic quality analyzer for [Effect](https://effect.website/) TypeScript. It gives humans, CI, and coding-agent evaluations one black-box interface over three independently identified diagnostic sources:

- **Effect TSGo** for official, type-aware Effect diagnostics.
- **Effect Oxlint** for a curated set of high-confidence structural rules.
- **Effect Doctor** for host-neutral first-party integrity and security rules executed by Oxlint.

The output is a versioned report with stable ordering, project-relative paths, rule provenance, source evidence, and an explicit file inventory for every provider receipt. If any required analyzer cannot prove complete coverage, the scan fails instead of reporting a false clean result.

## Usage

```sh
effect-doctor .
effect-doctor . --format json
effect-doctor compare ../baseline . --format json
effect-doctor rules list
effect-doctor rules explain effect/floating-effect
```

`compare` is the preferred benchmark and pull-request interface. It reports only introduced and resolved findings, while matching existing findings across line shifts and file moves by normalized evidence. Duplicate findings retain their multiplicity, so copying an existing defect still introduces a finding.

Exit codes are intentionally process-friendly:

| Code | Meaning                                                          |
| ---: | ---------------------------------------------------------------- |
|  `0` | Analysis completed and no finding crossed the blocking threshold |
|  `1` | Analysis completed and a finding crossed the blocking threshold  |
|  `2` | Analysis was incomplete or could not start                       |

Use `--blocking error`, `--blocking warning`, or `--blocking never` to select the threshold. Advice remains visible without blocking by default.

## Quality policy

Effect Doctor does not enable the entire community lint preset. Blanket bans on `async`, nullish values, ternaries, globals, Node adapters, or `try/catch` are team conventions, not universal evidence that Effect code is wrong.

The checked-in catalog contains all 154 known rules: 99 Effect TSGo rules, all 40 `oxlint-plugin-effect` rules, and 15 first-party Effect Doctor rules. It is also the only source used to build provider configuration, normalize findings, and implement `rules list` and `rules explain`. Of those rules, 58 are enabled by default: the 28 upstream TSGo defaults, 15 curated Oxlint rules, and all 15 first-party rules.

The default Oxlint profile is deliberately narrower. Seven strong safety checks block at error severity:

- chained type assertions;
- managed-runtime construction inside an Effect;
- per-call cache construction;
- collecting a clearly unbounded stream;
- unbounded concurrency or retry; and
- widening followed by an assertion.

Eight broadly useful conventions remain non-blocking advice: module-mock avoidance, object-parameter review, sequential `Effect.all` review, tagged-error helpers, exhaustive tagged matching, tagged predicates, `ServiceMap.Service` construction, and named Effect functions. Preview, TSGo-delegated, and policy-only Oxlint rules remain visible but disabled.

First-party advice inventories diagnostic suppressions and covers narrowly provable configuration, runtime, logging, HTTP, SQL, Layer identity/lifetime, callback, Chunk aliasing, Schema compilation, tracing-name, and redaction mistakes. A hidden primary-pass file canary is never reported; it proves that Oxlint executed the JavaScript plugin exactly once over every planned source file. Suppression integrity uses a separate directive-immune Oxlint pass so a disable directive cannot hide itself.

Provider rule names are preserved in `provenance`; Effect Doctor also maps them to stable public rule IDs. First-party rules require adversarial valid and invalid fixtures before they can become blocking diagnostics.

## Report contract

JSON scans use `effect-doctor/scan/v1`; comparisons use `effect-doctor/comparison/v1`. Runtime schemas for both reports are exported from `@ocarinalabs/effect-doctor`.

Reports intentionally contain no timestamps, durations, temporary paths, hostnames, scores, raw compiler output, or network-derived data. Effect Doctor never edits the target project and verifies that its expanded configuration, exact source inventory, and source contents remain unchanged during analysis.

See [the architecture guide](docs/architecture.md) for catalog ownership, snapshot planning, provider receipts, execution modes, and clean-room parity goals.

See [the first-party rule contracts](docs/research/first-party-rules.md) for official provenance, deliberate abstentions, rejected candidates, adversarial fixtures, and pinned-corpus calibration.

See [the Kit Effect skill audit](docs/research/kit-effect-skill-audit.md) for the recommendation-by-recommendation ownership and enforceability decisions.

## Development

```sh
bun install
bun run setup:effect
bun run catalog:check
bun run check
bun run audit
bun run doctor:self
bun run bench
npm pack --dry-run
```

The implementation itself uses Effect 4 and is checked with Effect TSGo, `oxlint-plugin-effect`, Ultracite, and Fallow. The packaged CLI is the boundary intended for EffectBench; Effect Doctor does not import benchmark tasks, treatments, trials, rewards, or model configuration.

## Prior art and independence

React Doctor informed the high-level idea of pairing behavioral verification with deterministic framework-specific analysis. Agent Doctor was reviewed as prior art. Effect Doctor is an independent implementation: neither project is a runtime dependency, and no source, tests, messages, thresholds, or rule implementations were copied.
