# Rule reference

Read this when the user asks what a finding means, why a rule exists, or asks you to turn a rule off.

## Commands

Print every active rule with its severity, applicability, source, autofix note, and description, one rule per line and tab separated:

```sh
npx --yes dr-effect@0.1.0 rules list
```

Explain one rule by the id printed in a finding:

```sh
npx --yes dr-effect@0.1.0 rules explain effect-doctor/no-unbounded-concurrency
```

The output prints the title, source, native rule id, severity, category, applicability, provider fix, and description. Quote it in your answer instead of paraphrasing from memory. An unknown id exits `2`.

## Fields

| Field | Meaning |
| --- | --- |
| Source | `effect-tsgo` rules come from the Effect TSGo type checker. `effect-doctor` rules run per file; 9 of them come from the `effect-oxlint` project by cevr. |
| Severity | Every finding is a required fix and the run fails on any of them. `error` is a defect that shows at runtime. `warning` is a skipped Effect idiom. Fix both. |
| Category | One of `correctness`, `resource-safety`, `security`, `antipattern`, `effect-native`, or `style`. |
| Applicability | `always` rules apply to every file. `direct-effect-module` rules apply only to files with a parsed, direct `effect` import. |
| Provider fix | Whether the rule's engine has an autofix. Effect Doctor itself does not edit source. |

## Fixes that use an annotation

When you pass a request-scoped dependency through a service on purpose, for example a current user, add the `@effect-expect-leaking <Service>` comment tag to the class. The tag answers `effect/leaking-requirements`, states the intent, and `effect-doctor/diagnostic-suppression` ignores it.

## When the user disagrees with a finding

The rule set does not change between installs, and no option turns a rule off.

Open the location and read the rule's description. Confirm the finding against the code before you take a side.

When the code is correct and the rule misreads it, say so and leave the finding open in your report. Do not add a suppression comment. The `effect-doctor/diagnostic-suppression` rule reports each suppression directive so reviewers see it.

When the user thinks the rule itself is wrong, point them to the rule proposal template at https://github.com/ocarinalabs/effect-doctor/issues.
