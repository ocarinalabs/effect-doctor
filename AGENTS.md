# Effect Doctor contributor instructions

Effect Doctor is a deterministic, black-box quality analyzer for Effect TypeScript. It is separate from EffectBench and must not import EffectBench internals.

## Learning more about Effect

This repository uses the Effect TypeScript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md` completely and follow the linked guide for the subsystem being changed. If a particular Effect API or concept is not covered there, search its implementation and documentation in `node_modules/effect/src`.

## Product boundaries

- Keep the public interface small: CLI, `scan`, `compare`, versioned report schemas, and rule metadata.
- Keep analyzer invocation, tool flags, temporary files, provider rule names, and subprocess handling internal.
- Treat quality findings as successful analysis output. Operational failures must fail closed; an incomplete scan is never clean.
- Reports must be deterministic: project-relative POSIX paths, stable ordering, no timestamps, hostnames, durations, or temporary paths.
- EffectBench will consume the packaged CLI as a pinned process-level black box. Effect Doctor must not know benchmark tasks, models, treatments, trials, or rewards.

## Analyzer ownership

- `@effect/tsgo` owns semantic and type-aware Effect diagnostics.
- Oxlint and `oxlint-plugin-effect` own syntax and local structural diagnostics.
- First-party rules require a written contract, valid and invalid adversarial fixtures, provenance, and corpus calibration before they can block.
- Do not duplicate an upstream rule merely to rename it. Preserve provider provenance while mapping it to a stable public rule identity.

## Clean-room rule research

React Doctor and Agent Doctor are prior art only. Do not copy their source, test cases, messages, examples, thresholds, or documentation. Derive behavior from official Effect source, Effect skills, Effect documentation, Effect Solutions, permissively licensed lint ecosystems, and real merged fixes.

React Doctor's current license restricts AI-evaluation use. Agent Doctor's audited repository did not contain a top-level license file. This repository must remain independently implemented.

## Testing

- Use test-driven development for behavior changes.
- Baseline comparison is a multiset comparison based on rule, message identity, and normalized source evidence—not line number or `(rule, file)` counts.
- Every engine needs a liveness fixture and explicit completeness assertions.
- Every rule needs close valid examples designed to catch false positives.
