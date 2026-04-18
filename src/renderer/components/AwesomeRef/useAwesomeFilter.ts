/**
 * useAwesomeFilter.ts — Filter hook for the Awesome Ouroboros reference panel.
 *
 * Wave 37 Phase E. Filters AWESOME_ENTRIES by free-text query and/or category.
 * Pure computation — no side effects, no IPC.
 */

import { useMemo, useState } from 'react';

import {
  AWESOME_ENTRIES,
  type AwesomeCategory,
  type AwesomeEntry,
} from '../../awesomeRef/awesomeData';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CategoryFilter = AwesomeCategory | 'all';

export interface AwesomeFilterState {
  query: string;
  category: CategoryFilter;
}

export interface AwesomeFilterResult {
  filtered: readonly AwesomeEntry[];
  query: string;
  category: CategoryFilter;
  setQuery: (q: string) => void;
  setCategory: (c: CategoryFilter) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function matchesQuery(entry: AwesomeEntry, lower: string): boolean {
  if (entry.title.toLowerCase().includes(lower)) return true;
  if (entry.description.toLowerCase().includes(lower)) return true;
  if (entry.tags?.some((t) => t.toLowerCase().includes(lower))) return true;
  return false;
}

function filterEntries(
  entries: readonly AwesomeEntry[],
  query: string,
  category: CategoryFilter,
): readonly AwesomeEntry[] {
  const lower = query.trim().toLowerCase();
  return entries.filter((e) => {
    const catMatch = category === 'all' || e.category === category;
    const textMatch = lower === '' || matchesQuery(e, lower);
    return catMatch && textMatch;
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAwesomeFilter(): AwesomeFilterResult {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');

  const filtered = useMemo(
    () => filterEntries(AWESOME_ENTRIES, query, category),
    [query, category],
  );

  return { filtered, query, category, setQuery, setCategory };
}
