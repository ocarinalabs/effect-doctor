# Effect Doctor feature map

This map describes the user paths that package verification must cover.

| Feature | Entry point | Strongest proof |
| --- | --- | --- |
| [Scan a project](scan-project.md) | `effect-doctor <directory>` | A versioned report from all three complete analyzers |
| [Compare projects](compare-projects.md) | `effect-doctor compare <baseline> <candidate>` | Only introduced findings affect the blocking exit code |
| [Inspect rules](inspect-rules.md) | `effect-doctor rules` | The packed catalog lists and explains stable rule identities |
| [Use the Node library](use-node-library.md) | `@ocarinalabs/effect-doctor` | A package-name import exposes the documented public API |
