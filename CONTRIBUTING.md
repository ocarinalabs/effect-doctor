# Contributing to Effect Doctor

Effect Doctor treats a clean report as a claim about complete analysis. Changes must preserve that claim before they improve rule count, speed, or ergonomics.

## Set up the repository

Install Node.js 22.18 or newer and Bun 1.4.0, then run:

```sh
bun install --frozen-lockfile
bun run setup:effect
bun run check
```

The package is ESM-only. Dependencies that affect analyzer behavior are exact-pinned in `package.json` and `bun.lock`.

## Make a change

Work test-first for behavior changes. Add the smallest failing test or fixture, confirm the failure, implement the change, then refactor while the full suite stays green.

Keep public modules narrow. Decode untrusted provider and CLI data at its boundary, model stable domain states explicitly, and avoid assertions that make TypeScript accept an unproven state.

### Add or change a rule

A rule proposal must identify one diagnostic owner: Effect TSGo, `oxlint-plugin-effect`, or Effect Doctor. Do not duplicate an upstream rule under a new identity.

First-party rules require:

- a source-backed Effect contract;
- import and binding provenance;
- invalid, close-valid, aliased, shadowed, and nested-boundary fixtures where relevant;
- a deterministic message and source span;
- an explicit Effect v3/v4 support declaration; and
- corpus evidence before blocking severity.

Update the rule catalog source in `scripts/rule-catalog.mjs`, run `bun run catalog:generate`, and review the generated diff. Never edit `src/generated/rule-catalog.ts` by hand.

### Preserve implementation independence

React Doctor and Agent Doctor are product and architecture references only. Do not copy their source, tests, messages, thresholds, or rule implementations. Record third-party provenance when a documented contract motivates a new rule.

## Verify the change

Run the full local gate:

```sh
bun run check
bun run audit
bun run doctor:self
bun run verify:package
git diff --check
```

The package verifier must drive the installed tarball, not source imports. Preserve the printed `.verification/effect-doctor/<run>` evidence path in the pull-request notes for release-sensitive changes.

Use conventional commit subjects in the form `type(scope): description`. Keep generated or mechanical changes separate from behavior when that makes either diff easier to review.

## Pull requests

Describe the contract being changed, the evidence behind it, deliberate abstentions, and the commands you ran. A new diagnostic should explain likely false-positive boundaries, not only examples it catches.
