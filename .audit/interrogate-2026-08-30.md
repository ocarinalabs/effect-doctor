# Interrogate release review

Date: 2026-08-30

Four independent reviewers received the same release-readiness intent and rubric. They were asked to inspect correctness, packaging, provider boundaries, workflow security, cross-platform behavior, and public API compatibility. The configurations were:

- `gpt-5.6-sol` at `max`
- `gpt-5.6-terra` at `ultra`
- `gpt-5.6-luna` at `max`
- `gpt-5.5` at `xhigh`

Only those four reports informed the release review. One reviewer recursively delegated beyond the requested review set; that fan-out was interrupted and its child reports were excluded.

## Acted on

Every reproducible P1 or P2 finding was fixed and covered by a focused commit or verification assertion:

| Finding cluster | Disposition | Evidence |
| --- | --- | --- |
| A publish job could gain OIDC before verification, repack after verification, or accept an unsuitable release tag | Split verification from publishing, transfer one hashed tarball, require a stable exact version tag on `main`, serialize releases, and keep automated publishing behind an absent repository variable | `6e380d8`; `.github/workflows/publish.yml`; `tests/release.test.ts` |
| Report schemas accepted plausible but non-canonical paths, inventories, fingerprints, ordering, and comparison deltas | Recompute and enforce all canonical report invariants at decode boundaries | `907bee4`; `tests/model.test.ts` |
| Provider adapters could accept invalid Unicode columns or drifted Oxlint activation, severity, and pass ownership | Validate byte columns against source and fail closed on provider-policy drift | `ff3d7e7`; `tests/provider-completeness.test.ts` |
| Analyzer subprocesses inherited excessive environment data and conflated exit, timeout, output-limit, process, and toolchain failures | Allowlist the child environment, bound both streams, and preserve distinct failure reasons | `ff3d7e7`; `src/internal/process.ts`; `tests/process.test.ts` |
| POSIX-only paths and npm shim invocation could break Windows verification | Use platform path primitives, drive npm through its CLI on Windows, and assert the installed `.cmd` shim exists | `ff3d7e7`, `6e380d8`; `tests/package.test.ts`; `scripts/verify-package.mjs` |
| An inferred public declaration referenced a source-only module | Give `compareProjects` an explicit public return type and typecheck declarations from a fresh installed consumer | `6e380d8`; `src/compare.ts`; `scripts/verify-package.mjs` |
| Package verification injected Effect separately and omitted documented failure paths | Install only the packed package and drive invalid configuration and unknown-rule exit-2 contracts | `6e380d8`; `scripts/verify-package.mjs` |

## Noted release gates

- Windows verification executes the installed JavaScript entrypoint with Node after asserting that npm generated the `.cmd` shim. Direct shell execution of that shim is not part of the portable verifier.
- The repository remains private, the protected `npm` environment does not exist, the trusted-publishing repository variable is absent, and the npm package has not been published. Those are intentional first-release gates, not code defects.

## Dismissed

No reproducible P1 or P2 finding was dismissed.
