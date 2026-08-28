import { sha256 } from "./internal/hash.js";
import type { FindingWithoutFingerprint } from "./model.js";

const normalizeEvidence = (evidence: string): string =>
  evidence.replaceAll(/\s+/gu, " ").trim();

const findingIdentity = (finding: FindingWithoutFingerprint): string => {
  const evidence = normalizeEvidence(finding.evidence);
  let locationFallback = evidence;
  if (evidence.length === 0) {
    locationFallback = [
      finding.location.file,
      finding.location.start.line,
      finding.location.start.column,
      finding.location.end.line,
      finding.location.end.column,
    ].join(":");
  }

  return [finding.ruleId, finding.message.trim(), locationFallback].join(
    "\u0000"
  );
};

export const fingerprintFinding = (
  finding: FindingWithoutFingerprint
): string => sha256(findingIdentity(finding));
