# Use the Node library

## Sub-features

- Scan and compare through Effect values.
- Decode reports with the exported schemas.
- Handle the exported `DoctorFailure` cases by `_tag`.
- Read canonical rule metadata.
- Render reports and apply blocking thresholds.

## How to get to it (user POV)

Import from `@ocarinalabs/effect-doctor`. Do not import `src/*` or internal `dist/*` paths.

## Driving it with Node

Run `bun run verify:package`. Inspect `actions/library-import/stdout.txt`. The package-name import must expose `scanProject`, `compareProjects`, `ScanReportSchema`, `ComparisonReportSchema`, and `knownRules`.

The package must also expose `ProjectFailure`, `AnalyzerFailure`, and `InvalidAnalyzerOutput`, so applications can inspect the typed error channel without importing an internal path.

Run returned Effect values with the Effect runtime used by the consumer.

## Gotchas

`scanProject` and `compareProjects` return Effect values, not Promises. The library uses the analyzer versions bundled with the installed package.
