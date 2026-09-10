import { knownRules } from "@effect-doctor/core/rules";
import type { RuleMetadata } from "@effect-doctor/core/rules";
import type { Metadata } from "next";

export const metadata: Metadata = {
  description: "Every rule Effect Doctor runs, grouped by category.",
  title: "Rules",
};

type Category = RuleMetadata["category"];

const CATEGORY_ORDER: readonly Category[] = [
  "correctness",
  "resource-safety",
  "security",
  "antipattern",
  "effect-native",
  "style",
];

const CATEGORY_TITLES: Record<Category, string> = {
  antipattern: "Antipatterns",
  correctness: "Correctness",
  "effect-native": "Effect-native",
  "resource-safety": "Resource safety",
  security: "Security",
  style: "Style",
};

const rules = knownRules();
const tsgoCount = rules.filter((rule) => rule.source === "effect-tsgo").length;
const doctorCount = rules.length - tsgoCount;
const groups = CATEGORY_ORDER.map((category) => ({
  category,
  rules: rules.filter((rule) => rule.category === category),
})).filter((group) => group.rules.length > 0);

const anchor = (rule: RuleMetadata): string => rule.id.replaceAll("/", "-");

export default function RulesPage() {
  return (
    <div className="rules-page">
      <header className="rules-intro">
        <h1>Rules</h1>
        <p className="lede">
          Effect Doctor runs {rules.length} rules, {tsgoCount} from Effect TSGo
          and {doctorCount} from Effect Doctor. Advice never fails a scan.
        </p>
      </header>
      {groups.map((group) => (
        <section
          aria-labelledby={`category-${group.category}`}
          className="category"
          key={group.category}
        >
          <h2 id={`category-${group.category}`}>
            {CATEGORY_TITLES[group.category]}{" "}
            <span className="count">{group.rules.length}</span>
          </h2>
          <ul className="rule-list">
            {group.rules.map((rule) => (
              <li className="rule" id={anchor(rule)} key={rule.id}>
                <code translate="no">
                  <a href={`#${anchor(rule)}`}>{rule.id}</a>
                </code>
                <span className={`severity severity-${rule.defaultSeverity}`}>
                  {rule.defaultSeverity}
                </span>
                <p>{rule.description}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
