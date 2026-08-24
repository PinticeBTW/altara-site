"use client";

import { useId, useMemo, useState, type SVGProps } from "react";

export type Faq = {
  id: string;
  category: string;
  question: string;
  answer: string;
};

export type FaqCategory = {
  key: string;
  label: string;
};

type IconProps = SVGProps<SVGSVGElement>;

function IconSearch(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4.3-4.3" />
    </svg>
  );
}

function IconClose(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function IconChevron(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function FaqBrowser({
  faqs,
  categories,
}: {
  faqs: Faq[];
  categories: FaqCategory[];
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const searchId = useId();

  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return faqs.filter((faq) => {
      if (activeCategory !== "all" && faq.category !== activeCategory) return false;
      if (!normalizedQuery) return true;
      return (
        faq.question.toLowerCase().includes(normalizedQuery) ||
        faq.answer.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [faqs, activeCategory, normalizedQuery]);

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function resetFilters() {
    setQuery("");
    setActiveCategory("all");
  }

  return (
    <div className="hp-faq-block">
      <h2 className="hp-visually-hidden">Frequently asked questions</h2>

      <div className="hp-faq-controls">
        <div className="hp-glass hp-faq-search">
          <IconSearch className="hp-faq-search-icon" aria-hidden="true" />
          <label htmlFor={searchId} className="hp-visually-hidden">
            Search frequently asked questions
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search questions…"
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              className="hp-faq-search-clear"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <IconClose aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="hp-faq-categories" role="group" aria-label="Filter by category">
          <button
            type="button"
            className="hp-faq-chip"
            aria-pressed={activeCategory === "all"}
            onClick={() => setActiveCategory("all")}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category.key}
              type="button"
              className="hp-faq-chip"
              aria-pressed={activeCategory === category.key}
              onClick={() => setActiveCategory(category.key)}
            >
              {category.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="hp-faq-list">
          {filtered.map((faq) => {
            const open = openIds.has(faq.id);
            const triggerId = `faq-trigger-${faq.id}`;
            const panelId = `faq-panel-${faq.id}`;
            return (
              <div className="hp-faq-item" data-open={open} key={faq.id}>
                <h3 className="hp-faq-question">
                  <button
                    type="button"
                    id={triggerId}
                    className="hp-faq-trigger"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => toggle(faq.id)}
                  >
                    <span className="hp-faq-question-text">{faq.question}</span>
                    <IconChevron className="hp-faq-chevron" aria-hidden="true" />
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={triggerId}
                  className="hp-faq-answer-wrap"
                  inert={!open}
                >
                  <div className="hp-faq-answer-inner">
                    <p>{faq.answer}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="hp-faq-empty">
          <p>
            {normalizedQuery
              ? `No questions match "${query.trim()}".`
              : "No questions in this category."}
          </p>
          <button type="button" onClick={resetFilters}>
            Clear search and filters
          </button>
        </div>
      )}
    </div>
  );
}
