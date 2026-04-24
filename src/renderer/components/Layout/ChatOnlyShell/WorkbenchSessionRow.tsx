import React, { useCallback } from 'react';

import type { WorkbenchRecentChatItem } from './useWorkbenchRecentChats';
import type { WorkbenchSessionItem } from './useWorkbenchSessions';

export type WorkbenchRowItem = WorkbenchSessionItem | WorkbenchRecentChatItem;

interface RailChip {
  label: string;
  tone: 'neutral' | 'accent' | 'warning' | 'error' | 'success';
}

function chipClassName(tone: RailChip['tone']): string {
  if (tone === 'accent') return 'bg-interactive-accent-subtle text-interactive-accent';
  if (tone === 'warning') return 'bg-status-warning-subtle text-status-warning';
  if (tone === 'error') return 'bg-status-error-subtle text-status-error';
  if (tone === 'success') return 'bg-status-success-subtle text-status-success';
  return 'bg-surface-inset text-text-semantic-secondary';
}

function metricLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function attentionChip(item: WorkbenchRowItem): RailChip | null {
  if (item.attention.kind === 'none') return null;
  return {
    label: item.attention.label ?? 'Attention',
    tone: item.attention.tone,
  };
}

function sessionChips(item: WorkbenchSessionItem): RailChip[] {
  return [
    item.isPinned ? { label: 'Pinned', tone: 'accent' } : null,
    item.isWorktree ? { label: 'Worktree', tone: 'neutral' } : null,
    item.threadStatus && item.attention.kind !== 'live'
      ? null
      : item.threadStatus
        ? { label: 'Live', tone: 'accent' }
        : null,
    attentionChip(item),
    item.status === 'archived' ? { label: 'Archived', tone: 'warning' } : null,
    item.status === 'deleted' ? { label: 'Deleted', tone: 'error' } : null,
  ].filter((chip): chip is RailChip => chip !== null);
}

function recentChatChips(item: WorkbenchRecentChatItem): RailChip[] {
  return [item.isPinned ? { label: 'Pinned', tone: 'accent' } : null, attentionChip(item)].filter(
    (chip): chip is RailChip => chip !== null,
  );
}

function chipsForItem(item: WorkbenchRowItem): RailChip[] {
  return item.kind === 'session' ? sessionChips(item) : recentChatChips(item);
}

function titleForItem(item: WorkbenchRowItem): string {
  return item.kind === 'session' ? item.projectLabel : item.title;
}

function AttentionMark({ item }: { item: WorkbenchRowItem }): React.ReactElement | null {
  if (item.attention.kind !== 'approval') return null;
  return (
    <span
      data-testid="workbench-approval-attention-mark"
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-status-warning text-[11px] font-bold text-text-on-accent"
      title={item.attention.label ?? 'Approval required'}
      aria-label={item.attention.label ?? 'Approval required'}
    >
      !
    </span>
  );
}

function subtitleForItem(item: WorkbenchRowItem): React.ReactNode {
  if (item.kind === 'session') {
    return (
      <>
        <span className="font-mono">{item.shortId}</span>
        <span>{item.lastUsedLabel}</span>
      </>
    );
  }
  return (
    <>
      <span>{item.projectLabel}</span>
      <span className="font-mono">{item.shortId}</span>
      <span>{item.lastUpdatedLabel}</span>
    </>
  );
}

function metricsForItem(item: WorkbenchRowItem): RailChip[] {
  if (item.kind === 'session') {
    return [
      { label: metricLabel(item.terminalCount, 'terminal', 'terminals'), tone: 'neutral' },
      { label: metricLabel(item.chatCount, 'chat', 'chats'), tone: 'neutral' },
    ];
  }
  return [{ label: metricLabel(item.messageCount, 'msg', 'msgs'), tone: 'neutral' }];
}

function ItemChips({ chips }: { chips: RailChip[] }): React.ReactElement | null {
  if (chips.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <span
          key={`${chip.label}-${chip.tone}`}
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${chipClassName(chip.tone)}`}
        >
          {chip.label}
        </span>
      ))}
    </div>
  );
}

export interface WorkbenchSessionRowProps {
  item: WorkbenchRowItem;
  onSelect?: (itemId: string) => void;
  onCompare?: (itemId: string) => void;
  showCompareAction?: boolean;
  compareActive?: boolean;
}

function RowTitle({ item }: { item: WorkbenchRowItem }): React.ReactElement {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1.5">
        <AttentionMark item={item} />
        <span className="truncate text-sm font-medium text-text-semantic-primary">
          {titleForItem(item)}
        </span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-semantic-muted">
        {subtitleForItem(item)}
      </div>
      <ItemChips chips={chipsForItem(item)} />
    </div>
  );
}

function CompareButton({
  active,
  itemId,
  onCompare,
}: {
  active: boolean;
  itemId: string;
  onCompare: (itemId: string) => void;
}): React.ReactElement {
  const className = active
    ? 'border-interactive-accent bg-interactive-accent-subtle text-interactive-accent'
    : 'border-stroke-default bg-surface-panel text-text-semantic-secondary hover:bg-surface-hover hover:text-text-semantic-primary';
  return (
    <button
      type="button"
      className={`rounded-full border px-2 py-0.5 text-[11px] ${className}`}
      onClick={(event) => {
        event.stopPropagation();
        onCompare(itemId);
      }}
      data-testid="workbench-session-compare"
    >
      {active ? 'Comparing' : 'Compare'}
    </button>
  );
}

function RowMetrics({
  item,
  onCompare,
  showCompareAction,
  compareActive,
}: Required<Pick<WorkbenchSessionRowProps, 'item' | 'showCompareAction' | 'compareActive'>> &
  Pick<WorkbenchSessionRowProps, 'onCompare'>): React.ReactElement {
  const showCompare = item.kind === 'session' && showCompareAction && onCompare;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-semantic-secondary">
      {metricsForItem(item).map((metric) => (
        <span
          key={metric.label}
          className={`rounded-full px-2 py-0.5 ${chipClassName(metric.tone)}`}
        >
          {metric.label}
        </span>
      ))}
      {showCompare && (
        <CompareButton active={compareActive} itemId={item.id} onCompare={onCompare} />
      )}
    </div>
  );
}

export function WorkbenchSessionRow({
  item,
  onSelect,
  onCompare,
  showCompareAction = false,
  compareActive = false,
}: WorkbenchSessionRowProps): React.ReactElement {
  const handleSelect = useCallback(() => {
    onSelect?.(item.id);
  }, [item.id, onSelect]);

  const activeClass = item.isActive
    ? 'border-l-2 border-interactive-accent bg-interactive-selection'
    : 'border-l-2 border-transparent hover:bg-surface-hover';

  return (
    <div
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
      tabIndex={0}
      data-testid="workbench-session-row"
      data-row-kind={item.kind}
      data-item-id={item.id}
    >
      <RowTitle item={item} />
      <RowMetrics
        item={item}
        onCompare={onCompare}
        showCompareAction={showCompareAction}
        compareActive={compareActive}
      />
    </div>
  );
}
