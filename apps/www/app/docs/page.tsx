import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  description: "Install Effect Doctor, read its findings, and run it in CI.",
  title: "Docs",
};

const ACTION = `permissions:
  contents: read
  issues: write
  pull-requests: write
  statuses: write

steps:
  - uses: actions/checkout@v5
    with: { fetch-depth: 0 }
  - run: npm ci
  - uses: ocarinalabs/effect-doctor@v0.1.0`;

const API = `import { Effect } from "effect";
import { scanProject } from "dr-effect";

const report = await Effect.runPromise(scanProject({ root: "." }));
console.log(report.summary);`;

const Command = ({ children }: { readonly children: string }) => (
  <pre className="command">
    <code translate="no">
      <span className="prompt">$ </span>
      {children}
    </code>
  </pre>
);

export default function DocsPage() {
  return (
    <article className="docs">
      <header className="rules-intro">
        <h1>Docs</h1>
        <p className="lede">
          Effect Doctor finds Effect v4 mistakes that TypeScript and general
          linters accept. It reads local files, edits nothing, and sends
          nothing.
        </p>
      </header>

      <section aria-labelledby="install">
        <h2 id="install">Install</h2>
        <p>Run it at the root of a project that depends on Effect 4.</p>
        <Command>npx dr-effect@latest .</Command>
        <p>
          The project needs its packages installed. Type-aware checks use the
          same packages as the build. Pass <code>--project</code> to select a
          different <code>tsconfig.json</code>; project references are followed.
        </p>
      </section>

      <section aria-labelledby="findings">
        <h2 id="findings">Findings</h2>
        <p>
          Every finding is a required fix. <code>error</code> is a defect that
          shows at runtime. <code>warning</code> is a skipped Effect idiom. The
          run exits <code>1</code> when it finds either, <code>0</code> when it
          finds nothing, and <code>2</code> when analysis did not complete.
        </p>
        <p>
          The rule set is fixed. There is no configuration file, no rule option,
          and no way to turn a rule off. Suppression comments are themselves
          reported. See the <Link href="/rules">rule list</Link>.
        </p>
      </section>

      <section aria-labelledby="agents">
        <h2 id="agents">Coding agents</h2>
        <p>
          The agent format groups findings by rule with file, line, column,
          message, and fingerprint, and ends with the command to rerun.
        </p>
        <Command>npx dr-effect@latest . --format agent</Command>
        <p>Install the skill so an agent runs the scan and acts on it:</p>
        <Command>npx skills add ocarinalabs/effect-doctor</Command>
      </section>

      <section aria-labelledby="compare">
        <h2 id="compare">Compare a change</h2>
        <p>
          Compare a candidate checkout with a baseline. The report lists only
          the findings the change introduced and the findings it resolved, so
          an existing backlog does not block new work.
        </p>
        <Command>npx dr-effect@latest compare ../baseline .</Command>
      </section>

      <section aria-labelledby="ci">
        <h2 id="ci">Pull requests</h2>
        <p>
          The GitHub Action compares each pull request with its base, adds
          review comments and a summary, and fails the job on introduced
          findings.
        </p>
        <pre>
          <code translate="no">{ACTION}</code>
        </pre>
      </section>

      <section aria-labelledby="api">
        <h2 id="api">Node API</h2>
        <pre>
          <code translate="no">{API}</code>
        </pre>
        <p>
          <code>--format json</code> prints the same sealed report the API
          returns.
        </p>
      </section>

      <section aria-labelledby="toolchain">
        <h2 id="toolchain">Toolchain</h2>
        <p>
          Each release pins Effect, Effect TSGo, Oxlint, and TypeScript, so two
          machines that run the same version produce the same report. Each
          analyzer may run for two minutes; raise that with{" "}
          <code>--analyzer-timeout &quot;10 minutes&quot;</code>.
        </p>
      </section>
    </article>
  );
}
