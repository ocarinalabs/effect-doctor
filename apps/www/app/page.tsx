const SAMPLE = `## effect/floating-effect [error]
Floating Effect

src/main.ts:4:3
Message: This Effect value is neither yielded nor used in an assignment.
Fingerprint: 840910de989676e6772555da06dfcd783268bad6eb5ad055298b54c637322c36`;

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <h1>Find Effect v4 mistakes the compiler accepts</h1>
        <p className="lede">
          Effect Doctor runs type-aware checks and per-file rules and prints
          findings for coding agents.
        </p>
        <pre className="command">
          <code translate="no">
            <span className="prompt">$ </span>npx dr-effect@latest .
          </code>
        </pre>
        <p className="actions">
          <a
            className="button"
            href="https://github.com/ocarinalabs/effect-doctor"
          >
            GitHub
          </a>
        </p>
      </section>
      <section aria-label="Example finding" className="sample">
        <pre>
          <code translate="no">{SAMPLE}</code>
        </pre>
      </section>
    </>
  );
}
