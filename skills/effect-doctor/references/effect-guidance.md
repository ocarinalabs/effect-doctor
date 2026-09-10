# Effect v4 guidance sources

Effect Doctor reports what is wrong. It does not teach Effect. When a fix needs an API or a pattern you are unsure about, consult these sources in this order. Name the one you used in your report.

## The installed `effect` package

The `effect` package ships an `AGENTS.md` at its root, so a normal install has it at `node_modules/effect/AGENTS.md`. It covers `Effect.gen` and `Effect.fn`, schemas, services and layers, error handling, resources and scopes, streams, schedules, observability, testing, SQL, and HTTP in about 400 lines. It matches the installed version, so read it before any other source. For an API it does not cover, search the package's `src` directory. The Effect team's own `effect-ts` skill gives agents the same instruction.

## Companion skills

These skills teach how to write Effect v4 code. They complement this one and install with the skills CLI:

| Skill | Install | Covers |
| --- | --- | --- |
| `effect-ts` and `effect-v3-to-v4` from `Effect-TS/skills` | `npx skills add Effect-TS/skills` | Setting up a repository with Effect, and migrating a codebase from v3 to v4 |
| `effect` from `kitlangton/skills` | `npx skills add kitlangton/skills --skill effect` | Production defaults for services, layers, schemas, configuration, schedules, caches, streams, HTTP clients, and tests |

After installing one, read its matching reference file before you edit.

## Effect Solutions

Effect Solutions, at https://www.effect.solutions, is the prescriptive guide to idiomatic Effect programs by Kit Langton. Its CLI prints any topic as plain text, so you can read it without a browser:

```sh
npx --yes effect-solutions list
npx --yes effect-solutions show services-and-layers error-handling
```

Topics: `quick-start`, `project-setup`, `tsconfig`, `basics`, `services-and-layers`, `data-modeling`, `error-handling`, `config`, `testing`, `project-structure`, `incremental-adoption`, `http-clients`, `observability`, `cli`, and `use-pattern`.

## Which source fits which finding

`rules explain <rule-id>` prints the category. Start with the row for it:

| Category | What the rules cover | Read first |
| --- | --- | --- |
| `resource-safety` | Layers, Schema compilation, SQL transactions, caches, streams, concurrency, retries, and abort signals | `AGENTS.md` on resources and scopes, schedules, streams, and SQL; Effect Solutions `services-and-layers` and `http-clients` |
| `correctness` | Type assertions, unsafe Chunk wrapping, callback resume, `runSync`, throwing inside generators, and HTTP responses | `AGENTS.md` on running programs, runtime type guards, and HttpApi servers; Effect Solutions `data-modeling` and `basics` |
| `antipattern` | `Effect.fn`, `catchTag`, `Match`, services, `Do` notation, nested `Effect.gen`, sequential `Effect.all`, global objects, Node.js built-ins, and test hooks | `AGENTS.md` on writing Effect code, services, error handling, and testing; Effect Solutions `basics`, `services-and-layers`, `error-handling`, and `testing` |
| `effect-native` | Span names and structured log data, plus the TSGo rules that prefer an Effect API over a native one | `AGENTS.md` on writing Effect code and observability; Effect Solutions `observability` and `incremental-adoption` |
| `security` | Plain secrets in logs and spans, and secrets read without `Config.redacted` | `AGENTS.md` on observability; Effect Solutions `config` and `observability` |
| `style` | Cognitive complexity and Halstead difficulty limits | The project's own conventions. Fix only on request. |
