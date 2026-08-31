import { knownRules } from "@effect-doctor/core/rules";
import type { Metadata } from "next";

import { RuleCatalog } from "./rule-catalog";

export const metadata: Metadata = {
  description: "Search the active Effect Doctor rule catalog.",
  title: "Rules",
};

export default function RulesPage() {
  const rules = knownRules();

  return (
    <div className="shell catalog-page">
      <header className="catalog-hero">
        <p className="eyebrow">Canonical inventory</p>
        <h1>Rules</h1>
        <p>
          Search {rules.length} active Effect v4 rules. Counts and descriptions
          come straight from the package used by the scanner.
        </p>
      </header>
      <RuleCatalog rules={rules} />
    </div>
  );
}
