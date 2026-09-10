## Contract

Describe the user-visible or analyzer contract this pull request changes.

## Evidence

Give reviewers the source references and package evidence behind the change. Include any failing tests or fixtures.

## Deliberate abstentions

State nearby cases the code does not diagnose or support.

## Verification

Run the checks that apply:

```sh
bun run check
bun run doctor:self
bun run verify:package # When a package boundary changed
git diff --check
```
