# Release process

Effect Doctor publishes as `@ocarinalabs/effect-doctor`. Releases are immutable and exact provider versions are part of the product contract.

## Release gates

Before publishing:

1. Decide whether the GitHub repository will be public. Trusted npm publishing works from a private repository, but npm provenance is unavailable and public consumers cannot audit private source or use its issue tracker.
2. Confirm `package.json`, `CHANGELOG.md`, and the Git tag use the same version.
3. Run the full release predicate from a clean checkout on Node.js 24 and Bun 1.4.0:

   ```sh
   bun install --frozen-lockfile
   bun run setup:effect
   bun run verify:release
   ```

4. Inspect the `npm pack --dry-run` file list and the evidence emitted by `bun run verify:package`.

Do not publish when any analyzer is incomplete, the package verifier uses workspace dependencies instead of a fresh consumer install, or the source repository's visibility disagrees with the release policy.

## First publish

The npm package must exist before its trusted publisher can be configured. An authorized `@ocarinalabs` maintainer therefore bootstraps `0.1.0` manually with npm two-factor authentication:

```sh
npm publish --access public
```

Publish only the tarball already inspected by the release predicate. Confirm the public package version and installed CLI immediately afterward.

## Trusted publishing

After the bootstrap release, bind the npm package to `ocarinalabs/effect-doctor`, the `publish.yml` workflow, and the protected `npm` GitHub environment. The workflow uses a GitHub-hosted runner, Node.js 24, npm 11.5.1 or newer, `contents: read`, and `id-token: write`; it does not use a long-lived npm token.

For later versions:

1. update the manifest and changelog in a reviewed pull request;
2. rerun `bun run verify:release`;
3. create a GitHub release tagged `v<package-version>`; and
4. approve the protected npm environment after reviewing the workflow's verification output.

The workflow rejects a tag that does not equal `v${package.json.version}`. Keep provenance disabled while the source repository is private.
