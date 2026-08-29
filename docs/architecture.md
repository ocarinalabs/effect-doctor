# Architecture

Effect Doctor is a small deterministic boundary around official Effect analysis. Its public package exposes scanning and comparison, rule discovery, report models and schemas, rendering and blocking helpers, plus the CLI. The implementation keeps rule policy, project planning, provider execution, and result normalization separate so a successful empty report is meaningful.

## Clean-room parity

React Doctor supplied a product-level reference point: one command should make framework-specific quality visible to both people and automation. Effect Doctor is not a port. No React Doctor or Agent Doctor source, fixtures, tests, messages, thresholds, or rule implementations are included. Effect Doctor's checks come from pinned Effect providers, official Effect documentation and source, and independently written first-party rules.

Parity therefore means structural capability, not identical implementation:

- an exhaustive explainable rule inventory;
- framework-aware typed and structural analysis;
- a stable machine-readable scan and comparison contract;
- proof that every intended file and provider ran; and
- a narrow package and CLI surface.

## Execution modes

Different checks require different amounts of context. Treating them as one generic lint pass either loses signal or makes ownership unclear.

| Mode | Owner | What it can establish |
| --- | --- | --- |
| Typed | Effect TSGo | Type-aware Effect correctness, API use, and project semantics |
| Provider AST | `oxlint-plugin-effect` | Fast structural checks backed by Oxlint's parsed syntax and scopes |
| First-party AST | Effect Doctor through primary Oxlint | Host-neutral import-binding, lexical-scope, and security checks |
| Integrity AST | Effect Doctor through isolated Oxlint | Directive comments that must remain visible even when they disable lint rules |
| File expansion | Project snapshot planner | The exact configured TypeScript source inventory |
| Project comparison | Effect Doctor | Evidence-aware multiset changes across two complete scans |

Provider execution is not rule ownership. The first-party JavaScript plugin runs through Oxlint, but its findings retain `effect-doctor` provenance. Upstream rules retain `effect-oxlint` or `effect-tsgo` provenance.

## Catalog and policy

The generated typed `RuleCatalog` is authoritative. It contains all 99 diagnostics from `@effect/tsgo` 0.38.0, all 40 rules from `oxlint-plugin-effect` 0.11.0, and the 2 public first-party rules. From that one table the runtime derives:

- provider configuration;
- canonical IDs and native diagnostic aliases;
- category, severity, status, fixability, descriptions, and Effect-version support;
- diagnostic normalization; and
- `knownRules()`, `rules list`, and `rules explain`.

The network-free build lever is `scripts/rule-catalog.mjs`. Its default input is the checked-in exact TSGo metadata artifact. `bun run catalog:check` compares generated output with that input and the installed TSGo schema and Oxlint rule inventory. `bun run catalog:generate` deterministically rewrites the generated table. An explicit local TSGo reference checkout may be supplied with `--reference`; refreshing the vendored input additionally requires `--refresh-input`.

Catalog membership and default policy are separate. A rule can be known while disabled. Effect Doctor enables upstream TSGo's 28 error/warning defaults, 15 broadly applicable Oxlint rules, and 7 first-party advisory rules. Preview rules, checks delegated to TSGo, and subjective policy bans stay visible without silently becoming project requirements.

Full presets are not enabled blindly because bans on syntax such as `async`, `try/catch`, ternaries, nullish values, globals, or Node imports often encode a team's local conventions rather than evidence of an Effect defect. A smaller default profile gives blocking severity a defensible meaning.

## Snapshot ownership

After resolving the project root and the pinned toolchain, Effect Doctor asks the version- and gitHead-matched native Effect TypeScript compiler to expand the root `tsconfig.json` with `--showConfig`. The JSON boundary is schema-decoded. The snapshot includes project-local TypeScript and TSX sources, including `.d.ts`, `.d.mts`, and `.d.cts` declarations. Duplicate files, empty inventories, and paths escaping the root fail the scan.

Each accepted file is real-pathed, sorted by a locale-independent code-unit order, read once, and stored with its source text and digest in an immutable `ProjectSnapshot`. Oxlint receives those files explicitly. TSGo receives the same `tsconfig.json` used to build the snapshot and must report an identical file inventory before its output is accepted. After both providers finish, Effect Doctor reruns `--showConfig` and compares the expanded-plan digest, root configuration digest, and exact inventory before re-reading every source and comparing its digest. Added or removed files, changes in an extended configuration, root configuration edits, and mid-scan source edits therefore fail instead of combining observations from different project states.

The native planner avoids an important host trap: TypeScript 7's synchronous JavaScript API transport relies on Node-private child-process pipe handles. Constructing it under Bun can spawn `tsc --api` and then throw before the API object becomes available for cleanup. The native compiler process is instead owned by Effect's scoped process resource, has a bounded timeout, and is force-killed on interruption.

## Provider execution and completeness

Effect TSGo and Oxlint start concurrently after snapshot creation. TSGo is invoked through its packaged native diagnostics protocol only after the resolver verifies:

- the platform package matches `@effect/tsgo` exactly;
- its metadata schema layout is supported;
- the installed TypeScript version and git commit match the packaged component;
- the executable resolves inside that package; and
- the executable is a regular executable file.

The resolver also validates the exact installed versions of Effect, `@effect/tsgo`, its platform package, TypeScript, Oxlint, `oxlint-plugin-effect`, and `@oxlint/plugins`. Report provenance is derived from those validated versions rather than independent version strings.

Primary Oxlint receives the explicit snapshot files with both the upstream plugin and the first-party configuration rule. A hidden `Program` canary must appear exactly once for every expected file and is removed before normalization. A second concurrent Oxlint pass runs only the suppression-integrity rule over a temporary mirror. The mirror replaces Oxlint directive markers with same-length neutral markers while preserving every byte offset and newline, and the pass disables ESLint-style directive handling. Exactly one hidden integrity visit per source is required, mirror paths are mapped back to the original snapshot, and hidden visits are removed before normalization. This makes a file-wide or inline self-disable observable without duplicating primary canary semantics.

Each execution returns raw diagnostics plus a `ProviderReceipt`. Central validation requires exactly one receipt for Effect TSGo, Effect Oxlint, and Effect Doctor, a complete status, and an ordered file inventory identical to the snapshot. TSGo's own `filesChecked`, `totalFiles`, and listed-file invariants are also checked. Unknown diagnostics, missing canaries, extra files, partial coverage, malformed output, or mismatched summaries fail closed.

## Stable reports and comparisons

Normalization maps only cataloged native diagnostics. Findings use project-relative paths, source evidence, canonical rule IDs, and native provenance. Ordering uses a shared locale-independent code-unit comparator. Reports intentionally omit durations, timestamps, absolute paths, temporary paths, host data, caches, and raw compiler stderr. Public failure text is stable and does not expose target or temporary paths.

`compareProjects` runs two complete scans and performs evidence-aware multiset matching. It prefers a matching fingerprint in the same file, then permits the same evidence to move across files. Every candidate slot can be consumed once, so duplicated findings retain multiplicity.

Performance measurement lives outside the report contract. `bun run bench` builds the package and launches fresh packaged self-scans, reporting p50 and sorted samples without caching or modifying scan JSON.
