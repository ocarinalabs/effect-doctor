# Contributing to Effect Doctor

## Setup

Install Node.js 22.18 or newer and Bun 1.4.0.

```sh
bun install --frozen-lockfile
bun run setup:effect
bun run check
```

## Changes

Start each behavior change with a small test that fails. Test output and errors that users see. Do not test file layout or private code.

Decode data at system edges. Give stable domain states clear types. Keep public interfaces small.

For a rule change:

- Confirm that `Effect TSGo` or an existing Effect Doctor rule does not already own the diagnostic.
- Cite the Effect contract behind the rule.
- Cover bad input and the nearest valid cases.
- Confirm the rule applies to Effect v4.
- Record possible false positives before raising severity.

The `api` package keeps one folder per pipeline stage. The `src/internal/project` folder reads the project: paths, the file snapshot, the pinned tools, and source views. The `src/internal/analyzers` folder runs Effect TSGo and Oxlint and normalizes their output. The `src/internal/report` folder validates analyzer runs and seals reports. `scan.ts` and `compare.ts` compose those stages.

First-party rules live in `packages/oxlint-plugin-effect-doctor/src/plugin/rules`, one file per rule. The analysis helpers they share live in `packages/oxlint-plugin-effect-doctor/src/plugin/internal`. Update the preset in `packages/oxlint-plugin-effect-doctor/src/rules.ts` and the catalog source in `packages/core/scripts/rule-catalog.mjs`.

Adopted rules live under `packages/oxlint-plugin-effect-doctor/vendor/cevr-effect-oxlint`. They match their upstream release byte for byte, so you can diff a newer upstream tag against them. Do not edit them in place. Replace the whole directory from the new tag and record the tag and commit in `THIRD_PARTY_NOTICES.md`.

Run `bun run catalog:generate` after catalog changes. Review the generated diff instead of editing `packages/core/src/generated/rule-catalog.ts`.

React Doctor and Agent Doctor are architecture references. Do not copy their source, tests, messages, or thresholds.

## Verify

```sh
bun run check
bun run verify:release
```

The pull request must state the changed contract and its proof. List cases left out and the commands run. Use commit subjects in the form `type(scope): description`.
