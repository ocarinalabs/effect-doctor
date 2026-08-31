# Effect Doctor

Effect Doctor scans an Effect TypeScript project. Each report proves that every check read the same files.

## Terms

| Term | Meaning | Avoid |
| --- | --- | --- |
| Finding | A versioned, source-located note from one analyzer in Effect Doctor's common model | Diagnostic, issue, violation |
| Rule Metadata | A rule's stable name, policy, source, and explanation | Rule configuration, lint rule record |
| Project Snapshot | The fixed file list and content read by every analyzer in one scan | Workspace state, source tree |
| Analyzer Run | Proof that one pinned analyzer read the full Project Snapshot | Engine run, provider receipt |
| Scan Report | The checked Findings and Analyzer Runs for one Project Snapshot | Scan result, lint output |
| Comparison Report | Findings added, fixed, or unchanged between two Scan Reports | Diff report, delta result |
