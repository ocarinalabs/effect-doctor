# Third-party notices

Effect Doctor invokes pinned releases of Effect and Effect TSGo (MIT), Oxlint, `@oxlint/plugins`, and `oxlint-plugin-effect` (MIT), and TypeScript (Apache-2.0). Their findings remain attributed to their native owners in every report. Dependency license texts are distributed with their respective packages.

`vendor/effect-tsgo/metadata-0.38.0.json` is the unmodified diagnostic metadata from the `@effect/tsgo@0.38.0` tag (commit `73b4c54`) in the Effect TSGo repository. It is included under that project's MIT license as the network-free input to the generated rule catalog. `scripts/rule-catalog.mjs` also verifies it against the pinned installed package schema before regeneration succeeds.

No React Doctor or Agent Doctor source code, tests, messages, examples, thresholds, or documentation are included in this repository. Those projects were reviewed only as architectural and behavioral prior art.
