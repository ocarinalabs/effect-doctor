# Effect Doctor

Effect Doctor is a deterministic analyzer for Effect TypeScript projects. It gives developers, CI, and coding-agent evaluations one fail-closed interface over:

- Effect TSGo's official type-aware diagnostics;
- a curated subset of `oxlint-plugin-effect`; and
- Effect Doctor's own integrity, security, and resource-safety checks.

A successful empty report means all three providers analyzed the same project snapshot. Missing files, unknown diagnostics, malformed spans, incomplete providers, and project changes during a scan are operational failures, not clean results.

## Requirements

- Node.js 22.18 or newer.
- An Effect TypeScript project with a root `tsconfig.json`.
- The target project's dependencies installed in that checkout.

Effect Doctor is ESM-only. Its bundled analyzer toolchain is pinned; the rule catalog records each rule's Effect v3 and v4 compatibility separately.

## Quick start

Install the exact release you intend to use:

```sh
npm install --save-dev --save-exact @ocarinalabs/effect-doctor@0.1.0
npx effect-doctor .
```

A clean project prints output like:

```text
Effect Doctor analyzed 4 file(s): 0 error(s), 0 warning(s), 0 advice finding(s)
```

Pinning the version matters in CI and benchmarks because provider versions and rule policy are part of the result.

## CLI

```sh
effect-doctor <project>
effect-doctor <project> --format json
effect-doctor compare <baseline> <candidate> --format json
effect-doctor rules list
effect-doctor rules explain effect/floating-effect
```

`compare` is the preferred pull-request and benchmark interface. It matches existing findings across line shifts and file moves, preserves duplicate multiplicity, and blocks only on introduced findings.

To compare a branch, create a second checkout at the baseline revision, install that checkout's dependencies, and pass both directories to `compare`. For example:

```sh
git worktree add ../project-baseline origin/main
(cd ../project-baseline && npm ci)
npx effect-doctor compare ../project-baseline . --format json
git worktree remove ../project-baseline
```

Exit codes distinguish findings from analyzer failure:

| Code | Meaning                                                           |
| ---: | ----------------------------------------------------------------- |
|  `0` | Analysis completed and no finding crossed the blocking threshold  |
|  `1` | Analysis completed and at least one finding crossed the threshold |
|  `2` | Analysis was incomplete or could not start                        |

Use `--blocking error`, `--blocking warning`, or `--blocking never` to choose the threshold. Advice is visible but non-blocking by default.

`rules list` emits tab-separated terminal output. JSON scan and comparison reports are the stable machine interfaces.

## Node API

The package root exports Effect-returning scan and comparison functions, runtime report schemas, rule metadata, renderers, blocking helpers, and the typed failure cases.

```ts
import { Effect } from "effect";
import {
  scanProject,
  type DoctorFailure,
  type ScanReport,
} from "@ocarinalabs/effect-doctor";

const program: Effect.Effect<ScanReport, DoctorFailure> = scanProject({
  root: process.cwd(),
});

const report = await Effect.runPromise(program);
```

`ProjectFailure`, `AnalyzerFailure`, and `InvalidAnalyzerOutput` are also exported for `_tag`-based handling. `AnalyzerFailure.reason` distinguishes process, timeout, output-limit, exit, and toolchain failures. Do not import from `dist/*` or `src/*`.

## Report contract

Scans use `effect-doctor/scan/v1`, comparisons use `effect-doctor/comparison/v1`, and CLI failures use `effect-doctor/error/v1`. Successful reports have stable ordering, project-relative paths, source evidence, canonical rule IDs, provider provenance, and exact analyzed-file receipts.

Reports intentionally omit timestamps, durations, hostnames, temporary paths, scores, and raw compiler output. Effect Doctor does not edit the target project. It rechecks the expanded TypeScript plan, source inventory, configuration, and source digests before returning.

The suppression-integrity provider writes same-length masked copies of source files to a private operating-system temporary directory. Normal completion and interruption remove that directory; a host crash or `SIGKILL` can leave it behind.

## Rule policy

The generated catalog is the source of truth for every known TSGo, Effect Oxlint, and first-party rule. `rules list` and `rules explain` show which rules are blocking, advisory, preview, delegated, or rejected.

Effect Doctor does not enable a whole community preset. Syntax bans such as forbidding every `async`, ternary, nullish value, global, Node adapter, or `try/catch` express local style policy unless a rule can prove an Effect-specific defect. First-party rules require invalid, close-valid, aliasing, and shadowing fixtures before admission.

## Development

```sh
bun install --frozen-lockfile
bun run setup:effect
bun run check
bun run audit
bun run doctor:self
bun run verify:package
```

`bun run verify:package` packs the current checkout, installs it into a fresh consumer with lifecycle scripts disabled, drives the installed CLI and Node API, proves all providers completed, and verifies that target fixtures were not edited.

See [the documentation index](docs/README.md), [contribution guide](CONTRIBUTING.md), [security policy](SECURITY.md), and [changelog](CHANGELOG.md).

## Prior art

React Doctor informed the product-level pattern of pairing behavioral tests with deterministic framework-specific analysis. Agent Doctor was reviewed as prior art. Effect Doctor is an independent implementation; neither project is a runtime dependency, and their source, tests, messages, thresholds, and rule implementations are not included.
