# Compare projects

## Sub-features

- Introduced, resolved, and unchanged findings.
- Matching across line shifts and file moves.
- Duplicate-finding multiplicity.
- Blocking based only on introduced findings.

## How to get to it (user POV)

Create separate baseline and candidate directories, then run `effect-doctor compare <baseline> <candidate>`.

## Driving it with the packaged CLI

Run `bun run verify:package`. Inspect `actions/compare-clean-invalid/stdout.txt`. The comparison must use `effect-doctor/comparison/v1`, exit with code `1`, and introduce `effect/floating-effect` plus `effect/no-unbounded-retry`.

Reverse the two directories to prove that resolved findings do not block.

## Gotchas

Both directories need a root `tsconfig.json`. A comparison is valid only when both underlying scans contain complete provider receipts.
