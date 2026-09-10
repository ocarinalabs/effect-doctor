# Effect Doctor

Effect Doctor finds Effect bugs that TypeScript and general linters miss. It supports only the Effect v4 release candidate.

It reads local files. It does not edit code or send data.

## Use

Install the project's packages first. Run Effect Doctor in the folder that has the root `tsconfig.json`. Use Node.js 22.18 or newer.

```sh
# Scan a project
npx dr-effect@latest .

# Emit deterministic JSON
npx dr-effect@latest . --format json

# Hand every finding to a coding agent
npx dr-effect@latest . --format agent

# Compare a baseline with a candidate
npx dr-effect@latest compare ../baseline . --format json

# Inspect the rule policy
npx dr-effect@latest rules list
npx dr-effect@latest rules explain effect/floating-effect
```

## Checks

Each scan configures 118 active rules:

- 93 `Effect TSGo` rules find type errors and unsafe Effect code.
- 25 Effect Doctor rules find bad local patterns and check cancellation, resource life spans, SQL, Schema, and secret redaction. 9 of them come from the `effect-oxlint` project by cevr and ship inside Effect Doctor under the MIT License.

The policy has two fixed groups. 107 rules can produce Findings in any file. 11 broad rules need a parsed, direct Effect import. Reports include the policy digest, file profiles, and counts for diagnostics that did not apply.

Each analyzer reports the same file list, in the same order. Effect Doctor records the project graph and source hashes before the scan. It checks them again before it returns a report. Run it on a checkout that no other process can edit. The v0.1 guarantee excludes edits that another process both makes and restores before the final check.

The scan stops if the final check finds a changed file or configuration, or if an analyzer fails. Every finding is a required fix. `error` is a defect that shows at runtime. `warning` is a skipped Effect idiom. Fix both.

## GitHub Action

```yaml
permissions:
  contents: read
  issues: write
  pull-requests: write
  statuses: write

steps:
  [
    { uses: actions/checkout@v5, with: { fetch-depth: 0 } },
    { run: npm ci },
    { uses: ocarinalabs/effect-doctor@v0.1.0 },
  ]
```

The Action adds a job summary, review comments, one pull request comment, and a commit status. On a pull request it compares the base with the head and reports new Findings. A dependency change or a change outside the selected project triggers a full scan instead. Other events scan the full project.

## Other integrations

Choose the [`Oxlint` package](packages/oxlint-plugin-effect-doctor) for Oxlint or the [`ESLint` package](packages/eslint-plugin-effect-doctor) for an ESLint flat configuration. Both packages contain the 24 per-file rules. The public [agent skill](skills/effect-doctor) gives coding agents the same scan and comparison workflow. Its references cover the JSON report, the rule catalog, and the sources of Effect v4 guidance. Install it for a skill-aware agent:

```sh
npx skills add ocarinalabs/effect-doctor
```

## CLI in CI

Pin the version in automation:

```sh
npx --yes dr-effect@0.1.0 . --format json
```

Exit code `0` means the scan completed without findings. Code `1` means it found findings. Code `2` means analysis did not complete.

Each analyzer process may run for two minutes by default. Raise the limit for a large project with `--analyzer-timeout "10 minutes"`.

Finding positions count lines from 1 and columns from 1 in UTF-16 code units. Editors and TypeScript use the same units.

## Node API

```ts
import { Effect } from "effect";
import { scanProject } from "dr-effect";

const report = await Effect.runPromise(
  scanProject({
    root: process.cwd(),
  })
);
```

The package root exposes the typed scan and comparison API.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

MIT licensed.
