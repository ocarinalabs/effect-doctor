# Effect Doctor

Effect Doctor finds Effect bugs that TypeScript and general linters miss. It supports only the Effect v4 release candidate.

It reads local files. It does not edit code or send data.

## Use

Install the project's packages first. Run Effect Doctor in the folder that has the root `tsconfig.json`. Use Node.js 22.18 or newer.

```sh
# Scan a project
npx @ocarinalabs/effect-doctor@latest .

# Emit deterministic JSON
npx @ocarinalabs/effect-doctor@latest . --format json

# Hand every finding to a coding agent
npx @ocarinalabs/effect-doctor@latest . --format agent

# Compare a baseline with a candidate
npx @ocarinalabs/effect-doctor@latest compare ../baseline . --format json

# Inspect the rule policy
npx @ocarinalabs/effect-doctor@latest rules list
npx @ocarinalabs/effect-doctor@latest rules explain effect/floating-effect
```

## Checks

Each scan runs 150 active rules. Rules do not silently switch off:

- 94 `Effect TSGo` rules find type errors and unsafe Effect code.
- 40 `Effect Oxlint` rules find bad local patterns.
- 16 Effect Doctor rules check cancellation, resource life spans, SQL, Schema, and safe Findings.

All analyzers read the same files. The scan stops if a file changes or an analyzer fails. Errors can block a run. Advice stays visible but does not block the default CI job.

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
    { uses: ocarinalabs/effect-doctor@v1 },
  ]
```

The Action adds a job summary, notes on code, one pull request comment, and a commit status. Pull requests show only new Findings. Other runs scan the full project.

## Other integrations

Choose the [`Oxlint` package](packages/oxlint-plugin-effect-doctor) for Oxlint or the [`ESLint` package](packages/eslint-plugin-effect-doctor) for an ESLint flat configuration. Both packages contain the 15 first-party rules.

## CLI in CI

Pin the version in automation:

```sh
npx --yes @ocarinalabs/effect-doctor@0.1.0 . --format json
```

Exit code `0` means the scan completed without blocking findings. Code `1` means it found blocking findings. Code `2` means analysis did not complete.

Use `--blocking error`, `--blocking warning`, or `--blocking never` to set the threshold.

## Node API

```ts
import { Effect } from "effect";
import { scanProject } from "@ocarinalabs/effect-doctor";

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
