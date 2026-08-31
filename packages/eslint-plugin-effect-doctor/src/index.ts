import type { ESLint, Linter, Rule } from "eslint";
import effectDoctorOxlint, {
  RECOMMENDED_RULES,
} from "oxlint-plugin-effect-doctor";

import packageMetadata from "../package.json" with { type: "json" };

const NAMESPACE = "effect-doctor";
const RULE_DOCS_URL =
  "https://github.com/ocarinalabs/effect-doctor/tree/main/packages/oxlint-plugin-effect-doctor#available-rules";

type OxlintRule =
  (typeof effectDoctorOxlint.rules)[keyof typeof effectDoctorOxlint.rules];

type EslintAdapterBoundary = {
  readonly create: NonNullable<OxlintRule["create"]>;
  readonly meta: {
    readonly docs: {
      readonly description: string;
      readonly url: string;
    };
    readonly schema: readonly never[];
    readonly type: "layout" | "problem" | "suggestion";
  };
};

type EffectDoctorPlugin = ESLint.Plugin & {
  readonly configs: { readonly recommended: Linter.Config };
  readonly meta: { readonly name: string; readonly version: string };
};

function asEslintRule(
  rule: OxlintRule
): Rule.RuleModule & EslintAdapterBoundary;
function asEslintRule(rule: OxlintRule): EslintAdapterBoundary {
  if (rule.create === undefined) {
    throw new TypeError("Effect Doctor rules must expose an ESLint adapter.");
  }
  return {
    meta: {
      docs: {
        description: rule.meta?.docs?.description ?? "Effect Doctor finding.",
        url: RULE_DOCS_URL,
      },
      schema: [],
      type: rule.meta?.type ?? "problem",
    },
    create: rule.create,
  };
}

const rules = Object.fromEntries(
  Object.entries(effectDoctorOxlint.rules).map(([ruleName, rule]) => [
    ruleName,
    asEslintRule(rule),
  ])
);

export const recommended: Linter.Config = {
  name: `${NAMESPACE}/recommended`,
  plugins: {},
  rules: { ...RECOMMENDED_RULES },
};

const effectDoctor: EffectDoctorPlugin = {
  configs: { recommended },
  meta: { name: NAMESPACE, version: packageMetadata.version },
  rules,
};

recommended.plugins = { [NAMESPACE]: effectDoctor };

export default effectDoctor;
