# Effect Doctor

Run Effect Doctor on local Effect v4 release-candidate code to catch mistakes that tests, compilers, and general-purpose linters miss. It does not edit source or send telemetry.

## Quick start

Run an audit from the project root. Effect Doctor selects `tsconfig.json` and follows its TypeScript project references:

```sh
npx @ocarinalabs/effect-doctor@latest .
```

Select another root-relative project configuration with `--project`:

```sh
npx @ocarinalabs/effect-doctor@latest . --project packages/server/tsconfig.json
```

Use Node.js 22.18 or newer and install the target project's dependencies before scanning.

For deterministic machine-readable output:

```sh
npx @ocarinalabs/effect-doctor@latest . --format json
```

For a deterministic coding-agent handoff:

```sh
npx @ocarinalabs/effect-doctor@latest . --format agent
```

To compare a baseline checkout with a candidate:

```sh
npx @ocarinalabs/effect-doctor@latest compare ../baseline . --project tsconfig.json --format json
```

To inspect the rule catalogue:

```sh
npx @ocarinalabs/effect-doctor@latest rules list
npx @ocarinalabs/effect-doctor@latest rules explain effect/floating-effect
```

## What it checks

- 94 `Effect TSGo` rules find type-aware mistakes.
- 40 `Effect Oxlint` rules find unsafe local patterns.
- 16 Effect Doctor rules check resource lifetime, cancellation, SQL, Schema, and safe Findings.

All 150 Effect v4 rules run. Effect Doctor returns an empty report only after every analyzer completes against the same immutable source snapshot. Incomplete or inconsistent analysis fails closed.

## CI

Pin the exact version in automation:

```sh
npx --yes @ocarinalabs/effect-doctor@0.1.0 . --format json
```

Code `0` means the scan found no blocking findings. Code `1` means it found at least one. Code `2` means analysis did not complete.

## Node API

```ts
import { Effect } from "effect";
import { scanProject } from "@ocarinalabs/effect-doctor";

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
