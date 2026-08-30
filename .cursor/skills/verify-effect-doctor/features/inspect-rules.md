# Inspect rules

## Sub-features

- List all canonical rules.
- Explain one rule's provider, severity, status, and selection.
- Reject an unknown rule with exit code `2`.

## How to get to it (user POV)

Run `effect-doctor rules list` or `effect-doctor rules explain <rule-id>` after installing the package.

## Driving it with the packaged CLI

Run `bun run verify:package`. Inspect `actions/rules-list/stdout.txt`. The current package must emit 155 tab-separated rows from its checked-in catalog.

Run `effect-doctor rules explain effect-doctor/prefer-config-redacted` to inspect a stable first-party identity.

Inspect `actions/rules-unknown/stderr.txt` to prove that an unknown identity exits with code `2` instead of silently falling back.

## Gotchas

The list output is for terminal and shell use. It is tab-separated, not a versioned JSON report.
