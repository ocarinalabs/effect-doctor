"use client";

import type { RuleMetadata } from "@effect-doctor/core/rules";
import { useMemo, useState } from "react";

type RuleKey = "applicability" | "defaultSeverity" | "source" | "status";

type Filters = Record<RuleKey, string>;

const emptyFilters: Filters = {
  applicability: "all",
  defaultSeverity: "all",
  source: "all",
  status: "all",
};

const labels: Record<RuleKey, string> = {
  applicability: "Applicability",
  defaultSeverity: "Severity",
  source: "Source",
  status: "Status",
};

const sourceLabels: Partial<Record<RuleMetadata["source"], string>> = {
  "effect-doctor": "Effect Doctor",
  "effect-oxlint": "Effect Oxlint",
  "effect-tsgo": "Effect TSGo",
};

const valueLabel = (value: string): string =>
  value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const optionsFor = (rules: readonly RuleMetadata[], key: RuleKey) =>
  [...new Set(rules.map((rule) => rule[key]))].toSorted();

export const RuleCatalog = ({
  rules,
}: {
  readonly rules: readonly RuleMetadata[];
}) => {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const options = useMemo(
    () => ({
      applicability: optionsFor(rules, "applicability"),
      defaultSeverity: optionsFor(rules, "defaultSeverity"),
      source: optionsFor(rules, "source"),
      status: optionsFor(rules, "status"),
    }),
    [rules]
  );
  const filteredRules = useMemo(() => {
    const search = query.trim().toLowerCase();
    return rules.filter((rule) => {
      const matchesSearch =
        search.length === 0 ||
        [rule.id, rule.title, rule.description, rule.category].some((value) =>
          value.toLowerCase().includes(search)
        );
      const matchesFilters = (Object.keys(filters) as RuleKey[]).every(
        (key) => filters[key] === "all" || rule[key] === filters[key]
      );
      return matchesSearch && matchesFilters;
    });
  }, [filters, query, rules]);
  const hasFilters =
    query.length > 0 || Object.values(filters).some((value) => value !== "all");

  const setFilter = (key: RuleKey, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <>
      <section aria-label="Rule filters" className="catalog-controls">
        <label className="search-field">
          <span>Search Rules</span>
          <input
            autoComplete="off"
            name="rule-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try floating effect"
            spellCheck={false}
            type="search"
            value={query}
          />
        </label>
        <div className="filter-grid">
          {(Object.keys(filters) as RuleKey[]).map((key) => (
            <label key={key}>
              <span>{labels[key]}</span>
              <select
                name={`rule-${key}`}
                onChange={(event) => setFilter(key, event.target.value)}
                value={filters[key]}
              >
                <option value="all">All</option>
                {options[key].map((value) => (
                  <option key={value} value={value}>
                    {valueLabel(value)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="catalog-result-bar">
          <p aria-live="polite">
            Showing <strong>{filteredRules.length}</strong> of {rules.length}{" "}
            rules
          </p>
          {hasFilters ? (
            <button
              className="clear-button"
              onClick={() => {
                setFilters(emptyFilters);
                setQuery("");
              }}
              type="button"
            >
              Clear Filters
            </button>
          ) : null}
        </div>
      </section>

      <section aria-label="Rules" className="rule-list">
        {filteredRules.map((rule) => (
          <article className="rule-card" id={rule.id} key={rule.id}>
            <div className="rule-heading">
              <div>
                <a className="rule-id" href={`#${rule.id}`} translate="no">
                  {rule.id}
                </a>
                <h2>{rule.title}</h2>
              </div>
              <span className={`severity severity-${rule.defaultSeverity}`}>
                {rule.defaultSeverity}
              </span>
            </div>
            <p>{rule.description}</p>
            <dl className="rule-meta">
              <div>
                <dt>Source</dt>
                <dd>{sourceLabels[rule.source] ?? valueLabel(rule.source)}</dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd>{valueLabel(rule.category)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{valueLabel(rule.status)}</dd>
              </div>
              <div>
                <dt>Applicability</dt>
                <dd>{valueLabel(rule.applicability)}</dd>
              </div>
              <div>
                <dt>Fix</dt>
                <dd>{rule.fixable ? "Provider fix" : "Review"}</dd>
              </div>
            </dl>
          </article>
        ))}
        {filteredRules.length === 0 ? (
          <div className="empty-state">
            <h2>No rules match.</h2>
            <p>Clear a filter or try a broader search.</p>
          </div>
        ) : null}
      </section>
    </>
  );
};
