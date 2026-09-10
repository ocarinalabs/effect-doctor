# Security policy

## Supported versions

The latest release of each package gets security fixes. The packages are `dr-effect`, `oxlint-plugin-effect-doctor`, and `eslint-plugin-effect-doctor`.

## Report a problem

Use a [private GitHub advisory](https://github.com/ocarinalabs/effect-doctor/security/advisories/new). Do not open a public issue.

Tell us the package, the version, the command, and a small project that shows the bug. We reply within seven days.

## Scope

Effect Doctor reads local files. It runs the pinned Effect TSGo and Oxlint tools. It does not edit source, send data, or use the network. The suppression check writes masked copies of the sources to a temporary folder and removes them when the scan ends. A run that does more than this is a bug we want to hear about.
