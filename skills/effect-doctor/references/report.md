# Effect Doctor report reference

Read this when a tool consumes Effect Doctor's JSON, or when you need a field the agent format does not print.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | The scan completed with no findings. |
| `1` | The scan completed with at least one finding. For `compare`, at least one introduced finding. |
| `2` | The scan did not complete. In that case the JSON output has `status: "failed"` and an `error` object instead of a report. |

## Scan Report

`--format json` prints one object with `schema: "effect-doctor/scan/v1"`.

| Field | Meaning |
| --- | --- |
| `findings` | Every finding, in file, line, column order. Each has `ruleId`, `severity` (`error` or `warning`), `message`, `evidence`, `fingerprint`, `location`, and `provenance`. |
| `location` | `file` is a project-relative POSIX path. `start` and `end` carry `line` and `column`, both starting at 1. Columns are UTF-16 code units. |
| `fingerprint` | A stable hash of the rule, the message, and the evidence text. It survives line moves, so use it to track a finding across commits. It identifies content, not a location, so two identical snippets share one fingerprint. |
| `summary` | Counts of `errors` and `warnings`. |
| `engines` | One Analyzer Run per analyzer, each with `analyzedFiles`. Every run lists the same files. |
| `policy` | The fixed rule policy: `id`, `revision`, `activeRuleCount`, and `digest`. Two scans compare only when their policies match. |
| `applicability` | Per-file Effect references and counts of diagnostics that did not apply because a file has no direct Effect import. |
| `target` | The entry project file and every referenced project file. |
| `toolchain` | The pinned versions of Effect, Effect TSGo, Oxlint, and TypeScript. |

## Comparison Report

`compare` prints an object with `schema: "effect-doctor/comparison/v1"`. It embeds the `baseline` and `candidate` Scan Reports and adds `introduced`, `resolved`, and `unchangedCount`. Findings match across the two scans by fingerprint, so a finding that moved lines counts as unchanged.

## Error object

When the exit code is `2`, the JSON has `status: "failed"` and `error` with a `tag`:

- `ProjectFailure` with a `code` such as `project-not-found`, `project-invalid`, `outside-root`, `project-changed`, `effect-unsupported` for a project that does not depend on Effect v4, or `source-invalid` for a file that is not valid UTF-8.
- `AnalyzerFailure` with an `engine`, an `exitCode`, and a `reason` such as `timeout` or `exit`.
- `InvalidAnalyzerOutput` with an `engine` when an analyzer returned output that broke its contract.

The JSON omits absolute paths and analyzer stderr. Rerun without `--format json` to see the analyzer output in the error message.
