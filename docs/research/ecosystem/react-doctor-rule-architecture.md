# React Doctor rule architecture: clean-room findings for Effect Doctor

Research date: 2026-08-30

## Research basis

This note studies React Doctor as prior art without treating it as a source of Effect rules. The source snapshot is [`millionco/react-doctor@afa1780254bfd72175e6d0025841560582d32ad1`](https://github.com/millionco/react-doctor/tree/afa1780254bfd72175e6d0025841560582d32ad1), the current `main` revision fetched for this audit. The Effect Doctor comparison is pinned to [`ocarinalabs/effect-doctor@ddfcdf1e403f4c5321b7e1e4c1ed9f42ce7e787d`](https://github.com/ocarinalabs/effect-doctor/tree/ddfcdf1e403f4c5321b7e1e4c1ed9f42ce7e787d).

The live React Doctor documentation is useful for product behavior, but it is not revision-pinned. In particular, the live rules page showed a different inventory count from the checked-out source during this audit. Counts below therefore come from the pinned generated registry and its source declarations, while product claims link to the official documentation.

No React Doctor implementation, messages, fixtures, examples, thresholds, or rule specifications are reproduced here. The goal is architectural comparison only.

## Executive answer

React Doctor is not simply a large Oxlint preset. It is a multi-stage analyzer with a generated rule catalog:

1. Most source-code rules are packaged as a custom JavaScript lint plugin and executed by Oxlint.
2. That plugin centrally wraps rules with framework gates, lazy scope analysis, and control-flow context.
3. File-system security scans and project-graph checks are registered in the same metadata model but run outside Oxlint.
4. React Compiler diagnostics, user-supplied plugins, adopted lint configuration, maintainability analysis, and an optional dependency check join the same diagnostic stream.
5. A separate baseline-delta stage identifies findings introduced by a branch.
6. A hosted API, not the local analyzer, computes the displayed health score.

The most useful parity target for Effect Doctor is the representation: one authoritative catalog, explicit execution modes, catalog-versus-default-policy separation, liveness tests, evidence-aware baseline comparison, and cache correctness proofs. The wrong parity target is React Doctor's rule count, hosted score, permissive partial-scan behavior, or React-specific source implementation.

## Inventory at the pinned revision

The generated catalog is derived from one rule declaration per file. A rule file declares its identity and behavior; code generation derives framework, category, tags, capability gates, activation state, and provenance from the containing bucket plus explicit metadata. The output is committed so consumers do not run code generation at install time. See the [generator contract](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/oxlint-plugin-react-doctor/scripts/generate-rule-registry.mjs#L1-L31), [bucket-derived metadata](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/oxlint-plugin-react-doctor/scripts/generate-rule-registry.mjs#L33-L138), and [registry construction and validation](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/oxlint-plugin-react-doctor/scripts/generate-rule-registry.mjs#L245-L358).

Measurements from that pinned registry:

| Registry surface | Count |
| --- | ---: |
| Total registry records | 906 |
| Active records | 901 |
| Active per-file/cross-file lint rules | 852 |
| Whole-tree file-scan rules | 42 |
| Whole-project rules | 7 |
| Retired compatibility identities | 5 |
| Enabled by default before project capability filtering | 734 |
| Marked as originally ported from an external rule set | 117 |

The execution partition reconciles exactly: 852 active lint rules + 42 scan rules + 7 project rules = 901 active rules. The remaining five records use a no-op retired-rule wrapper so old configurations and documentation can continue to resolve their IDs; they are disabled and cannot emit diagnostics. The [rule interface explicitly models retirement, scan execution, and project execution](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/oxlint-plugin-react-doctor/src/plugin/utils/rule.ts#L77-L109), and the [retired wrapper preserves identity with empty visitors](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/oxlint-plugin-react-doctor/src/plugin/utils/define-retired-rule.ts#L1-L13).

These counts are not a quality score. They include narrowly gated ecosystems such as React Native, Next.js, TanStack, Preact, Ink, Three.js, and WebGL, plus rules disabled by default. Project detection and capabilities substantially narrow what runs for any one repository.

## What owns the rules

### The custom React Doctor plugin owns the main registry

Every registry record has a stable `react-doctor/*` identity. The generated entry carries title, recommendation, severity, category, framework, required and disabling capabilities, tags, default activation, and whether its implementation originated in another permissively licensed lint family. A compact JSON form gives the core analyzer metadata without loading hundreds of visitor implementations, while a consistency test requires the compact and full registries to agree. See the [lightweight core registry](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/oxlint-plugin-react-doctor/src/plugin/core-rule-registry.ts#L1-L44) and its [full-registry parity test](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/oxlint-plugin-react-doctor/src/plugin/core-rule-registry.test.ts#L7-L83).

Some bundled implementations are ports from external rule sets. React Doctor does not hide that fact: code generation marks those records `originallyExternal`, and a custom-only mode can exclude them. The generator currently identifies the React/a11y buckets and a separately attributed effect-related family as external-origin rules. See the [provenance classification](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/oxlint-plugin-react-doctor/scripts/generate-rule-registry.mjs#L120-L182) and [where it becomes registry metadata](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/oxlint-plugin-react-doctor/scripts/generate-rule-registry.mjs#L304-L334).

### Oxlint is the per-file execution host, not the source of the catalog

The CLI deliberately disables Oxlint's broad built-in categories and built-in React/a11y plugin selection. It loads the generated React Doctor JavaScript plugin, optional npm-shipped plugins, and explicitly adopted user configuration. The effective rule map is selected from the registry after applying default activation, project capabilities, tags, and severity overrides. Scan and project rules are excluded because they do not have meaningful per-file visitors. See the [Oxlint configuration assembly](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/core/src/runners/oxlint/config.ts#L124-L245) and [provider selection](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/core/src/runners/oxlint/config.ts#L247-L322).

This explains why “React Doctor has hundreds of rules” does not mean “Oxlint supplied hundreds of rules.” Oxlint supplies parsing, traversal, scopes, process isolation, and diagnostics transport. React Doctor supplies the bulk of the catalog and its policy.

### Semantic context is shared lazily

Every lint rule is wrapped centrally. Framework-specific wrappers short-circuit rules in inapplicable package contexts, while scope and control-flow analysis are created on first use and memoized for the file. This lets simple syntax rules remain cheap and gives binding- or path-aware rules a common semantic layer without every rule reconstructing it. The plugin registration and wrapper order are visible in the [plugin assembly](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/oxlint-plugin-react-doctor/src/plugin/react-doctor-plugin.ts#L10-L49).

### Other diagnostic sources remain separate

React Doctor also has sources that are not part of its custom visitor map:

- React Compiler diagnostics come from `eslint-plugin-react-hooks`, loaded under a separate namespace when project detection says the compiler is relevant. The external registry currently lists 16 such diagnostics. See the [external-rule inventory](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/oxlint-plugin-react-doctor/src/external-rules.ts#L1-L40).
- Forty-two registered security scans operate on a bounded whole-tree file walk rather than the per-file AST pipeline. Their shared registry metadata still drives capability, tag, severity, and reporting behavior. See the [scan contract](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/oxlint-plugin-react-doctor/src/plugin/utils/rule.ts#L87-L108) and [core scan runner](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/core/src/check-security-scan.ts#L20-L76).
- Seven project rules are metadata identities for whole-project maintainability analysis rather than lint visitors. The exported presets intentionally omit them. See the [registry/preset separation](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/oxlint-plugin-react-doctor/src/rules.ts#L19-L87) and [project-rule partition test](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/oxlint-plugin-react-doctor/src/plugin/project-rule-registry.test.ts#L10-L49).
- The CLI can adopt a repository's JSON ESLint/Oxlint configuration and can load explicitly enabled user plugins. The [official configuration docs](https://www.react.doctor/docs/configuration/config-files) describe how these diagnostics join the same reporting, score, PR-comment, and CI surfaces.
- The default product also has a dependency supply-chain check. The official docs identify it as a network-backed check and document how to turn it off. It is not a deterministic local lint rule.

The official overview describes the same high-level composition: curated rules, maintainability analysis, dependency checks, and adopted lint configuration rather than one monolithic linter. See [What is React Doctor?](https://www.react.doctor/docs).

## Why the registry is encoded this way

The following are architectural inferences from the generator, registry consumers, and tests, not claims from a design manifesto.

### One declaration feeds every surface

Rule identity, recommendation, severity, category, activation, framework support, and tags are consumed by lint configuration, standalone plugin presets, rule-list/explain commands, diagnostics normalization, surface filtering, and documentation. Generating those views from one rule declaration prevents a new rule from being executable but undiscoverable—or documented but dead. The [registration check](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/core/src/runners/oxlint/validate-rule-registration.ts#L10-L59) verifies metadata required by runtime consumers.

### Directory conventions make additions cheap

The bucket directory supplies defaults for framework, category, tags, and capabilities. This turns a common contribution into “add one rule file and regenerate” and removes repeated metadata. It also makes the directory layout semantically significant, which is suitable for one product-owned catalog but would be a poor fit for Effect Doctor's multiple upstream providers. Effect Doctor should retain explicit provider metadata instead of inferring ownership from folders.

### Full implementation and lightweight metadata have different consumers

Oxlint needs executable visitors; the core analyzer often needs only rule identity and policy. Emitting both a full TypeScript registry and compact JSON metadata avoids importing the entire implementation graph just to list, filter, or explain rules. The test that compares both views is the important part of this optimization.

### Execution mode is part of the rule contract

A local AST rule, a cross-file rule, a whole-tree content scan, and a project graph analysis have different completeness and caching requirements. Encoding the mode prevents the engine from silently running a whole-project claim on an incomplete source subset. The official maintainability documentation explicitly says optional graph rules run only on full scans because partial scans cannot prove reachability; see [React Maintainability](https://www.react.doctor/docs/overview/react-maintainability).

### Catalog membership is not default policy

`defaultEnabled: false` keeps an identity importable, testable, explainable, and user-selectable without forcing it into every repository. Framework and capability gates narrow it further. This is why a catalog count cannot be interpreted as the number of checks in a normal scan.

### Retired identities are compatibility records

Retirement is explicit rather than deletion. Old configuration keys still resolve, but the no-op implementation cannot produce findings. This is a useful public-contract pattern once a doctor has published rule IDs.

## Categories, severity, and presentation policy

Rule source buckets are more detailed internally, but code generation collapses them into five user-facing outcome categories: Security, Bugs, Performance, Accessibility, and Maintainability. The mapping is centralized so JSON, CLI summaries, configuration, and documentation agree. See the [category normalization table](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/oxlint-plugin-react-doctor/scripts/generate-rule-registry.mjs#L184-L243).

The authored rule severity vocabulary is `error` or `warn`. Severity is independent from default activation. Users can override a specific rule or a category, while a specific rule setting wins. Tags can opt rule families in or out before linting. A separate “surface” layer can keep a finding visible in one context and exclude it from score, CI failure, or PR comments without disabling analysis. The [official configuration docs](https://www.react.doctor/docs/configuration/config-files) describe those precedence and visibility controls.

This separation is a major reason the large catalog remains usable:

- identity says what the diagnostic is;
- category says which human outcome it affects;
- severity says how urgent the default presentation is;
- default activation says whether it normally runs;
- capability and framework gates say whether it applies;
- tags group cross-cutting policies;
- surfaces say where an already-produced finding participates.

Effect Doctor currently represents a similar separation with provider source, category, severity, status, selection, default activation, execution mode, native aliases, and supported Effect versions. See its [rule metadata model](https://github.com/ocarinalabs/effect-doctor/blob/ddfcdf1e403f4c5321b7e1e4c1ed9f42ce7e787d/src/rules.ts#L1-L110).

## Baseline behavior

React Doctor exposes four scopes: full project, changed files, introduced findings compared with a base, and findings touching changed lines. Its default local scope is full; the GitHub Action uses introduced-findings behavior for pull requests. See the [CLI scope reference](https://www.react.doctor/docs/reference/cli-reference) and [configuration reference](https://www.react.doctor/docs/configuration/config-files).

The introduced-findings implementation is an evidence-aware multiset comparison, not a line-number diff. Its local identity combines provider/rule, message identity, and normalized diagnosed source evidence, with optional detector-provided identities for findings whose source representation is intentionally normalized. It tries same-file evidence first, uses a conservative same-file fallback only for explicitly marked occurrence-based findings, then permits a stable finding to move between files. Each baseline occurrence can be consumed once, preserving duplicate cardinality. See the [delta implementation and contract](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/core/src/compute-diagnostic-delta.ts#L1-L174).

When a requested base cannot be materialized, the product may degrade to reporting findings in changed files and marks that degradation in machine output. The current CI path exempts that degraded result from the finding gate. This is a user-friendly operational choice, but it is not appropriate for a benchmark verifier that must never treat incomplete comparison as trustworthy.

Effect Doctor already has the stronger benchmark-oriented shape: the caller passes two explicit roots; both are scanned completely; then findings are matched by stable evidence fingerprint with same-file preference and multiset cardinality. See [the comparison entry point](https://github.com/ocarinalabs/effect-doctor/blob/ddfcdf1e403f4c5321b7e1e4c1ed9f42ce7e787d/src/compare.ts#L8-L35) and [the multiset matcher](https://github.com/ocarinalabs/effect-doctor/blob/ddfcdf1e403f4c5321b7e1e4c1ed9f42ce7e787d/src/delta.ts#L5-L59). Effect Doctor should keep this explicit-root, fail-closed behavior for EffectBench.

## Scoring behavior

React Doctor's local scan does not contain the health-score algorithm. It sends a sanitized, compressed diagnostic set and project metadata to a hosted score endpoint, validates the response, and returns no score when the request fails. See the [score client](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/core/src/request-score.ts#L25-L118). The CLI exposes `--no-score`; the [CLI docs](https://www.react.doctor/docs/reference/cli-reference) describe that switch as skipping the score API, sharing, and crash reporting.

Consequences for parity:

- The visible 0–100 score is a product service, not part of the deterministic local analyzer contract.
- Its weighting cannot be reproduced from the open client source.
- It mixes poorly with an offline, version-pinned benchmark verifier.
- Effect Doctor is right to omit scores and network-derived fields from scan reports. EffectBench or Harbor should own benchmark rewards and aggregation over Effect Doctor's structured findings.

## Performance and caching

React Doctor's performance strategy is designed around a very large JavaScript-plugin catalog.

### Work is split by cost and process

The engine materializes source files and builds size-balanced, deterministic batches. It then runs multiple Oxlint subprocesses because a JavaScript plugin executes single-threaded within one process. Concurrency is bounded by CPU and memory, including container limits. See the [batch planner](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/core/src/utils/plan-lint-batches.ts#L21-L106), [subprocess concurrency contract](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/core/src/runners/oxlint/spawn-batches.ts#L45-L147), and [automatic worker selection](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/core/src/utils/resolve-auto-scan-concurrency.ts#L10-L38).

Splittable failures are retried with smaller batches, and resource-exhaustion failures can be replayed serially. This improves completion on heterogeneous repositories, though the product can surface skipped checks or partial failures rather than making every incomplete provider run a hard operational failure.

### Caches are partitioned by dependency knowledge

File-local diagnostics are cached by file path/content plus a ruleset hash that includes analyzer versions, effective configuration, ignore inputs, TypeScript configuration, and inline-disable mode. The cache stores raw diagnostics before presentation filtering and treats corrupt data as a miss. See the [file-cache contract](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/core/src/runners/oxlint/file-lint-cache.ts#L15-L35) and [ruleset hash inputs](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/core/src/runners/oxlint/compute-ruleset-hash.ts#L4-L68).

Cross-file rules use a separate sidecar. A rule with a sound dependency collector can replay only after every recorded content/existence probe still matches. A rule without a complete dependency model runs fresh. The central invariant is that under-approximating a cross-file read set is forbidden, because it could replay a stale clean result. See the [sidecar cache contract](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/core/src/runners/oxlint/sidecar-lint-cache.ts#L15-L55), [dependency-collector invariant](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/oxlint-plugin-react-doctor/src/plugin/cross-file-dependencies.ts#L46-L81), and [bounded/unbounded partition](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/core/src/run-oxlint.ts#L633-L705).

The CLI also has a whole-result cache and maintainability-analysis caches. The official changelog states the intended cache invariant: invalid or mismatched entries fall back to recomputation and cached output remains equivalent to an uncached run. See the [React Doctor changelog](https://www.react.doctor/docs/community/changelog).

### Implication for Effect Doctor

Effect Doctor currently runs fresh TSGo and Oxlint analysis and keeps timing/caches out of the report contract. That is the safe benchmark default. Caching becomes worthwhile only after Effect Doctor can prove all of the following:

1. a cache key covers the exact provider, rule policy, configured project, and every semantic dependency;
2. a corrupt, unknown, or incomplete entry becomes a miss;
3. cached and uncached reports are byte-identical;
4. provider receipts still prove complete coverage; and
5. benchmark runs can explicitly disable or isolate caches.

Until then, optimizing startup, provider concurrency, and bounded process reuse is safer than adding persistent cache state.

## High-level comparison

| Concern | React Doctor at pinned revision | Effect Doctor at pinned revision | Parity decision |
| --- | --- | --- | --- |
| Primary domain | React plus adjacent frontend ecosystems | Effect TypeScript | Keep domain-specific scope |
| Rule truth | One generated product-owned registry, including ports | One generated catalog over TSGo, Effect Oxlint, and first-party rules | Already aligned structurally |
| Type-aware authority | Optional React Compiler diagnostics | Official Effect TSGo | Effect Doctor has the stronger first-party semantic provider |
| AST host | Oxlint JavaScript plugin with shared semantic wrappers | Oxlint upstream plugin plus first-party plugin | Already aligned; preserve provider ownership |
| Whole-tree/project modes | Dedicated security scans and project analyzers | Snapshot planner, integrity pass, no public project-rule family yet | Add only when a complete Effect-specific claim requires it |
| Default policy | Large capability-filtered subset; opt-in families remain cataloged | Narrow upstream defaults plus curated structural and first-party checks | Effect Doctor's narrower default is appropriate |
| Completeness | Can surface partial/skipped checks and operational degradation | Required providers and exact file inventory fail closed | Keep Effect Doctor's behavior |
| Baseline | Git-aware changed scope with evidence multiset matching | Explicit baseline/candidate roots with evidence multiset matching | Effect Doctor is already benchmark-ready |
| Score | Hosted network API | No score in analyzer output | Keep scoring in EffectBench/Harbor |
| Cache | Whole-result, per-file, cross-file sidecar, project summaries | Fresh scans; no report cache | Add only with a formal soundness proof |
| Public lifecycle | Retired rule IDs remain resolvable | Status/selection metadata, no separate retirement lifecycle | Consider adding lifecycle before the first public rule removal |

Effect Doctor's own architecture already states the correct clean-room target: exhaustive rule inventory, framework-aware typed and structural analysis, stable machine output, complete provider/file proof, and a small CLI/package boundary. See [Effect Doctor architecture](https://github.com/ocarinalabs/effect-doctor/blob/ddfcdf1e403f4c5321b7e1e4c1ed9f42ce7e787d/docs/architecture.md#L1-L30).

## Recommendations for Effect Doctor

### Adopt or preserve

1. **Keep one authoritative catalog.** Provider configuration, native aliases, normalization, `rules list`, and `rules explain` already derive from one generated table. Continue making catalog drift a build failure.
2. **Make execution mode explicit.** If Effect Doctor later adds whole-project Layer graphs, configuration-file checks, or package-boundary checks, encode the required context in rule metadata instead of hiding it in runner code.
3. **Separate catalog, activation, and blocking.** A known rule can remain disabled or advisory. Do not equate catalog breadth with default strictness.
4. **Keep provider provenance visible.** Running a first-party rule through Oxlint must not turn it into an upstream Effect Oxlint rule. Effect Doctor already gets this right.
5. **Preserve evidence-aware multiset comparison.** It is the right basis for the requested baseline-versus-candidate evaluations.
6. **Require liveness plus adversarial validity.** React Doctor requires a positive control or a documented exception for every registered implementation. Effect Doctor should keep its stronger rule contract of positive, close-valid, provenance, and corpus calibration. See React Doctor's [registry-wide liveness gate](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/packages/oxlint-plugin-react-doctor/src/plugin/liveness/liveness.test.ts#L145-L204).
7. **Add a rule lifecycle before removals occur.** A distinct active/retired field would let published IDs remain explainable without conflating retirement with “disabled by policy.”
8. **Consider a lightweight metadata-only export if the first-party plugin grows materially.** Do this for startup boundaries, not because React Doctor does it.

### Do not adopt

1. **Do not chase catalog-count parity.** React Doctor's count reflects many ecosystems and opt-in rules; it says nothing about Effect-specific precision.
2. **Do not copy React Doctor rule implementations, messages, fixtures, examples, thresholds, or docs.** Derive Effect rules from official Effect semantics, upstream providers, Effect skills, permissively licensed sources, and real fixes.
3. **Do not put a hosted health score inside Effect Doctor.** Deterministic findings belong in the doctor; benchmark reward belongs in EffectBench/Harbor.
4. **Do not accept incomplete scans as clean.** React Doctor's partial-result UX is reasonable for an interactive product, but a verifier needs Effect Doctor's exit-code-2/fail-closed contract.
5. **Do not cache cross-file or typed results without a complete dependency proof.** A fast stale-clean result is worse than a slower fresh scan.
6. **Do not infer upstream ownership from directories.** Effect Doctor's providers have independent versions and namespaces; explicit catalog fields are more honest.

## License and provenance boundary

React Doctor's repository uses a Modified MIT License. Its official license page states that using the software, source, outputs, or derivative works as AI evaluation data or as input to an automated AI-improvement pipeline requires written permission. See the [pinned license](https://github.com/millionco/react-doctor/blob/afa1780254bfd72175e6d0025841560582d32ad1/LICENSE) and [official license explanation](https://www.react.doctor/docs/legal/license).

For Effect Doctor and EffectBench:

- this document should remain a conceptual architecture review;
- React Doctor must not become an EffectBench verifier, treatment, dependency, oracle, or evaluation-output source without the required permission;
- no React Doctor source-derived rule should be translated into an Effect rule;
- if an attributed React Doctor port points to an original permissively licensed upstream, any relevant idea must be researched independently from that original source and from official Effect evidence;
- Effect Doctor's own implementation, diagnostics, tests, thresholds, and documentation must remain independently specified.

This boundary is both a legal constraint and a scientific one: an independent Effect verifier is more credible evidence about agent-written Effect code than a derivative of another benchmark's verifier.
