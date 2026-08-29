# Agent Doctor and Fallow prior-art audit

Research snapshot: 2026-08-30

This report evaluates two projects as architectural prior art for Effect Doctor. It does not propose importing either analyzer, and it does not reproduce their source, diagnostics, examples, scoring constants, thresholds, or tests. The recommendations are product and architecture ideas that would need independent design, Effect-owned provenance, and Effect Doctor's normal rule-contract process.

## Executive conclusion

Agent Doctor is the closer product comparison because it has a native Effect-oriented rule engine, an optional type-aware Effect tier, rule discovery, explanations, profiles, and Git diff scopes. Its fast local analysis contains good product ideas. Its current scan contract is not suitable as EffectBench's source of truth, however: file-read and parser failures can become empty results, an optional provider can fail silently, the JSON model includes run duration, and its changed-line mode filters findings from the candidate tree rather than comparing two complete project states.

Fallow is not an Effect analyzer. Its value is architectural: it has a carefully layered fact-to-contract pipeline, deterministic identity and ordering rules, explicit discovery/read evidence, real base-worktree audits, rename-aware attribution, and aggressively validated caches. Those are useful references for a future Git convenience adapter or cache. Fallow's generic dead-code, duplication, complexity, dependency, and boundary findings should remain complementary tooling rather than be relabeled as `effect/*` rules.

Effect Doctor already has the stronger benchmark seam: `compareProjects` concurrently performs two complete scans, and the comparator matches a multiset of evidence-bearing findings rather than merely filtering candidate lines or comparing sets. The immediate recommendation is therefore to keep the current seam and catalog ownership, use Fallow separately for repository health, and add no Agent Doctor rules solely because Agent Doctor has them.

## Sources and method

The audit inspected pinned source snapshots so every source link is immutable:

| Project | Inspected revision | Role in this audit |
| --- | --- | --- |
| Agent Doctor | [`007644b4899804b03ed9836230d681f5863f3b37`](https://github.com/JGalbss/agent-doctor/tree/007644b4899804b03ed9836230d681f5863f3b37) | Effect-specific product and analyzer prior art |
| Fallow | [`df15924cb3ace9155aa431625f7e151d445617a6`](https://github.com/fallow-rs/fallow/tree/df15924cb3ace9155aa431625f7e151d445617a6) | Deterministic codebase-analysis and baseline-audit prior art |
| Effect Doctor | [`ddfcdf1e403f4c5321b7e1e4c1ed9f42ce7e787d`](https://github.com/ocarinalabs/effect-doctor/tree/ddfcdf1e403f4c5321b7e1e4c1ed9f42ce7e787d) | Current comparison point |

Claims below distinguish documented intent from behavior visible in the inspected implementation. No performance claim was independently benchmarked.

## Agent Doctor

### Check architecture

Agent Doctor has two principal analysis tiers. Its local tier walks ignored-aware TypeScript files, parses each Effect-bearing file with Oxc, builds import provenance, and dispatches all local rules from one AST traversal. Its type-aware tier invokes the Effect language-service diagnostics command and normalizes those results rather than recreating type analysis. This separation is explicit in its [architecture decision](https://github.com/JGalbss/agent-doctor/blob/007644b4899804b03ed9836230d681f5863f3b37/docs/ARCHITECTURE.md#L9-L21), [single-pass runner](https://github.com/JGalbss/agent-doctor/blob/007644b4899804b03ed9836230d681f5863f3b37/crates/core/src/runner.rs#L18-L89), [rule hook interface](https://github.com/JGalbss/agent-doctor/blob/007644b4899804b03ed9836230d681f5863f3b37/crates/core/src/rules/mod.rs#L176-L225), and [language-service adapter](https://github.com/JGalbss/agent-doctor/blob/007644b4899804b03ed9836230d681f5863f3b37/crates/core/src/deep.rs#L43-L90).

The registry is also the source of its rule listing and explanation surface. Catalog tests require unique identifiers, a rewrite explanation for every catalog entry, and an intentional update when the catalog size changes ([catalog tests](https://github.com/JGalbss/agent-doctor/blob/007644b4899804b03ed9836230d681f5863f3b37/crates/core/tests/catalog.rs#L5-L35)). The useful idea is registry-driven documentation completeness, not its particular explanations or tests.

An optional cross-file pass indexes functions for similarity findings, while optional React and design-system passes broaden the product beyond Effect. These are separate product tiers, not additional semantic confidence in Effect findings ([engine orchestration](https://github.com/JGalbss/agent-doctor/blob/007644b4899804b03ed9836230d681f5863f3b37/crates/core/src/engine.rs#L182-L252)).

### Scope and diff scanning

Agent Doctor offers full-project, changed-file, and changed-line scopes. It resolves a merge base, obtains name-only or zero-context Git diffs, treats untracked files as wholly changed, filters the discovered candidate files, and—when requested—retains only diagnostics whose candidate location intersects an added range ([scope model and Git collection](https://github.com/JGalbss/agent-doctor/blob/007644b4899804b03ed9836230d681f5863f3b37/crates/core/src/git_scope.rs#L5-L34), [base resolution and diff parsing](https://github.com/JGalbss/agent-doctor/blob/007644b4899804b03ed9836230d681f5863f3b37/crates/core/src/git_scope.rs#L54-L127), [engine filtering](https://github.com/JGalbss/agent-doctor/blob/007644b4899804b03ed9836230d681f5863f3b37/crates/core/src/engine.rs#L55-L107)).

That is a useful interactive scope, but it is not a baseline comparison. The base tree is not analyzed, so the mode cannot establish whether equivalent evidence moved, whether a project-level finding changed away from an edited line, or whether an apparently current finding already existed. It should not replace Effect Doctor's baseline-versus-candidate scan in benchmark rewards.

### Determinism and completeness

Agent Doctor sorts final diagnostics, which removes parallel collection order from their output ([sorting](https://github.com/JGalbss/agent-doctor/blob/007644b4899804b03ed9836230d681f5863f3b37/crates/core/src/engine.rs#L253-L262)). It also defines stable content and normalized path identifiers ([content addressing](https://github.com/JGalbss/agent-doctor/blob/007644b4899804b03ed9836230d681f5863f3b37/crates/core/src/content_addr.rs#L1-L63)). The inspected scan path nevertheless has several properties that prevent a successful report from proving complete deterministic analysis:

- The public scan result includes elapsed duration, so otherwise identical JSON need not be byte-identical ([result model and construction](https://github.com/JGalbss/agent-doctor/blob/007644b4899804b03ed9836230d681f5863f3b37/crates/core/src/engine.rs#L34-L45), [duration assignment](https://github.com/JGalbss/agent-doctor/blob/007644b4899804b03ed9836230d681f5863f3b37/crates/core/src/engine.rs#L264-L275)).
- A source read failure is filtered out rather than surfaced as an operational failure ([file processing](https://github.com/JGalbss/agent-doctor/blob/007644b4899804b03ed9836230d681f5863f3b37/crates/core/src/engine.rs#L284-L315)).
- A parser panic produces an empty file analysis ([parse path](https://github.com/JGalbss/agent-doctor/blob/007644b4899804b03ed9836230d681f5863f3b37/crates/core/src/lint.rs#L90-L137)).
- The optional React provider is explicitly allowed to fail as a no-op ([provider call](https://github.com/JGalbss/agent-doctor/blob/007644b4899804b03ed9836230d681f5863f3b37/crates/core/src/engine.rs#L218-L235), [adapter behavior](https://github.com/JGalbss/agent-doctor/blob/007644b4899804b03ed9836230d681f5863f3b37/crates/core/src/react.rs#L87-L101)).
- File collection respects ignore rules but the collector itself does not establish a sorted, configuration-expanded inventory that every provider must acknowledge ([walker](https://github.com/JGalbss/agent-doctor/blob/007644b4899804b03ed9836230d681f5863f3b37/crates/core/src/walk.rs#L25-L46)).

These trade-offs can be appropriate for a best-effort local health command. They are incompatible with Effect Doctor's requirement that “no findings” means every intended provider analyzed the same immutable project.

### Performance tactics

The local engine has a sensible fast path: ignored-aware discovery, parallel per-file processing, one parse and one AST walk per relevant file, a cheap text prefilter before parsing files that cannot contain an Effect import, and optional activation of costlier cross-file or type-aware tiers ([parallel and optional tiers](https://github.com/JGalbss/agent-doctor/blob/007644b4899804b03ed9836230d681f5863f3b37/crates/core/src/engine.rs#L149-L216), [prefilter](https://github.com/JGalbss/agent-doctor/blob/007644b4899804b03ed9836230d681f5863f3b37/crates/core/src/engine.rs#L284-L315)).

The reusable idea is to avoid redundant parsing and to make expensive evidence explicit. Effect Doctor already obtains its syntax pass from native Oxlint and its typed pass from Effect TSGo, concurrently; recreating a second Oxc rule engine would duplicate upstream ownership and increase drift. Any optimization must preserve exact file coverage, provider receipts, and the uncached report contract.

### Effect-specific rules and overlap

Agent Doctor reports a broad Effect-oriented catalog spanning generator syntax, error handling, runtime boundaries, Schema classes, promise interop, streams and concurrency, layers and provisioning, schedules and retries, configuration, logging, SQL, tests, and version migration. Its optional “agent” tier goes further into general functional-style, object-oriented-pattern, duplication, and maintainability advice ([catalog description and tier summary](https://github.com/JGalbss/agent-doctor/blob/007644b4899804b03ed9836230d681f5863f3b37/README.md#L100-L153)).

Much of the high-confidence Effect core already has an official owner in Effect Doctor. Representative conceptual overlaps include bare-yield detection, running an Effect inside Effect code, collecting an unbounded Stream, unbounded concurrency, chained provisioning, Schema self-type mismatch, and Schema constructor overriding. The current catalog shows these as TSGo or Oxlint-owned rules, with policy separated from catalog membership ([catalog architecture](https://github.com/ocarinalabs/effect-doctor/blob/ddfcdf1e403f4c5321b7e1e4c1ed9f42ce7e787d/docs/architecture.md#L32-L46), [representative TSGo rule](https://github.com/ocarinalabs/effect-doctor/blob/ddfcdf1e403f4c5321b7e1e4c1ed9f42ce7e787d/src/generated/rule-catalog.ts#L1692-L1717), [representative Oxlint rules](https://github.com/ocarinalabs/effect-doctor/blob/ddfcdf1e403f4c5321b7e1e4c1ed9f42ce7e787d/src/generated/rule-catalog.ts#L2303-L2325)).

Rule count is therefore not a useful parity target. General bans on control flow, mutation, object-oriented syntax, or language features encode a local style more often than an Effect defect. A rule that resembles Agent Doctor work should enter Effect Doctor only after independent rediscovery from official Effect source, documentation, skills, or real merged fixes, followed by a written contract, close valid cases, adversarial invalid cases, and corpus calibration.

## Fallow

### Check architecture

Fallow describes itself as deterministic TypeScript/JavaScript codebase intelligence, covering dead code, dependency graphs, duplication, complexity, boundaries, and styling rather than Effect semantics ([project scope](https://github.com/fallow-rs/fallow/blob/df15924cb3ace9155aa431625f7e151d445617a6/README.md#L9-L13)). Its architecture separates deterministic fact and analysis crates, stable contract crates, and protocol adapters; analyzer behavior belongs at the lowest layer that owns the required facts ([layering and ownership](https://github.com/fallow-rs/fallow/blob/df15924cb3ace9155aa431625f7e151d445617a6/docs/architecture-invariants.md#L7-L60)). The analysis pipeline progresses from configuration and discovery through extraction, resolution, graph analysis, detection, and output, with an explicit rule to fix the earliest incorrect stage rather than suppressing its downstream symptom ([pipeline](https://github.com/fallow-rs/fallow/blob/df15924cb3ace9155aa431625f7e151d445617a6/docs/reference/detection-internals.md#L6-L27)).

This is strong architectural prior art for keeping Effect Doctor's provider invocation, normalization, catalog policy, rendering, and CLI boundaries distinct. It is not a reason to import Fallow's domains into the Effect rule catalog.

### Scope, base scans, and attribution

Fallow's audit is materially different from Agent Doctor's changed-line filter. It computes changed paths across committed, staged, unstaged, and untracked work, detects and composes renames, creates a detached base worktree, and computes a real base snapshot. When a fresh base is needed, head analyses and base analysis run concurrently ([changed-tree coverage](https://github.com/fallow-rs/fallow/blob/df15924cb3ace9155aa431625f7e151d445617a6/crates/engine/src/changed_files.rs#L309-L395), [rename handling](https://github.com/fallow-rs/fallow/blob/df15924cb3ace9155aa431625f7e151d445617a6/crates/engine/src/changed_files.rs#L218-L259), [base worktree lifecycle](https://github.com/fallow-rs/fallow/blob/df15924cb3ace9155aa431625f7e151d445617a6/crates/cli/src/base_worktree.rs#L14-L137), [parallel head/base execution](https://github.com/fallow-rs/fallow/blob/df15924cb3ace9155aa431625f7e151d445617a6/crates/cli/src/audit.rs#L1005-L1040)). Its audit prelude rejects an unavailable changed-file computation and includes pre-rename paths in the base focus set ([audit prelude](https://github.com/fallow-rs/fallow/blob/df15924cb3ace9155aa431625f7e151d445617a6/crates/cli/src/audit.rs#L1333-L1423)); later it remaps base keys for rename-aware attribution ([assembly](https://github.com/fallow-rs/fallow/blob/df15924cb3ace9155aa431625f7e151d445617a6/crates/cli/src/audit.rs#L1466-L1504)).

Fallow creates stable, per-domain keys and compares base membership for dead code, health, duplication, and styling. It deliberately makes key collection exhaustive so adding a result field forces an audit-key decision ([exhaustive key collector](https://github.com/fallow-rs/fallow/blob/df15924cb3ace9155aa431625f7e151d445617a6/crates/api/src/audit_keys.rs#L889-L966), [domain comparison](https://github.com/fallow-rs/fallow/blob/df15924cb3ace9155aa431625f7e151d445617a6/crates/api/src/audit_keys.rs#L365-L443)). This is well suited to Fallow's domains, but its membership representation is set-oriented. Effect Doctor's slot-based multiset comparison is the better invariant for repeated identical diagnostics because each occurrence remains countable.

### Determinism and failure behavior

Fallow's contributor invariants require sorted machine output, stable fingerprints, schema-backed drift protection, and a full matrix of positive, abstaining, false-positive, suppression, and real-regression tests ([contract and test rules](https://github.com/fallow-rs/fallow/blob/df15924cb3ace9155aa431625f7e151d445617a6/docs/architecture-invariants.md#L85-L124)). Its parallel discovery explicitly sorts paths before assigning stable file identifiers ([discovery](https://github.com/fallow-rs/fallow/blob/df15924cb3ace9155aa431625f7e151d445617a6/crates/core/src/discover/walk.rs#L707-L800)). Source extraction records read failures rather than collapsing them into a clean file result ([parse collection](https://github.com/fallow-rs/fallow/blob/df15924cb3ace9155aa431625f7e151d445617a6/crates/extract/src/lib.rs#L137-L195)). Optional type-aware evidence is allowed to refine syntactic findings only when sufficiently complete; incomplete evidence preserves the conservative syntactic result ([accuracy invariants](https://github.com/fallow-rs/fallow/blob/df15924cb3ace9155aa431625f7e151d445617a6/docs/reference/detection-internals.md#L52-L68)).

These are compatible ideas for Effect Doctor: stable contracts, explicit evidence degradation, and no silent conversion of missing work into a clean report. Effect Doctor's stronger provider-specific requirement—exact complete receipts from all three intended engines—should remain.

### Performance tactics

Fallow combines parallel discovery with deterministic post-sort, uses a low-overhead sequential path for small parse sets and parallel extraction for larger sets, and reuses parsed modules in process only when source fingerprints and analysis mode match ([adaptive parsing](https://github.com/fallow-rs/fallow/blob/df15924cb3ace9155aa431625f7e151d445617a6/crates/extract/src/lib.rs#L121-L195), [session reuse](https://github.com/fallow-rs/fallow/blob/df15924cb3ace9155aa431625f7e151d445617a6/crates/engine/src/session.rs#L732-L780)). Its persisted base cache has a versioned payload, sorted key collections, compatibility validation, and atomic replacement ([cache payload](https://github.com/fallow-rs/fallow/blob/df15924cb3ace9155aa431625f7e151d445617a6/crates/cli/src/audit_cache.rs#L16-L114), [validation and persistence](https://github.com/fallow-rs/fallow/blob/df15924cb3ace9155aa431625f7e151d445617a6/crates/cli/src/audit_cache.rs#L166-L205)). Its cache identity includes the base revision, normalized changed files, configuration, materialized dependency context, coverage, and analysis options rather than only a source timestamp ([typed key](https://github.com/fallow-rs/fallow/blob/df15924cb3ace9155aa431625f7e151d445617a6/crates/types/src/audit_cache.rs#L86-L133)).

A future Effect Doctor cache should meet that standard: complete identity, explicit schema/toolchain versioning, atomic writes, deterministic payloads, and tests proving cached and uncached public reports are identical. Until scans are demonstrated to be a benchmark bottleneck, adding a cache would create more integrity risk than value; benchmark runs also benefit from a clearly uncached execution path.

### Effect-specific coverage

The inspected Fallow tree does not contain an Effect semantic rule family. It has an Effect Schema regression fixture that verifies generic export-graph behavior for same-named value and type surfaces ([fixture test](https://github.com/fallow-rs/fallow/blob/df15924cb3ace9155aa431625f7e151d445617a6/crates/core/tests/integration_test/issue_1304_effect_schema_same_name.rs#L1-L47)). That is evidence that Fallow can analyze real Effect repositories, not evidence that it judges Effect idioms.

Fallow should therefore be run alongside Effect Doctor for codebase health when desired. Its findings must retain Fallow provenance and must not affect an EffectBench framework-quality reward unless the benchmark explicitly defines a separate generic-maintainability dimension.

## Effect Doctor's current seam

Effect Doctor's current catalog is exhaustive over its pinned official providers and keeps membership separate from default policy: 99 Effect TSGo diagnostics, 40 `oxlint-plugin-effect` rules, and 9 independently sourced first-party rules, with a narrower enabled profile ([catalog and policy](https://github.com/ocarinalabs/effect-doctor/blob/ddfcdf1e403f4c5321b7e1e4c1ed9f42ce7e787d/docs/architecture.md#L32-L46)). This ownership model is preferable to duplicating an upstream rule under a new local implementation.

For each scan, Effect Doctor expands the project configuration into a sorted inventory, freezes source text and digests, runs TSGo and Oxlint concurrently, validates exact provider coverage, normalizes and sorts findings, then verifies the inventory, configuration, and sources did not change during analysis ([snapshot construction and verification](https://github.com/ocarinalabs/effect-doctor/blob/ddfcdf1e403f4c5321b7e1e4c1ed9f42ce7e787d/src/internal/project-snapshot.ts#L91-L193), [scan orchestration](https://github.com/ocarinalabs/effect-doctor/blob/ddfcdf1e403f4c5321b7e1e4c1ed9f42ce7e787d/src/scan.ts#L107-L145)). Exactly one complete receipt from Effect Doctor, Effect Oxlint, and Effect TSGo must name the same ordered files ([receipt validation](https://github.com/ocarinalabs/effect-doctor/blob/ddfcdf1e403f4c5321b7e1e4c1ed9f42ce7e787d/src/internal/provider-receipt.ts#L7-L38)). Its report model intentionally omits timing and host state ([stable reports](https://github.com/ocarinalabs/effect-doctor/blob/ddfcdf1e403f4c5321b7e1e4c1ed9f42ce7e787d/docs/architecture.md#L72-L78)).

`compareProjects` accepts baseline and candidate roots, scans both concurrently, and returns a versioned report of introduced, resolved, and unchanged findings ([public seam](https://github.com/ocarinalabs/effect-doctor/blob/ddfcdf1e403f4c5321b7e1e4c1ed9f42ce7e787d/src/compare.ts#L13-L35)). Finding identity is derived from canonical rule, normalized message, and normalized source evidence, with location used only when evidence is absent ([fingerprint](https://github.com/ocarinalabs/effect-doctor/blob/ddfcdf1e403f4c5321b7e1e4c1ed9f42ce7e787d/src/fingerprint.ts#L4-L27)). Comparison first prefers the same fingerprint in the same file, then permits matching evidence to move, and consumes each candidate slot once ([multiset comparator](https://github.com/ocarinalabs/effect-doctor/blob/ddfcdf1e403f4c5321b7e1e4c1ed9f42ce7e787d/src/delta.ts#L10-L58)).

That interface should remain the EffectBench integration point. If a Git-native command is later useful for humans or CI, it should be an adapter that resolves/materializes two trees and delegates to `compareProjects`; it should not add line-diff semantics to the scanner or weaken the complete-snapshot contract.

## Recommendation matrix

| Idea from prior art | Decision | Reason and guardrail |
| --- | --- | --- |
| Registry-driven rule explanations and drift checks | Adopt conceptually | Extend the existing catalog surface only with independently written guidance and generated/drift-tested coverage. Do not reuse Agent Doctor's explanations or examples. |
| One parsed syntax representation shared by local rules | Preserve through provider ownership | Oxlint already supplies the native syntax engine. Avoid a parallel first-party parser unless a proven rule cannot be expressed through the owned provider seam. |
| Candidate changed-file/changed-line mode | Do not use for benchmark comparison | It is a convenience filter, not evidence that a finding is introduced. |
| Git-native pull-request mode | Defer; add only as an outer adapter | Follow the real-base-scan and rename-aware idea, then call the existing public comparison seam. Keep Git/worktree mechanics outside `scan` and core report identity. |
| Deterministic base cache | Defer until measured necessary | Require exhaustive identity, versioning, atomic persistence, explicit misses, and cached/uncached equivalence tests. Keep benchmarks able to force uncached runs. |
| Numeric health score based on distinct rule kinds | Reject for EffectBench reward | It discards occurrence multiplicity and obscures which blocking evidence was introduced. Use introduced findings and explicit severity/policy instead. |
| Silent parser, file, or optional-provider skips | Reject | An incomplete analysis cannot be reported as clean. Preserve snapshot and receipt validation. |
| Agent Doctor's Effect rule implementations | Reject as source material | Prefer the official TSGo/Oxlint owner; otherwise rediscover the behavior from primary Effect sources and independently implement it under the first-party rule contract. |
| General style, duplication, complexity, and architecture findings | Keep separate | Use Fallow as complementary repository tooling; do not turn generic policy into Effect semantics. |
| Explicit analyzer stages and earliest-fault ownership | Adopt conceptually | Preserve clear boundaries among discovery, provider execution, normalization, policy, comparison, and rendering, with failures fixed at their owner. |

## License and provenance boundary

Agent Doctor's workspace manifest declares MIT ([manifest](https://github.com/JGalbss/agent-doctor/blob/007644b4899804b03ed9836230d681f5863f3b37/Cargo.toml#L5-L9)), but the inspected commit's root tree did not contain a `LICENSE`, `COPYING`, or `NOTICE` file. A manifest declaration is not a substitute for preserving the full license text and attribution when copying material. More importantly, Effect Doctor's clean-room policy independently forbids copying Agent Doctor source, fixtures, tests, messages, examples, thresholds, and documentation.

Fallow declares MIT in its manifest and includes the complete license text ([manifest](https://github.com/fallow-rs/fallow/blob/df15924cb3ace9155aa431625f7e151d445617a6/Cargo.toml#L5-L13), [license](https://github.com/fallow-rs/fallow/blob/df15924cb3ace9155aa431625f7e151d445617a6/LICENSE#L1-L20)). Its permissive license makes reuse legally clearer, but the recommendations here still use it only as architectural prior art. If code is ever intentionally incorporated, the implementation must separately preserve required notices and record exact provenance.

The safe research rule is simple: borrow questions and invariants, not answers. New Effect behavior must be justified by Effect-owned primary sources or real Effect fixes, and infrastructure must be independently implemented against Effect Doctor's deterministic public contracts.
