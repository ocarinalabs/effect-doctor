# Effect Doctor

Effect Doctor finds Effect bugs that TypeScript and general linters miss. It supports only the Effect v4 release candidate. It reads local files and does not edit source or send telemetry. The suppression check writes masked copies of the sources to a temporary directory and removes them when the scan ends.

## Quick start

Run an audit from the project root. Effect Doctor selects `tsconfig.json` and follows its TypeScript project references:

```sh
npx dr-effect@latest .
```

Select another root-relative project configuration with `--project`:

```sh
npx dr-effect@latest . --project packages/server/tsconfig.json
```

Use Node.js 22.18 or newer and install the target project's dependencies before scanning.

For deterministic machine-readable output:

```sh
npx dr-effect@latest . --format json
```

For a deterministic coding-agent handoff:

```sh
npx dr-effect@latest . --format agent
```

To compare a baseline checkout with a candidate:

```sh
npx dr-effect@latest compare ../baseline . --project tsconfig.json --format json
```

To inspect the rule catalog:

```sh
npx dr-effect@latest rules list
npx dr-effect@latest rules explain effect/floating-effect
```

## What it checks

- 93 `Effect TSGo` rules find type-aware mistakes.
- 25 Effect Doctor rules find unsafe local patterns and check resource lifetime, cancellation, SQL, Schema, and secret redaction. 9 of them come from the `effect-oxlint` project by cevr and ship inside Effect Doctor under the MIT License.

Each scan configures 118 rules. Every finding is a required fix. `error` is a defect that shows at runtime. `warning` is a skipped Effect idiom. Fix both. The policy lets 107 rules produce Findings in any file. 11 broad rules need a parsed, direct Effect import. Reports include the policy digest, file profiles, and counts for diagnostics that did not apply.

Effect Doctor records the project graph, source list, and source hashes before analysis. It returns a report only when each analyzer reports the same file list and the final check matches the recorded contents. Run it on a checkout that no other process can edit. The v0.1 guarantee excludes edits that another process both makes and restores before the final check. Incomplete or inconsistent analysis fails closed.

## CI

Pin the exact version in automation:

```sh
npx --yes dr-effect@0.1.0 . --format json
```

Code `0` means the scan found no findings. Code `1` means it found at least one. Code `2` means analysis did not complete.

Each analyzer process may run for two minutes by default. Raise the limit for a large project:

```sh
npx --yes dr-effect@0.1.0 . --format json --analyzer-timeout "10 minutes"
```

Finding positions count lines from 1 and columns from 1 in UTF-16 code units. Editors and TypeScript use the same units.

## Node API

```ts
import { Effect } from "effect";
import { scanProject } from "dr-effect";

const report = await Effect.runPromise(
  scanProject({
    project: "packages/server/tsconfig.json",
    root: process.cwd(),
  })
);
```

The package root exposes the typed scan and comparison API.

## Contributing

[Issues](https://github.com/ocarinalabs/effect-doctor/issues) and pull requests are welcome. See the repository's [contributing guide](https://github.com/ocarinalabs/effect-doctor/blob/main/CONTRIBUTING.md).

MIT licensed.
