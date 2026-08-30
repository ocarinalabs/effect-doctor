# Final local release verification

Command: `bun run verify:release`

Completed: 2026-08-30T10:11:23Z

The aggregate release predicate completed successfully:

- Bun dependency audit: 256 packages, no vulnerabilities at the configured high-severity threshold
- Ultracite and TypeScript checks: passed
- Vitest: 15 files, 98 tests passed
- Fallow: no dead-code, duplication, or configured complexity findings; maintainability index 93.0
- Effect Doctor self-scan: all three providers completed with zero findings
- Installed tarball consumer: passed package-only installation, declaration typechecking, CLI success and failure paths, comparison, rule inventory, library imports, and no-target-edit checks
- Dry-run package: 111 files, 78.1 kB compressed, 487.1 kB unpacked

The machine-readable package-consumer proof is retained at `.verification/effect-doctor/2026-08-30T10-11-03-579Z-73690/verification.json`. It proves the package subsection: package identity and file count, 155-rule inventory, clean three-provider scan, expected comparison result, public exports, and successful status. It does not independently attest to the dependency audit, repository lint, unit-test, Fallow, or self-scan command output; those are aggregate command results recorded here.
