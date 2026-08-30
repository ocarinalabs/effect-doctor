## Contract

Describe the user-visible or analyzer contract this pull request changes.

## Evidence

List source references, failing tests, fixtures, or package evidence that justify the change.

## Deliberate abstentions

State nearby cases the implementation intentionally does not diagnose or support.

## Verification

- [ ] `bun run check`
- [ ] `bun run audit`
- [ ] `bun run doctor:self`
- [ ] `bun run verify:package` when a packaged boundary changed
- [ ] `git diff --check`
