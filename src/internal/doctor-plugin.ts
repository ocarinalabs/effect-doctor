import { eslintCompatPlugin } from "@oxlint/plugins";
import type { Rule } from "@oxlint/plugins";

import { diagnosticSuppressionIntegrity } from "./rules/diagnostic-suppression.ts";
import { fileCanary } from "./rules/file-canary.ts";
import { preferConfigRedacted } from "./rules/prefer-config-redacted.ts";

const CANARY_RULE = "__file-canary";

export { INTEGRITY_VISIT_MESSAGE } from "./rules/diagnostic-suppression.ts";

export const doctorPluginRules = {
  [CANARY_RULE]: fileCanary,
  "__diagnostic-suppression-integrity": diagnosticSuppressionIntegrity,
  "prefer-config-redacted": preferConfigRedacted,
} satisfies Readonly<Record<string, Rule>>;

export default eslintCompatPlugin({
  meta: { name: "effect-doctor" },
  rules: doctorPluginRules,
});
