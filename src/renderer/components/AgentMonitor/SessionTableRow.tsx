/**
 * SessionTableRow.tsx — Single row in the session cost history table.
 */

import React, { memo, useCallback } from 'react';

import type { CostEntry } from '../../types/electron';
import { formatCost, formatTokenCount } from './costCalculator';
import { formatDateShort } from './costHelpers';

interface SessionTableRowProps {
  entry: CostEntry;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}

function shortModel(model: string): string {
  if (model.includes('opus')) return 'opus';
  if (model.includes('sonnet')) return 'sonnet';
  if (model.includes('haiku')) return 'haiku';
  return model.slice(0, 8);
}

function truncateLabel(label: string): string {
  return label.length > 30 ? label.slice(0, 27) + '...' : label;
}

const ROW_BUTTON_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid var(--border-subtle)',
  cursor: 'pointer',
  textAlign: 'left',
  padding: '4px 0',
};

function SessionRowCells({ entry }: { entry: CostEntry }): React.ReactElement<unknown> {
  return (
    <>
      <span style={{ width: '52px', flexShrink: 0, color: 'var(--text-muted)' }}>
        {formatDateShort(entry.date)}
      </span>
      <span className="flex-1 min-w-0 truncate" style={{ fontFamily: 'var(--font-ui)' }}>
        {truncateLabel(entry.taskLabel)}
      </span>
      <span
        style={{ width: '55px', flexShrink: 0, textAlign: 'right', color: 'var(--text-muted)' }}
      >
        {shortModel(entry.model)}
      </span>
      <span
        style={{ width: '70px', flexShrink: 0, textAlign: 'right', color: 'var(--text-muted)' }}
      >
        {formatTokenCount(entry.inputTokens + entry.outputTokens)}
      </span>
      <span
        className="text-interactive-accent"
        style={{ width: '52px', flexShrink: 0, textAlign: 'right', fontWeight: 600 }}
      >
        {formatCost(entry.estimatedCost)}
      </span>
    </>
  );
}

export const SessionTableRow = memo(function SessionTableRow({
  entry,
  isExpanded,
  onToggle,
}: SessionTableRowProps): React.ReactElement<unknown> {
  const handleClick = useCallback(() => onToggle(entry.sessionId), [onToggle, entry.sessionId]);

  return (
    <div>
      <button
        className="w-full flex items-center gap-2 py-1 text-[10px] tabular-nums transition-colors text-text-semantic-primary"
        style={ROW_BUTTON_STYLE}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-raised)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }}
        onClick={handleClick}
        title={entry.taskLabel}
      >
        <SessionRowCells entry={entry} />
      </button>
      {isExpanded && <ExpandedDetails entry={entry} />}
    </div>
  );
});

function DetailPair({ label, value }: { label: string; value: string }): React.ReactElement<unknown> {
  return (
    <span>
      {label}: <span className="text-text-semantic-primary">{value}</span>
    </span>
  );
}

function ExpandedDetailsFields({ entry }: { entry: CostEntry }): React.ReactElement<unknown> {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-text-semantic-muted">
      <DetailPair label="Model" value={entry.model} />
      <DetailPair label="Input" value={formatTokenCount(entry.inputTokens)} />
      <DetailPair label="Output" value={formatTokenCount(entry.outputTokens)} />
      {entry.cacheReadTokens > 0 && (
        <DetailPair label="Cache Read" value={formatTokenCount(entry.cacheReadTokens)} />
      )}
      {entry.cacheWriteTokens > 0 && (
        <DetailPair label="Cache Write" value={formatTokenCount(entry.cacheWriteTokens)} />
      )}
      <DetailPair label="Session" value={entry.sessionId.slice(0, 8)} />
      <DetailPair label="Time" value={new Date(entry.timestamp).toLocaleTimeString()} />
    </div>
  );
}

function ExpandedDetails({ entry }: { entry: CostEntry }): React.ReactElement<unknown> {
  return (
    <div
      className="py-1.5 px-2 text-[10px] bg-surface-raised"
      style={{ borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)' }}
    >
      <ExpandedDetailsFields entry={entry} />
      <div className="mt-1 text-text-semantic-faint">
        Task: <span className="text-text-semantic-primary">{entry.taskLabel}</span>
      </div>
    </div>
  );
}
