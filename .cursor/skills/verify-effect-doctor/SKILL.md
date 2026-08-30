---
name: verify-effect-doctor
description: Verify Effect Doctor's packaged CLI and public Node library through a fresh consumer install; use after CLI, report, analyzer, packaging, rule-policy, or public API changes.
---

# Verify Effect Doctor

Drive the package that a user installs. Do not substitute source imports or the repository's `node_modules` for the packed artifact.

## Launch

Install the pinned development dependencies and build the CLI:

```sh
bun install --frozen-lockfile
bun run setup:effect
bun run build
```

Effect Doctor is a short-lived CLI. Each drive creates its own temporary consumer and exits. No server remains running.

## Doctor

Check that the built CLI reports the package version:

```sh
expected="$(node -p 'require("./package.json").version')"
test "$(node dist/bin.js --version)" = "effect-doctor v${expected}"
```

If this check fails, rebuild before running a feature proof.

## Drive

Run the packaged consumer proof:

```sh
bun run verify:package
```

The script packs the current checkout, installs the tarball with lifecycle scripts disabled, and drives these user paths:

- scan a clean Effect project;
- reject an invalid project configuration with the versioned error envelope;
- compare a clean baseline with an invalid candidate;
- list the packaged rule catalog and reject an unknown rule;
- typecheck and import the public Node library by package name; and
- prove that the package declares every runtime dependency it uses.

Read [the feature map](features/README.md) before a narrower verification run.

## Evidence

The command prints an evidence directory under `.verification/effect-doctor/`. Preserve that directory when reporting a result. A valid proof contains `verification.json` with `status` set to `passed`, plus stdout, stderr, command, and exit-status files for every action.

The proof must exercise the installed tarball. It must also show that all three analyzers completed and that the target projects kept the same content digest.

To retain the exact verified archive for a release, pass an empty output directory:

```sh
release_directory="$(mktemp -d)"
node scripts/verify-package.mjs --release-directory "$release_directory"
```

The directory receives `package.tgz`, `SHA256SUMS`, `release.json`, and `verification.json`. Publish `package.tgz` directly; do not repack the checkout.

## Cleanup

The verification script removes only the temporary consumer that it created under the operating system's temporary directory. It keeps the evidence directory. No process teardown is needed.

To remove old evidence, use the operating system's trash after you inspect the exact `.verification/effect-doctor/<run>` path. Never delete the whole repository or a broad temporary directory.

## Helpers

`scripts/verify-package.mjs` owns the isolated install, commands, assertions, evidence, and cleanup. Run it through `bun run verify:package` so the package script remains the single command used by contributors and CI.

Use `/maintain-verification-skill` when the CLI, public exports, or feature map changes.
