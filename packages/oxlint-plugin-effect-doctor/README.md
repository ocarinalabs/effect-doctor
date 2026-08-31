# oxlint-plugin-effect-doctor

[`Oxlint`](https://oxc.rs/docs/guide/usage/linter/js-plugins.html) plugin for [Effect Doctor](https://github.com/ocarinalabs/effect-doctor). It diagnoses Effect TypeScript code for correctness, cancellation, resource-safety, security, Schema, SQL, HTTP, and logging problems.

This package contains Effect Doctor's per-file rules. The full CLI adds `Effect TSGo`, `oxlint-plugin-effect`, complete-file verification, suppression checks, stable reports, and baseline comparison.

## Install

```sh
npm install --save-dev oxlint oxlint-plugin-effect-doctor
```

```sh
pnpm add --save-dev oxlint oxlint-plugin-effect-doctor
```

```sh
bun add --dev oxlint oxlint-plugin-effect-doctor
```

## Usage

In `.oxlintrc.json`:

```json
{
  "jsPlugins": [
    {
      "name": "effect-doctor",
      "specifier": "oxlint-plugin-effect-doctor"
    }
  ],
  "rules": {
    "effect-doctor/no-throw-in-effect-generator": "warn",
    "effect-doctor/prefer-config-redacted": "warn"
  }
}
```

Run `Oxlint` normally:

```sh
npx oxlint .
```

For a TypeScript configuration, the package exports the complete recommended rule map:

```ts
import { defineConfig } from "oxlint";
import { RECOMMENDED_RULES } from "oxlint-plugin-effect-doctor";

export default defineConfig({
  jsPlugins: [
    {
      name: "effect-doctor",
      specifier: "oxlint-plugin-effect-doctor",
    },
  ],
  rules: RECOMMENDED_RULES,
});
```

## Available rules

The recommended preset enables every `effect-doctor/*` rule as a warning.

| Rule | What it catches |
| --- | --- |
| `consistent-effect-fn-name` | Unqualified `Effect.fn` span names that disagree with their assigned function |
| `no-duplicate-layer-factory-call` | The rule reports composition graphs that call the same zero-argument Layer factory more than once |
| `no-inline-schema-compile` | Closed Schema parsers compiled repeatedly inside functions |
| `no-long-lived-layer-acquisition` | Provably long-lived work blocking Layer acquisition |
| `no-manual-sql-transaction` | Transaction-control statements sent manually through Effect SQL |
| `no-multiple-callback-resume` | `Effect.callback` continuations resumed more than once on a straight-line path |
| `no-mutation-after-unsafe-chunk-wrap` | Arrays mutated after `Chunk.fromArrayUnsafe` shares their storage |
| `no-network-in-sql-transaction` | Direct network work held inside an Effect SQL transaction |
| `no-run-sync-on-suspending-effect` | Synchronous runners used with effects proven to suspend |
| `no-throw-in-effect-generator` | Exceptions escaping confirmed Effect generator bodies |
| `no-unredacted-value-in-diagnostic` | Calls that pass `Redacted.value` to diagnostics or telemetry |
| `prefer-abort-signal-passthrough` | Cancellable fetch adapters that discard Effect's `AbortSignal` |
| `prefer-config-redacted` | Secret configuration constructed without redaction |
| `prefer-http-json-response` | JSON serialized manually into an HTTP text response |
| `prefer-structured-log-data` | Structured log values serialized before reaching Effect logging |

## Plugin or CLI?

Standalone `Oxlint` runs these per-file rules. Use the full CLI for type-aware `Effect TSGo` findings, official Effect `Oxlint` rules, full-file verification, suppression checks, deterministic JSON, or baseline comparison:

```sh
npx @ocarinalabs/effect-doctor@latest .
```

## License

MIT
