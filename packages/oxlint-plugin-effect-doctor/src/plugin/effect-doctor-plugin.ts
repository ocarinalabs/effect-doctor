import { eslintCompatPlugin } from "@oxlint/plugins";

import { ruleRegistry } from "./rule-registry.ts";

const effectDoctorPlugin = eslintCompatPlugin({
  meta: { name: "effect-doctor" },
  rules: ruleRegistry,
});

export default effectDoctorPlugin;
