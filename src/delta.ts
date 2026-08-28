import { Option } from "effect";

import type { Finding, FindingDelta } from "./model.js";

type CandidateSlot = {
  readonly finding: Finding;
  matched: boolean;
};

const findMatch = (
  slots: readonly CandidateSlot[],
  baseline: Finding
): Option.Option<CandidateSlot> => {
  const sameFile = Option.fromNullishOr(
    slots.find(
      (slot) =>
        !slot.matched &&
        slot.finding.fingerprint === baseline.fingerprint &&
        slot.finding.location.file === baseline.location.file
    )
  );

  return Option.orElse(sameFile, () =>
    Option.fromNullishOr(
      slots.find(
        (slot) =>
          !slot.matched && slot.finding.fingerprint === baseline.fingerprint
      )
    )
  );
};

export const compareFindings = (
  baseline: readonly Finding[],
  candidate: readonly Finding[]
): FindingDelta => {
  const slots = candidate.map((finding) => ({ finding, matched: false }));
  const resolved: Finding[] = [];
  const unchanged: FindingDelta["unchanged"][number][] = [];

  for (const finding of baseline) {
    const match = findMatch(slots, finding);
    if (Option.isNone(match)) {
      resolved.push(finding);
      continue;
    }

    match.value.matched = true;
    unchanged.push({ baseline: finding, candidate: match.value.finding });
  }

  return {
    introduced: slots
      .filter((slot) => !slot.matched)
      .map((slot) => slot.finding),
    resolved,
    unchanged,
  };
};
