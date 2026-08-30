# Scan a project

## Sub-features

- Pretty and JSON output.
- Blocking thresholds with exit codes `0` and `1`.
- Fail-closed operational errors with exit code `2`.
- Complete receipts from Effect TSGo, Effect Oxlint, and Effect Doctor.
- Stable, project-relative findings without target edits.

## How to get to it (user POV)

Install the package, then run `effect-doctor .` from an Effect TypeScript project with a root `tsconfig.json`.

## Driving it with the packaged CLI

Run `bun run verify:package`. Inspect `actions/scan-clean/stdout.txt` in the printed evidence directory. The report must use `effect-doctor/scan/v1`, contain no findings for the clean fixture, and mark all three analyzers complete.

For an operational failure, inspect `actions/scan-invalid-config/stdout.txt`. It must record exit code `2`, the `effect-doctor/error/v1` envelope, and a `ProjectFailure` tag.

## Gotchas

Exit code `1` means analysis succeeded and found a blocking issue. Exit code `2` means analysis did not complete. Never collapse those states into one failure.
