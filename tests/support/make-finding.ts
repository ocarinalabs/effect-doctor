import { fingerprintFinding } from "../../src/fingerprint.js";
import type { Finding } from "../../src/model.js";

type FindingOverrides = {
  readonly evidence?: string;
  readonly file?: string;
  readonly line?: number;
};

export const makeFinding = (overrides: FindingOverrides = {}): Finding => {
  const evidence = overrides.evidence ?? "Effect.runPromise(job)";
  const file = overrides.file ?? "src/main.ts";
  const line = overrides.line ?? 1;
  const finding = {
    category: "correctness",
    evidence,
    location: {
      end: { column: 10, line },
      file,
      start: { column: 1, line },
    },
    message: "An Effect value is unused.",
    provenance: {
      engine: "effect-tsgo",
      nativeRuleId: "floatingEffect",
    },
    ruleId: "effect/floating-effect",
    severity: "error",
    title: "Floating Effect",
  } satisfies Omit<Finding, "fingerprint">;

  return { ...finding, fingerprint: fingerprintFinding(finding) };
};
