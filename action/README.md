# Effect Doctor GitHub Action

Run Effect Doctor on every pull request and publish its Findings in GitHub.

```yaml
name: Effect Doctor

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  issues: write
  pull-requests: write
  statuses: write

jobs:
  effect-doctor:
    runs-on: ubuntu-latest
    steps:
      [
        { uses: actions/checkout@v5, with: { fetch-depth: 0 } },
        { run: npm ci },
        { uses: ocarinalabs/effect-doctor@v1, with: { blocking: error } },
      ]
```

Install the project before the scan. Type-aware checks need the same packages as the TypeScript build.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `directory` | `.` | Effect v4 project directory |
| `project` | `tsconfig.json` | TypeScript project file relative to `directory` |
| `scope` | `changed` | `changed`, `files`, `lines`, or `full` |
| `blocking` | `none` | `none`, `warning`, or `error` |
| `comment` | `true` | Maintain one pull request summary |
| `review-comments` | `true` | Comment on Findings located on changed lines |
| `commit-status` | `true` | Publish an `Effect Doctor` commit status |
| `node-version` | `24` | Node.js version for the Action |
| `version` | `0.1.0` | npm version or package specification to install |

On non-pull-request events, every scope behaves as `full`.

The `changed` scope compares the base with the head and reports new Findings. Both checkouts use the selected `project`. If that project does not exist in the base, the Action reports a full head scan instead. The `files` scope reports all Findings in files that the pull request changes. The `lines` scope reports Findings that start on new or edited lines. The `full` scope reports the full head scan.

The Action writes notes and a job summary before it checks the block level. If GitHub denies write access, the scan still runs and logs a warning.

## Outputs

`completed`, `total-findings`, `resolved-findings`, `error-count`, `warning-count`, `advice-count`, and `affected-files` are available to later workflow steps.

## Baseline dependency model

The baseline is a detached Git worktree. The Action points its `node_modules` path at the packages from the head. This avoids a second run of package scripts and keeps source-only pull requests fast.

The Action uses `full` scope when the pull request changes a manifest, lockfile, workspace file, or any file outside the chosen project. This prevents a mixed scan of base code and head packages.

Effect Doctor does not collect telemetry, and this Action does not send Scan Reports or Comparison Reports outside GitHub.
