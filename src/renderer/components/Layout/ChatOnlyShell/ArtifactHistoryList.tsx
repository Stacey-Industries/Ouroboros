import React from 'react';

import type { ArtifactHistoryEntry } from './useArtifactHistoryStack';

export interface ArtifactHistoryListProps {
  items: ArtifactHistoryEntry[];
  activeKey: string | null;
  onSelect: (item: ArtifactHistoryEntry) => void;
}

function ArtifactHistoryItem({
  item,
  isActive,
  onSelect,
}: {
  item: ArtifactHistoryEntry;
  isActive: boolean;
  onSelect: (item: ArtifactHistoryEntry) => void;
}): React.ReactElement {
  const cls = isActive
    ? 'border-interactive-accent bg-interactive-selection text-text-semantic-primary'
    : 'border-border-semantic bg-surface-panel text-text-semantic-secondary hover:bg-surface-hover';
  return (
    <button
      type="button"
      data-testid="artifact-history-item"
      data-artifact-key={item.key}
      title={item.subtitle ? `${item.title} — ${item.subtitle}` : item.title}
      className={`max-w-[140px] truncate rounded border px-2 py-1 text-left text-[11px] transition-colors ${cls}`}
      onClick={() => onSelect(item)}
    >
      <span className="truncate font-medium">{item.title}</span>
    </button>
  );
}

export function ArtifactHistoryList({
  items,
  activeKey,
  onSelect,
}: ArtifactHistoryListProps): React.ReactElement | null {
  if (items.length === 0) return null;
  // Wave 82 — horizontal flex-wrap layout, 5 chips × 2 rows max (10 visible).
  // Cap enforced upstream by useArtifactHistoryStack's MAX_RECENT.
  return (
    <section
      className="border-b border-border-semantic-subtle px-3 py-2"
      data-testid="artifact-history-list"
    >
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-semantic-tertiary">
        Recent
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <ArtifactHistoryItem
            key={item.key}
            item={item}
            isActive={item.key === activeKey}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}
