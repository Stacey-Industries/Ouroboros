/**
 * AwesomeSearchFilter.tsx — search input + category chip row for the
 * Awesome Ouroboros panel.
 *
 * Wave 37 Phase E. Purely presentational — receives state + setters as props.
 */

import React from 'react';

import { AWESOME_CATEGORIES, type AwesomeCategory } from '../../awesomeRef/awesomeData';
import type { CategoryFilter } from './useAwesomeFilter';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AwesomeSearchFilterProps {
  query: string;
  category: CategoryFilter;
  onQueryChange: (q: string) => void;
  onCategoryChange: (c: CategoryFilter) => void;
}

// ── Chip labels ───────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<AwesomeCategory, string> = {
  hooks: 'Hooks',
  'slash-commands': 'Slash commands',
  'mcp-configs': 'MCP configs',
  rules: 'Rules',
  skills: 'Skills',
};

// ── Sub-components ────────────────────────────────────────────────────────────

interface ChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function Chip({ label, active, onClick }: ChipProps): React.ReactElement {
  const base = 'text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer select-none';
  const activeClass = 'bg-interactive-accent text-text-on-accent border-interactive-accent';
  const inactiveClass = [
    'bg-surface-raised text-text-semantic-secondary border-border-subtle',
    'hover:border-border-semantic hover:text-text-semantic-primary',
  ].join(' ');

  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`${base} ${active ? activeClass : inactiveClass}`}
    >
      {label}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AwesomeSearchFilter({
  query,
  category,
  onQueryChange,
  onCategoryChange,
}: AwesomeSearchFilterProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-2 px-3 pt-3 pb-2">
      <input
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search entries…"
        aria-label="Search awesome entries"
        className={[
          'w-full text-sm px-3 py-1.5 rounded border border-border-subtle',
          'bg-surface-inset text-text-semantic-primary placeholder:text-text-semantic-muted',
          'focus:outline-none focus:border-interactive-accent',
        ].join(' ')}
      />
      <div className="flex gap-1.5 flex-wrap">
        <Chip
          label="All"
          active={category === 'all'}
          onClick={() => onCategoryChange('all')}
        />
        {AWESOME_CATEGORIES.map((cat) => (
          <Chip
            key={cat}
            label={CATEGORY_LABELS[cat]}
            active={category === cat}
            onClick={() => onCategoryChange(cat)}
          />
        ))}
      </div>
    </div>
  );
}
