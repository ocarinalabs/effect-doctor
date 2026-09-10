import { eslintCompatPlugin } from "@oxlint/plugins";
import type { Rule } from "@oxlint/plugins";
import effectDoctorPlugin from "oxlint-plugin-effect-doctor";

import { diagnosticSuppressionIntegrity } from "./rules/diagnostic-suppression.ts";
import { fileCanary } from "./rules/file-canary.ts";

const CANARY_RULE = "__file-canary";

const doctorPluginRules = {
  ...effectDoctorPlugin.rules,
  [CANARY_RULE]: fileCanary,
  "__diagnostic-suppression-integrity": diagnosticSuppressionIntegrity,
} satisfies Readonly<Record<string, Rule>>;

export default eslintCompatPlugin({
  meta: { name: "effect-doctor" },
  rules: doctorPluginRules,
});
