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

- Confirm that `Effect TSGo` or `oxlint-plugin-effect` does not already own the diagnostic.
- Cite the Effect contract behind the rule.
- Cover bad input and the nearest valid cases.
- Confirm the rule applies to Effect v4.
- Record possible false positives before raising severity.

First-party rules live in `packages/oxlint-plugin-effect-doctor/src/plugin/rules`. Update the preset in `packages/oxlint-plugin-effect-doctor/src/rules.ts` and the catalog source in `packages/core/scripts/rule-catalog.mjs`.

Run `bun run catalog:generate` after catalog changes. Review the generated diff instead of editing `packages/core/src/generated/rule-catalog.ts` directly.

React Doctor and Agent Doctor are architecture references. Do not copy their source, tests, messages, or thresholds.

## Verify

```sh
bun run check
bun run verify:release
```

The pull request must state the changed contract and its proof. List cases left out and the commands run. Use commit subjects in the form `type(scope): description`.
