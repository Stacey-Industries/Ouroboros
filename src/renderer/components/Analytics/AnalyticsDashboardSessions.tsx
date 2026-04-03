import React, { memo, useCallback, useMemo, useState } from 'react';

import type { SessionMetrics } from '../../hooks/useSessionAnalytics';
import {
  formatDuration,
  formatTokens,
  getSessionStatusColor,
  SESSION_COLUMNS,
  SortKey,
  sortSessionMetrics,
  timeAgo,
} from './analyticsDashboardFormatting';
import { SessionDetailPanel } from './AnalyticsDashboardSessions.detail';

interface SessionHistoryTableProps {
  sessions: SessionMetrics[];
  onSelectSession: (id: string | null) => void;
  selectedSessionId: string | null;
}

interface SessionHistoryRowProps {
  session: SessionMetrics;
  isSelected: boolean;
  onToggle: (sessionId: string, isSelected: boolean) => void;
}

const SessionTableHeader = memo(function SessionTableHeader({
  onSort,
  sortAsc,
  sortKey,
}: {
  onSort: (key: SortKey) => void;
  sortAsc: boolean;
  sortKey: SortKey;
}): React.ReactElement {
  return (
    <div
      className="flex items-center gap-1 py-1 text-[9px] font-medium uppercase tracking-wider text-text-semantic-faint"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
    >
      <span style={{ width: '52px', flexShrink: 0 }}>ID</span>
      {SESSION_COLUMNS.map((column) => (
        <button
          key={column.key}
          onClick={() => onSort(column.key)}
          className="text-[9px] font-medium uppercase tracking-wider"
          style={{
            width: column.width,
            flexShrink: 0,
            textAlign: 'right',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: sortKey === column.key ? 'var(--interactive-accent)' : 'var(--text-faint)',
            padding: 0,
            fontFamily: 'inherit',
          }}
          title={`Sort by ${column.label}`}
        >
          {column.label}
          {sortKey === column.key ? (sortAsc ? ' ^' : ' v') : ''}
        </button>
      ))}
    </div>
  );
});

function SessionRowMetrics({ session }: { session: SessionMetrics }): React.ReactElement {
  return (
    <>
      <span
        style={{
          width: '44px',
          flexShrink: 0,
          textAlign: 'right',
          color:
            session.efficiencyScore === Infinity
              ? 'var(--text-faint)'
              : 'var(--interactive-accent)',
        }}
      >
        {session.efficiencyScore === Infinity
          ? '--'
          : formatTokens(Math.round(session.efficiencyScore))}
      </span>
      <span
        style={{
          width: '28px',
          flexShrink: 0,
          textAlign: 'right',
          color: session.errorCount > 0 ? 'var(--status-error)' : 'var(--text-faint)',
        }}
      >
        {session.errorCount}
      </span>
    </>
  );
}

function SessionRowCells({ session }: { session: SessionMetrics }): React.ReactElement {
  return (
    <>
      <span className="flex items-center gap-1" style={{ width: '52px', flexShrink: 0 }}>
        <span
          className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: getSessionStatusColor(session.status) }}
        />
        <span className="truncate" style={{ fontFamily: 'var(--font-ui)' }}>
          {session.sessionId.slice(0, 6)}
        </span>
      </span>
      <span
        className="text-text-semantic-muted"
        style={{ width: '56px', flexShrink: 0, textAlign: 'right' }}
      >
        {timeAgo(session.startedAt)}
      </span>
      <span style={{ width: '48px', flexShrink: 0, textAlign: 'right' }}>
        {formatDuration(session.durationMs)}
      </span>
      <span style={{ width: '36px', flexShrink: 0, textAlign: 'right' }}>
        {session.toolCallCount}
      </span>
      <span style={{ width: '36px', flexShrink: 0, textAlign: 'right' }}>
        {session.fileEditCount}
      </span>
      <span
        className="text-text-semantic-muted"
        style={{ width: '48px', flexShrink: 0, textAlign: 'right' }}
      >
        {formatTokens(session.totalTokens)}
      </span>
      <SessionRowMetrics session={session} />
    </>
  );
}

const SessionHistoryRow = memo(function SessionHistoryRow({
  session,
  isSelected,
  onToggle,
}: SessionHistoryRowProps): React.ReactElement {
  return (
    <button
      className="w-full flex items-center gap-1 py-1 text-[10px] tabular-nums transition-colors text-text-semantic-primary"
      style={{
        fontFamily: 'var(--font-mono)',
        background: isSelected
          ? 'color-mix(in srgb, var(--interactive-accent) 12%, transparent)'
          : 'transparent',
        border: 'none',
        borderBottom: '1px solid var(--border-subtle)',
        cursor: 'pointer',
        textAlign: 'left',
        padding: '3px 0',
      }}
      onMouseEnter={(event) => {
        if (!isSelected) event.currentTarget.style.background = 'var(--surface-raised)';
      }}
      onMouseLeave={(event) => {
        if (!isSelected) event.currentTarget.style.background = 'transparent';
      }}
      onClick={() => onToggle(session.sessionId, isSelected)}
    >
      <SessionRowCells session={session} />
    </button>
  );
});

function useSortState(initialKey: SortKey) {
  const [sortKey, setSortKey] = useState<SortKey>(initialKey);
  const [sortAsc, setSortAsc] = useState(false);
  const handleSort = useCallback((key: SortKey) => {
    setSortKey((previous) => {
      setSortAsc((ascending) => (previous === key ? !ascending : false));
      return key;
    });
  }, []);
  return { sortKey, sortAsc, handleSort };
}

export const SessionHistoryTable = memo(function SessionHistoryTable({
  sessions,
  onSelectSession,
  selectedSessionId,
}: SessionHistoryTableProps): React.ReactElement | null {
  const { sortKey, sortAsc, handleSort } = useSortState('startedAt');
  const sorted = useMemo(
    () => sortSessionMetrics(sessions, sortKey, sortAsc),
    [sessions, sortAsc, sortKey],
  );
  const handleToggle = useCallback(
    (sessionId: string, isSelected: boolean) => onSelectSession(isSelected ? null : sessionId),
    [onSelectSession],
  );

  if (sessions.length === 0) return null;

  return (
    <div className="px-4 py-3 border-b border-border-semantic">
      <div className="text-[10px] font-medium uppercase tracking-wider mb-1.5 text-text-semantic-faint">
        Sessions ({sessions.length})
      </div>
      <SessionTableHeader onSort={handleSort} sortAsc={sortAsc} sortKey={sortKey} />
      <div className="overflow-y-auto" style={{ maxHeight: '240px' }}>
        {sorted.map((session) => (
          <SessionHistoryRow
            key={session.sessionId}
            session={session}
            isSelected={selectedSessionId === session.sessionId}
            onToggle={handleToggle}
          />
        ))}
      </div>
    </div>
  );
});

export { SessionDetailPanel };
