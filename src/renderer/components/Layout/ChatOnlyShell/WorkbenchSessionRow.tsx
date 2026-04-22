import React, { useCallback } from 'react';

import type { WorkbenchSessionItem } from './useWorkbenchSessions';

function statusTone(status: WorkbenchSessionItem['status']): string {
  if (status === 'deleted') return 'bg-status-error-subtle text-status-error';
  if (status === 'archived') return 'bg-status-warning-subtle text-status-warning';
  return 'bg-status-success-subtle text-status-success';
}

function metricLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export interface WorkbenchSessionRowProps {
  item: WorkbenchSessionItem;
  onSelect?: (sessionId: string) => void;
}

export function WorkbenchSessionRow({ item, onSelect }: WorkbenchSessionRowProps): React.ReactElement {
  const handleSelect = useCallback(() => {
    onSelect?.(item.id);
  }, [item.id, onSelect]);

  const activeClass = item.isActive
    ? 'border-l-2 border-interactive-accent bg-interactive-selection'
    : 'border-l-2 border-transparent hover:bg-surface-hover';

  return (
    <button
      type="button"
      role="row"
      aria-selected={item.isActive}
      className={`flex w-full flex-col gap-2 px-3 py-2 text-left transition-colors ${activeClass}`}
      onClick={handleSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleSelect();
        }
      }}
      data-testid="workbench-session-row"
      data-session-id={item.id}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-text-semantic-primary">
              {item.projectLabel}
            </span>
            {item.isPinned && (
              <span className="text-xs text-interactive-accent" aria-label="Pinned session">
                ★
              </span>
            )}
            {item.hasActiveThread && (
              <span
                className="rounded-full bg-interactive-accent-subtle px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-interactive-accent"
              >
                Live chat
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-text-semantic-muted">
            <span className="font-mono">{item.shortId}</span>
            {item.isWorktree && <span>worktree</span>}
            <span>{item.lastUsedLabel}</span>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusTone(item.status)}`}>
          {item.status}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-text-semantic-secondary">
        <span className="rounded-full bg-surface-inset px-2 py-0.5">
          {metricLabel(item.terminalCount, 'terminal', 'terminals')}
        </span>
        <span className="rounded-full bg-surface-inset px-2 py-0.5">
          {metricLabel(item.chatCount, 'chat', 'chats')}
        </span>
      </div>
    </button>
  );
}
