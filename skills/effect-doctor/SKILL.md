---
name: effect-doctor
description: Use when the user asks to run Effect Doctor. Also use it when you review, debug, or finish TypeScript that uses Effect v4. Run the standard scan. Check findings against the pinned Effect source. Run checks again after a fix. Do not use it for code without Effect.
license: MIT
---

# Effect Doctor

Use Effect Doctor output as evidence. Do not copy its rules or guess Effect APIs.

## Run a scan

Read the repository rules first. Read its manifest or lockfile too. Stop if the chosen project does not use Effect v4.

Prefer the Effect Doctor version pinned by the repository. If the repository has no pin, run this full scan from its root:

```sh
npx --yes @ocarinalabs/effect-doctor@0.1.0 . --project tsconfig.json --format agent --blocking never
```

Replace `tsconfig.json` if the root project file has a different name. Effect Doctor follows its project links.

If a baseline checkout exists and the task asks for a comparison, run:

```sh
npx --yes @ocarinalabs/effect-doctor@0.1.0 compare ../baseline . --project tsconfig.json --format agent --blocking never
```

Use `--format json` when another tool reads the report. JSON contains all analyzer versions, the project graph, the applicability receipt, and resolved baseline findings.

## Workflow

1. Install the target project's packages if needed. Pick one TypeScript project file under the root. Do not change its reach to hide findings.
2. Run the right command. Keep rule IDs, source locations, levels, fingerprints, and the scan receipt. The agent format includes analyzer versions, the policy digest, and the entry project. JSON contains the full receipt.
3. Check each useful finding in the named code. For an Effect API claim, read the installed docs, types, or source for the pinned version.
4. If the user asked only for a diagnosis, report the findings and do not edit. If the user asked for fixes, fix the cause. Do not mute rules or weaken the scan.
5. Run the same Effect Doctor command again. Then run the repository's type check and related tests.

Exit code `0` means no finding crossed the chosen block level. The commands above use `--blocking never`, so a full scan exits `0` even when it has findings. Code `1` means a finding crossed another block level. Code `2` means the scan did not finish. Fix that error before you trust the result.

## Report

State the pinned Effect version, chosen TypeScript project, exact commands, fixed or open findings, and check results. If the project is not Effect v4 or a tool does not finish, say so and do not call the audit a pass.
