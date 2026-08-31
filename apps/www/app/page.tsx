import { knownRules } from "@effect-doctor/core/rules";
import Link from "next/link";

const sourceLabels = {
  "effect-doctor": "Effect Doctor",
  "effect-oxlint": "Effect Oxlint",
  "effect-tsgo": "Effect TSGo",
} as const;

export default function HomePage() {
  const rules = knownRules();
  const sourceCounts = Object.entries(sourceLabels).map(([source, label]) => ({
    count: rules.filter((rule) => rule.source === source).length,
    label,
  }));
  const blockingCount = rules.filter(
    (rule) => rule.status === "blocking"
  ).length;

  return (
    <>
      <section className="shell hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="status-dot" /> Effect v4 release candidate
          </p>
          <h1>Find the Effect Bugs Ordinary Tools Miss</h1>
          <p className="hero-lede">
            Effect Doctor combines type-aware and structural checks in one
            deterministic scan. It reads your code, proves what ran, and leaves
            every file untouched.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/rules">
              Browse {rules.length} Rules
            </Link>
            <a
              className="button button-secondary"
              href="https://github.com/ocarinalabs/effect-doctor"
              rel="noreferrer"
              target="_blank"
            >
              View Source
            </a>
          </div>
        </div>
        <div
          className="command-panel"
          role="region"
          aria-label="Quick start command"
        >
          <div className="panel-bar">
            <span>Terminal</span>
            <span className="panel-state">Local Scan</span>
          </div>
          <pre>
            <code translate="no">
              <span className="prompt">$</span> npx
              @ocarinalabs/effect-doctor@latest .
            </code>
          </pre>
          <div className="receipt-preview">
            <span>✓ project snapshot fixed</span>
            <span>✓ three analyzers complete</span>
            <span>✓ policy receipt attached</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="inventory-heading" className="section shell">
        <div className="section-heading">
          <p className="eyebrow">One inventory</p>
          <h2 id="inventory-heading">Every Rule Has an Owner</h2>
          <p>
            The catalog comes from the same metadata used by the CLI. The site
            does not keep a second copy.
          </p>
        </div>
        <div className="stat-grid">
          {sourceCounts.map(({ count, label }) => (
            <article className="stat-card" key={label}>
              <strong>{count}</strong>
              <span>{label} rules</span>
            </article>
          ))}
          <article className="stat-card stat-card-accent">
            <strong>{blockingCount}</strong>
            <span>blocking rules</span>
          </article>
        </div>
      </section>

      <section
        aria-labelledby="proof-heading"
        className="section section-bordered"
      >
        <div className="shell proof-grid">
          <div className="section-heading">
            <p className="eyebrow">A higher bar</p>
            <h2 id="proof-heading">Trust the Run Before You Trust a Finding</h2>
          </div>
          <div className="proof-list">
            <article>
              <span>01</span>
              <div>
                <h3>One Immutable Snapshot</h3>
                <p>Every analyzer reads the same ordered file inventory.</p>
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <h3>Fail-Closed Analysis</h3>
                <p>
                  A changed file, missing project, or incomplete analyzer stops
                  the scan.
                </p>
              </div>
            </article>
            <article>
              <span>03</span>
              <div>
                <h3>Agent-Ready Evidence</h3>
                <p>
                  Stable IDs, locations, fingerprints, and policy data survive
                  handoff.
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="workflow-heading"
        className="section shell workflow"
      >
        <div className="section-heading">
          <p className="eyebrow">Use it where work happens</p>
          <h2 id="workflow-heading">CLI, Pull Requests, and Coding Agents</h2>
        </div>
        <div className="workflow-grid">
          <article>
            <span className="card-kicker">CLI</span>
            <h3>Scan or Compare</h3>
            <p>
              Get readable output, deterministic JSON, or a compact agent
              handoff.
            </p>
          </article>
          <article>
            <span className="card-kicker">GitHub Action</span>
            <h3>Review Only What Changed</h3>
            <p>
              Report introduced findings with one status, summary, and review
              thread.
            </p>
          </article>
          <article>
            <span className="card-kicker">Plugins</span>
            <h3>Keep First-Party Rules Close</h3>
            <p>
              Use the Effect Doctor rules through Oxlint or an ESLint flat
              config.
            </p>
          </article>
        </div>
      </section>

      <section className="shell final-callout">
        <div>
          <p className="eyebrow">Read the contract</p>
          <h2>See Every Active Rule Before You Run It</h2>
        </div>
        <Link className="button button-primary" href="/rules">
          Open Rule Catalog
        </Link>
      </section>
    </>
  );
}
