# Effect Doctor-assisted coding evaluation

Evaluation date: 2026-08-30

## Question

Does giving a coding agent Effect Doctor after it writes a small Effect v4
module help it make sound improvements, and does the tool stay quiet when the
module is already clean?

This is a small product smoke test, not a benchmark result. It measures one
local checkout, four prompts, two independent agents per prompt, and one
post-writing review. It does not estimate a model population or a pass rate.

## Design

Eight isolated subagents independently implemented one of four tasks:

1. a cancellable credentialed HTTP delivery client;
2. a shared service Layer plus a cancellable legacy-callback adapter;
3. a mutable-array batch pipeline with an immutable Chunk snapshot; and
4. a reusable Schema-backed registration decoder.

Every workspace used `effect@4.0.0-rc.112`, TypeScript 7.0.2, strict checking,
and the same task scaffold. Agents were explicitly prohibited from reading
`node_modules`, Effect source, Effect Doctor source or documentation, other
participants' workspaces, or the internet. They could compile their own code.
All eight initial implementations passed `tsc --noEmit`.

The initial implementation was copied byte-for-byte to a baseline directory.
Within each task pair, arm A then received only the packaged Effect Doctor CLI;
arm B performed an ordinary self-review without Doctor. Treatment agents were
asked to apply a diagnostic only when they judged it sound. The final
measurement used the public comparison seam:

```sh
effect-doctor compare <initial-snapshot> <reviewed-candidate> \
  --format json --blocking never
```

Assignment was fixed by arm name rather than randomized. The agents inherited
the host task's model settings, so this experiment must not be presented as a
model-specific result.

## Result

| Task | Initial findings, treatment | Initial findings, control | Treatment result | Control result |
| --- | ---: | ---: | --- | --- |
| Credentialed HTTP | 0 | 0 | No edit; remained clean | No edit; remained clean |
| Shared services | 4 | 4 | 4 resolved, 0 introduced | 0 resolved, 4 remained |
| Chunk batch | 0 | 0 | No edit; remained clean | Independent refactor; remained clean |
| Schema decoder | 0 | 0 | No edit; remained clean | No edit; remained clean |
| **Total** | **4** | **4** | **4 resolved, 0 introduced** | **0 resolved, 4 remained** |

All eight final candidates still passed strict TypeScript checking.

The four service findings were symmetric before treatment:

- one TSGo warning for putting an untagged global `Error` in the Effect failure
  channel; and
- three `oxlint-plugin-effect` advisory findings for service implementations
  not wrapped with `Database.of`, `UserReader.of`, and `AuditReader.of`.

The Doctor-assisted agent accepted all four. It introduced a tagged
`DatabaseLookupError` which retained the original error as `cause`, updated the
service error channels, and wrapped all three implementations with their
service constructors. The comparison reported those exact four findings as
resolved and none introduced. The matched control agent declared the original
module satisfactory and retained all four findings.

The clean treatment arms are equally relevant: Effect Doctor reported zero
findings and the agents made no speculative changes. The clean Chunk control
made an independent allocation/logging refactor, but its baseline and candidate
both remained Doctor-clean.

## What this establishes

- The packaged three-provider product can give an agent actionable guidance
  after code generation, and its public baseline comparison measures the exact
  delta.
- In the one matched pair with findings, every Doctor-assisted change was
  judged useful by the agent and preserved compilation; ordinary self-review
  did not find the same issues.
- In three clean treatment arms, Doctor did not manufacture cleanup work.

## What this does not establish

None of the six rules added in the accompanying first-party expansion fired in
these eight small modules. That is useful restraint evidence, not positive
evidence that those six rules improve agent output. Their positive evidence is
separate: every rule has invalid and close-valid packaged liveness fixtures,
and the expanded 3,489-file real-project corpus produced six manually reviewed
`consistent-effect-fn-name` findings with no unexplained findings from the
other five new rules. See [`first-party-rules.md`](./first-party-rules.md).

This trial is too small and insufficiently randomized to prove a general causal
effect. A benchmark-quality follow-up should preregister tasks and assignment,
pin model and effort, use multiple repetitions, preserve complete transcripts,
include behavioral tests, and report paired confidence intervals. It should
not redesign prompts after observing whether a rule fired.
