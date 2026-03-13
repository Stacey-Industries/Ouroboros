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

export const SessionTableRow = memo(function SessionTableRow({
  entry,
  isExpanded,
  onToggle,
}: SessionTableRowProps): React.ReactElement {
  const handleClick = useCallback(() => onToggle(entry.sessionId), [onToggle, entry.sessionId]);

  return (
    <div>
      <button
        className="w-full flex items-center gap-2 py-1 text-[10px] tabular-nums transition-colors"
        style={{
          fontFamily: 'var(--font-mono)',
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid var(--border-muted)',
          cursor: 'pointer',
          color: 'var(--text)',
          textAlign: 'left',
          padding: '4px 0',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        onClick={handleClick}
        title={entry.taskLabel}
      >
        <span style={{ width: '52px', flexShrink: 0, color: 'var(--text-muted)' }}>{formatDateShort(entry.date)}</span>
        <span className="flex-1 min-w-0 truncate" style={{ fontFamily: 'var(--font-ui)' }}>{truncateLabel(entry.taskLabel)}</span>
        <span style={{ width: '55px', flexShrink: 0, textAlign: 'right', color: 'var(--text-muted)' }}>{shortModel(entry.model)}</span>
        <span style={{ width: '70px', flexShrink: 0, textAlign: 'right', color: 'var(--text-muted)' }}>{formatTokenCount(entry.inputTokens + entry.outputTokens)}</span>
        <span style={{ width: '52px', flexShrink: 0, textAlign: 'right', color: 'var(--accent)', fontWeight: 600 }}>{formatCost(entry.estimatedCost)}</span>
      </button>
      {isExpanded && <ExpandedDetails entry={entry} />}
    </div>
  );
});

function ExpandedDetails({ entry }: { entry: CostEntry }): React.ReactElement {
  return (
    <div
      className="py-1.5 px-2 text-[10px]"
      style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-muted)', fontFamily: 'var(--font-mono)' }}
    >
      <div className="flex flex-wrap gap-x-4 gap-y-0.5" style={{ color: 'var(--text-muted)' }}>
        <span>Model: <span style={{ color: 'var(--text)' }}>{entry.model}</span></span>
        <span>Input: <span style={{ color: 'var(--text)' }}>{formatTokenCount(entry.inputTokens)}</span></span>
        <span>Output: <span style={{ color: 'var(--text)' }}>{formatTokenCount(entry.outputTokens)}</span></span>
        {entry.cacheReadTokens > 0 && <span>Cache Read: <span style={{ color: 'var(--text)' }}>{formatTokenCount(entry.cacheReadTokens)}</span></span>}
        {entry.cacheWriteTokens > 0 && <span>Cache Write: <span style={{ color: 'var(--text)' }}>{formatTokenCount(entry.cacheWriteTokens)}</span></span>}
        <span>Session: <span style={{ color: 'var(--text)' }}>{entry.sessionId.slice(0, 8)}</span></span>
        <span>Time: <span style={{ color: 'var(--text)' }}>{new Date(entry.timestamp).toLocaleTimeString()}</span></span>
      </div>
      <div className="mt-1" style={{ color: 'var(--text-faint)' }}>
        Task: <span style={{ color: 'var(--text)' }}>{entry.taskLabel}</span>
      </div>
    </div>
  );
}
