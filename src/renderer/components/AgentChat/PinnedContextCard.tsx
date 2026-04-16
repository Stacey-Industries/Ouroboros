import React, { useState } from 'react';

import type { PinnedContextItem, PinnedContextType } from '../../types/electron';

// ─── Type icon ────────────────────────────────────────────────────────────────

function typeIcon(type: PinnedContextType): string {
  switch (type) {
    case 'research-artifact': return '📚';
    case 'user-file': return '📄';
    case 'symbol-neighborhood': return '🔣';
    case 'graph-blast-radius': return '🌐';
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ActionButtonsProps {
  id: string;
  onDismiss: (id: string) => void;
  onRemove: (id: string) => void;
}

function ActionButtons({ id, onDismiss, onRemove }: ActionButtonsProps): React.ReactElement {
  return (
    <>
      <button
        type="button"
        title="Dismiss"
        aria-label="Dismiss pinned item"
        onClick={() => onDismiss(id)}
        className="shrink-0 rounded px-1 text-xs text-text-semantic-muted hover:text-text-semantic-primary"
      >
        ✕
      </button>
      <button
        type="button"
        title="Remove"
        aria-label="Remove pinned item"
        onClick={() => onRemove(id)}
        className="shrink-0 rounded px-1 text-xs text-text-semantic-muted hover:text-status-error"
      >
        🗑
      </button>
    </>
  );
}

interface CardHeaderProps {
  item: PinnedContextItem;
  expanded: boolean;
  onToggle: () => void;
  onDismiss: (id: string) => void;
  onRemove: (id: string) => void;
}

function CardHeader({ item, expanded, onToggle, onDismiss, onRemove }: CardHeaderProps): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1">
      <button
        type="button"
        onClick={onToggle}
        aria-label={item.title}
        aria-expanded={expanded}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
      >
        <span className="shrink-0 text-sm" aria-hidden="true">{typeIcon(item.type)}</span>
        <span className="truncate text-xs font-medium text-text-semantic-primary">{item.title}</span>
        <span className="ml-auto shrink-0 text-xs text-text-semantic-muted">{item.tokens}t</span>
        <span className="shrink-0 text-xs text-text-semantic-faint" aria-hidden="true">
          {expanded ? '▲' : '▼'}
        </span>
      </button>
      <ActionButtons id={item.id} onDismiss={onDismiss} onRemove={onRemove} />
    </div>
  );
}

interface CardBodyProps { content: string }

function CardBody({ content }: CardBodyProps): React.ReactElement {
  return (
    <div className="border-t border-border-subtle px-2 py-1.5">
      <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-text-semantic-secondary">
        {content}
      </pre>
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export interface PinnedContextCardProps {
  item: PinnedContextItem;
  onDismiss: (id: string) => void;
  onRemove: (id: string) => void;
}

export function PinnedContextCard({ item, onDismiss, onRemove }: PinnedContextCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded border border-border-subtle bg-surface-raised text-sm">
      <CardHeader
        item={item} expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        onDismiss={onDismiss} onRemove={onRemove}
      />
      {expanded && <CardBody content={item.content} />}
    </div>
  );
}
