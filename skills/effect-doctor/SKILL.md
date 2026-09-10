---
name: effect-doctor
description: Run Effect Doctor, the static analyzer for Effect v4 TypeScript, and act on its findings. Use when the user asks to run, scan, audit, lint, or check Effect code with Effect Doctor, asks what an Effect Doctor rule or finding means, wants a pull request or branch compared against a baseline for new Effect problems, or is reviewing, debugging, or finishing TypeScript that imports from "effect" at version 4, even if they do not name the tool. Do not use for Effect v3 projects, for code that does not use Effect, or for general TypeScript linting without Effect.
license: MIT
compatibility: Requires Node.js 22.18 or newer, npx, and a project with installed packages. The first run downloads the pinned CLI, so it needs network access once.
metadata:
  author: ocarinalabs
  version: "0.4.0"
---

# Effect Doctor

Effect Doctor scans an Effect v4 TypeScript project with the Effect TSGo type checker and 25 per-file rules. At the end it confirms that the scan read every file the project file selects. Treat its output as evidence about the code. Do not guess Effect APIs or restate its rules from memory.

## Before you run

1. Confirm the project uses Effect v4. Read the manifest or lockfile. The `effect` version must start with `4.`. If it does not, stop and tell the user this skill covers Effect v4 only.
2. Install the project's packages if `node_modules` is missing. The type-aware checks need the same packages as the build.
3. Pick one TypeScript project file. Default to `tsconfig.json` at the repository root. Effect Doctor follows its project references, so do not narrow the file list to hide findings.
4. Use the Effect Doctor version the repository pins, if it pins one. Otherwise, use the commands below.

## Pick the run

Run each command from the repository root.

### After a change to Effect code

Compare the change with a baseline checkout. The report lists only the findings the change introduced and the findings it resolved:

```sh
npx --yes dr-effect@0.1.0 compare ../baseline . --project tsconfig.json --format agent
```

When no baseline exists, create one with `git worktree add ../baseline main`, install its packages, and remove the worktree after the comparison.

### For a full audit

```sh
npx --yes dr-effect@0.1.0 . --project tsconfig.json --format agent
```

The agent format groups every finding by rule with file, line, column, message, and fingerprint, and it ends with a rerun command. Read the whole output.

### When a tool reads the output

Add `--format json` for the full receipt. Read [references/report.md](references/report.md) for the JSON layout and the exit codes before you parse it.

### When the user asks about a rule

Read [references/rules.md](references/rules.md). It covers `rules list`, `rules explain`, and how to answer a user who disagrees with a finding.

### When a fix needs Effect knowledge

Read [references/effect-guidance.md](references/effect-guidance.md). It lists the sources for Effect v4 guidance that match the installed version, starting with the `AGENTS.md` inside the `effect` package.

## Act on findings

Work through this list in order and keep the output of every scan:

1. Run the scan. Note each finding's rule id and location, with its severity and fingerprint.
2. Open each named location and confirm the finding against the code. For a claim about an Effect API, read the installed `effect` package's types or its `AGENTS.md`.
3. If the user asked only for a diagnosis, report and stop. Do not edit code.
4. If the user asked for fixes, fix the cause at the named location. Do not add suppression comments, disable rules, or change the project file to shrink the scan.
5. When two findings share a location, read both before you edit. One fix often clears the other.
6. Run the same command again. Continue only when the second scan no longer lists the fixed findings and lists no new ones.
7. Run the repository's type check and the tests near the change.

Every finding is a required fix. `error` is a defect that shows at runtime. `warning` is a skipped Effect idiom. Fix both; the run fails on either.

## Gotchas

- Exit `1` means the scan completed and found something to fix. Exit `0` means the scan completed with no findings.
- Exit `2` means the scan did not complete, for example when the project file is missing or a source is not valid UTF-8. Fix that cause before you trust any result. Do not report a pass from an incomplete scan.
- Each analyzer process may run for two minutes. On a large repository add `--analyzer-timeout "10 minutes"` instead of splitting the project.
- Effect Doctor does not report plain TypeScript errors. An unresolved import turns a value into `any` and hides the Effect findings on it, so run the project's type check as well.
- Columns count UTF-16 code units, the same units editors use, so a location opens at the right character.
- The scan fails closed if a file changes while it runs. Do not edit or format files during a scan.
- Each install runs the same fixed rule set, so do not look for rule options or a configuration file.

## Command reference

| Argument | Purpose |
| --- | --- |
| `.` | Scan the current directory |
| `--project <path>` | Root-relative TypeScript project file, default `tsconfig.json` |
| `--format agent` | Findings grouped by rule, with locations and a rerun command |
| `--format json` | The full sealed report, for tools |
| `--analyzer-timeout "10 minutes"` | Longest time one analyzer process may run |
| `compare <baseline> <candidate>` | Report only introduced and resolved findings |
| `rules list` | Print every active rule with its policy |
| `rules explain <rule-id>` | Print one rule with its policy fields and description |

## Report

State the pinned Effect version, the project file, and the exact commands. List each finding you fixed or left open with its rule id and location. Give the results of the second scan and the type check. If the project is not Effect v4, or the scan did not complete, say so and do not call the audit a pass.
