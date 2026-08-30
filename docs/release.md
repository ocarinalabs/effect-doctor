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

The npm package must exist before its trusted publisher can be configured. Leave the `NPM_TRUSTED_PUBLISHING_ENABLED` repository variable unset for the bootstrap release.

Create the stable GitHub release from a reviewed commit on `main`. The publish workflow's unprivileged `verify` job produces an `npm-package` artifact and the gated `publish` job skips. Download the artifact, then inspect its metadata and verify the exact archive:

```sh
cd release
shasum -a 256 -c SHA256SUMS
cat release.json
cat verification.json
```

An authorized `@ocarinalabs` maintainer publishes that archive manually with npm two-factor authentication:

```sh
npm publish package.tgz --access public
```

Confirm the public package version and installed CLI immediately afterward. Do not repack from the checkout.

## Trusted publishing

After the bootstrap release, bind the npm package to `ocarinalabs/effect-doctor`, the `publish.yml` workflow, the `npm publish` action, and the `npm` GitHub environment. Before enabling automation:

1. make sure the repository plan and visibility support the required environment protections;
2. create the `npm` environment with a required reviewer, no self-review bypass, and release-tag deployment restrictions;
3. confirm the npm trusted-publisher binding names that exact workflow and environment; and
4. set the repository variable `NPM_TRUSTED_PUBLISHING_ENABLED` to `true` last.

If those environment controls are unavailable, leave the variable unset and keep publishing the verified artifact manually.

The workflow accepts stable releases only. Its first job has no OIDC permission: it validates the exact tag, proves that the tagged commit belongs to `main`, runs the release checks, and uploads one hashed tarball. The environment-gated second job does not check out repository code. It receives `id-token: write`, rechecks the archive hash, and publishes those exact bytes without a long-lived npm token.

For later versions:

1. update the manifest and changelog in a reviewed pull request;
2. rerun `bun run verify:release`;
3. create a stable GitHub release tagged `v<package-version>`; and
4. inspect the uploaded package and verification output before approving the `npm` environment.

The workflow rejects prereleases, a tag that differs from `v${package.json.version}`, and tagged commits outside `main`. Keep provenance disabled while the source repository is private.
