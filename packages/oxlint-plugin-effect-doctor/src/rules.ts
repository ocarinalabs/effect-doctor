export const RECOMMENDED_RULES = {
  "effect-doctor/consistent-effect-fn-name": "warn",
  "effect-doctor/no-duplicate-layer-factory-call": "warn",
  "effect-doctor/no-inline-schema-compile": "warn",
  "effect-doctor/no-long-lived-layer-acquisition": "warn",
  "effect-doctor/no-managed-runtime-in-effect": "warn",
  "effect-doctor/no-manual-sql-transaction": "warn",
  "effect-doctor/no-module-mocks": "warn",
  "effect-doctor/no-multiple-callback-resume": "warn",
  "effect-doctor/no-mutation-after-unsafe-chunk-wrap": "warn",
  "effect-doctor/no-network-in-sql-transaction": "warn",
  "effect-doctor/no-run-sync-on-suspending-effect": "warn",
  "effect-doctor/no-sequential-effect-all": "warn",
  "effect-doctor/no-throw-in-effect-generator": "warn",
  "effect-doctor/no-unbounded-concurrency": "warn",
  "effect-doctor/no-unredacted-value-in-diagnostic": "warn",
  "effect-doctor/prefer-abort-signal-passthrough": "warn",
  "effect-doctor/prefer-catch-tag": "warn",
  "effect-doctor/prefer-config-redacted": "warn",
  "effect-doctor/prefer-effect-fn": "warn",
  "effect-doctor/prefer-http-json-response": "warn",
  "effect-doctor/prefer-match-tags-exhaustive": "warn",
  "effect-doctor/prefer-predicate-is-tagged": "warn",
  "effect-doctor/prefer-structured-log-data": "warn",
  "effect-doctor/require-named-effect-fn": "warn",
} satisfies Readonly<Record<`effect-doctor/${string}`, "warn">>;

export type EffectDoctorRuleKey = keyof typeof RECOMMENDED_RULES;
export type EffectDoctorRuleId =
  EffectDoctorRuleKey extends `effect-doctor/${infer Id}` ? Id : never;
