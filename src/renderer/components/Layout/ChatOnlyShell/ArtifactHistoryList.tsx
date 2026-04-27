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
      className={`rounded border px-2 py-1.5 text-left text-xs transition-colors ${cls}`}
      onClick={() => onSelect(item)}
    >
      <div className="truncate font-medium">{item.title}</div>
      {item.subtitle && (
        <div className="truncate text-[11px] text-text-semantic-tertiary">{item.subtitle}</div>
      )}
    </button>
  );
}

export function ArtifactHistoryList({
  items,
  activeKey,
  onSelect,
}: ArtifactHistoryListProps): React.ReactElement | null {
  if (items.length === 0) return null;
  return (
    <section
      className="border-b border-border-semantic-subtle px-3 py-2"
      data-testid="artifact-history-list"
    >
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-semantic-tertiary">
        Recent
      </div>
      <div className="flex flex-col gap-1.5">
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
