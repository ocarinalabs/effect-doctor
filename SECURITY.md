# Security policy

## Supported versions

The latest `0.1.x` release receives security fixes. Unreleased commits and older package versions are not supported security boundaries.

## Report a vulnerability

Use **Security → Report a vulnerability** in the GitHub repository when that option is available. Do not open a public issue with exploit details, affected source, credentials, or proprietary target code.

If private vulnerability reporting is unavailable, use [Ocarina Labs' get-in-touch page](https://www.ocarinalabs.ai/) to request a private security channel. In the initial message, identify Effect Doctor and the affected version without including the exploit or sensitive attachments. Share details only after a private channel is confirmed.

Include:

- the affected package version and operating system;
- the command or API surface involved;
- impact and required attacker access;
- a minimal reproduction that contains no third-party secrets; and
- any known workaround.

Ocarina Labs will acknowledge the report, validate the affected boundary, and coordinate a fix and disclosure. Please allow time for downstream analyzer providers to respond when the issue belongs to their package.

## Security-relevant behavior

Effect Doctor runs pinned analyzer executables and JavaScript plugins over a target project's TypeScript files. It does not intentionally make network requests or modify the target. Analyzer subprocesses receive an allowlisted environment and bounded output streams.

The suppression-integrity pass writes same-length masked source copies to a private operating-system temporary directory. Scoped cleanup removes them on normal completion and interruption. A host crash or `SIGKILL` can leave temporary files behind, so run the tool only on machines whose temporary storage is suitable for the scanned source.
