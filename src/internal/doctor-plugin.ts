import { eslintCompatPlugin } from "@oxlint/plugins";
import type { Rule } from "@oxlint/plugins";

import { diagnosticSuppressionIntegrity } from "./rules/diagnostic-suppression.ts";
import { fileCanary } from "./rules/file-canary.ts";
import { noLongLivedLayerAcquisition } from "./rules/no-long-lived-layer-acquisition.ts";
import { noManualSqlTransaction } from "./rules/no-manual-sql-transaction.ts";
import { noNetworkInSqlTransaction } from "./rules/no-network-in-sql-transaction.ts";
import { noRunSyncOnSuspendingEffect } from "./rules/no-run-sync-on-suspending-effect.ts";
import { preferAbortSignalPassthrough } from "./rules/prefer-abort-signal-passthrough.ts";
import { preferConfigRedacted } from "./rules/prefer-config-redacted.ts";
import { preferHttpJsonResponse } from "./rules/prefer-http-json-response.ts";
import { preferStructuredLogData } from "./rules/prefer-structured-log-data.ts";

const CANARY_RULE = "__file-canary";

export { INTEGRITY_VISIT_MESSAGE } from "./rules/diagnostic-suppression.ts";

export const doctorPluginRules = {
  [CANARY_RULE]: fileCanary,
  "__diagnostic-suppression-integrity": diagnosticSuppressionIntegrity,
  "no-long-lived-layer-acquisition": noLongLivedLayerAcquisition,
  "no-manual-sql-transaction": noManualSqlTransaction,
  "no-network-in-sql-transaction": noNetworkInSqlTransaction,
  "no-run-sync-on-suspending-effect": noRunSyncOnSuspendingEffect,
  "prefer-abort-signal-passthrough": preferAbortSignalPassthrough,
  "prefer-config-redacted": preferConfigRedacted,
  "prefer-http-json-response": preferHttpJsonResponse,
  "prefer-structured-log-data": preferStructuredLogData,
} satisfies Readonly<Record<string, Rule>>;

export default eslintCompatPlugin({
  meta: { name: "effect-doctor" },
  rules: doctorPluginRules,
});
