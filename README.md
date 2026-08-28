# Effect Doctor

Effect Doctor is a deterministic quality analyzer for [Effect](https://effect.website/) TypeScript. It gives humans, CI, and coding-agent evaluations one black-box interface over three independent engines:

- **Effect TSGo** for official, type-aware Effect diagnostics.
- **Effect Oxlint** for a curated set of high-confidence structural rules.
- **Effect Doctor** for first-party integrity rules, beginning with diagnostic-suppression inventory.

The output is a versioned report with stable ordering, project-relative paths, rule provenance, source evidence, and an explicit file inventory for every engine. If any required analyzer cannot prove complete coverage, the scan fails instead of reporting a false clean result.

## Usage

```sh
effect-doctor .
effect-doctor . --format json
effect-doctor compare ../baseline . --format json
effect-doctor rules
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

The default Oxlint profile is deliberately narrower:

- runtime construction inside an Effect;
- per-call cache construction;
- collecting a clearly unbounded stream;
- silently swallowing failures;
- unbounded concurrency;
- unbounded retry; and
- non-exhaustive tagged matching.

Provider rule names are preserved in `provenance`; Effect Doctor also maps them to stable public rule IDs. First-party rules require adversarial valid and invalid fixtures before they can become blocking diagnostics.

## Report contract

JSON scans use `effect-doctor/scan/v1`; comparisons use `effect-doctor/comparison/v1`. Runtime schemas for both reports are exported from `@ocarinalabs/effect-doctor`.

Reports intentionally contain no timestamps, durations, temporary paths, hostnames, scores, or network-derived data. Effect Doctor never edits the target project and verifies that the planned source inventory remains unchanged during analysis.

## Development

```sh
bun install
bun run setup:effect
bun run check
bun run audit
bun run doctor:self
npm pack --dry-run
```

The implementation itself uses Effect 4 and is checked with Effect TSGo, `oxlint-plugin-effect`, Ultracite, and Fallow. The packaged CLI is the boundary intended for EffectBench; Effect Doctor does not import benchmark tasks, treatments, trials, rewards, or model configuration.

## Prior art and independence

React Doctor informed the high-level idea of pairing behavioral verification with deterministic framework-specific analysis. Agent Doctor was reviewed as prior art. Effect Doctor is an independent implementation: neither project is a runtime dependency, and no source, tests, messages, thresholds, or rule implementations were copied.
