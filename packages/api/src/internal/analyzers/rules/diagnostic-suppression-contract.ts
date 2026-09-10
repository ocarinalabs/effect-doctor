export const INTEGRITY_VISIT_MESSAGE =
  "Effect Doctor suppression integrity file visit.";

export const DIRECT_EFFECT_REFERENCE_VISIT_MESSAGE =
  "Effect Doctor suppression integrity file visit with direct Effect module reference.";

export const isIntegrityVisitMessage = (message: string): boolean =>
  message === INTEGRITY_VISIT_MESSAGE ||
  message === DIRECT_EFFECT_REFERENCE_VISIT_MESSAGE;
