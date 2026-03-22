import React, { memo, useCallback, useMemo, useState } from 'react';
import type { SessionMetrics } from '../../hooks/useSessionAnalytics';
import {
  formatDuration,
  formatTokens,
  formatToolDuration,
  getModelBadgeLabel,
  getSessionStatusColor,
  getSortedFileEditEntries,
  getToolCallStatusColor,
  getToolColor,
  SESSION_COLUMNS,
  shortenFilePath,
  SortKey,
  sortSessionMetrics,
  timeAgo,
} from './analyticsDashboardFormatting';

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

interface SessionDetailPanelProps {
  session: SessionMetrics;
  onClose: () => void;
}

interface SessionFilesSectionProps {
  fileEditCounts: Record<string, number>;
}

interface FileEditRowProps {
  filePath: string;
  count: number;
}

interface SessionToolCallRowProps {
  toolCall: SessionMetrics['toolCalls'][number];
}

interface SessionErrorRowProps {
  toolCall: SessionMetrics['toolCalls'][number];
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
    <div className="flex items-center gap-1 py-1 text-[9px] font-medium uppercase tracking-wider text-text-semantic-faint" style={{ borderBottom: '1px solid var(--border-muted)' }}>
      <span style={{ width: '52px', flexShrink: 0 }}>ID</span>
      {SESSION_COLUMNS.map((column) => (
        <button
          key={column.key}
          onClick={() => onSort(column.key)}
          className="text-[9px] font-medium uppercase tracking-wider"
          style={{ width: column.width, flexShrink: 0, textAlign: 'right', background: 'none', border: 'none', cursor: 'pointer', color: sortKey === column.key ? 'var(--accent)' : 'var(--text-faint)', padding: 0, fontFamily: 'inherit' }}
          title={`Sort by ${column.label}`}
        >
          {column.label}{sortKey === column.key ? (sortAsc ? ' ^' : ' v') : ''}
        </button>
      ))}
    </div>
  );
});

const SessionHistoryRow = memo(function SessionHistoryRow({
  session,
  isSelected,
  onToggle,
}: SessionHistoryRowProps): React.ReactElement {
  return (
    <button
      className="w-full flex items-center gap-1 py-1 text-[10px] tabular-nums transition-colors text-text-semantic-primary"
      style={{ fontFamily: 'var(--font-mono)', background: isSelected ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent', border: 'none', borderBottom: '1px solid var(--border-muted)', cursor: 'pointer', textAlign: 'left', padding: '3px 0' }}
      onMouseEnter={(event) => { if (!isSelected) event.currentTarget.style.background = 'var(--bg-tertiary)'; }}
      onMouseLeave={(event) => { if (!isSelected) event.currentTarget.style.background = 'transparent'; }}
      onClick={() => onToggle(session.sessionId, isSelected)}
    >
      <span className="flex items-center gap-1" style={{ width: '52px', flexShrink: 0 }}>
        <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: getSessionStatusColor(session.status) }} />
        <span className="truncate" style={{ fontFamily: 'var(--font-ui)' }}>{session.sessionId.slice(0, 6)}</span>
      </span>
      <span className="text-text-semantic-muted" style={{ width: '56px', flexShrink: 0, textAlign: 'right' }}>{timeAgo(session.startedAt)}</span>
      <span style={{ width: '48px', flexShrink: 0, textAlign: 'right' }}>{formatDuration(session.durationMs)}</span>
      <span style={{ width: '36px', flexShrink: 0, textAlign: 'right' }}>{session.toolCallCount}</span>
      <span style={{ width: '36px', flexShrink: 0, textAlign: 'right' }}>{session.fileEditCount}</span>
      <span className="text-text-semantic-muted" style={{ width: '48px', flexShrink: 0, textAlign: 'right' }}>{formatTokens(session.totalTokens)}</span>
      <span style={{ width: '44px', flexShrink: 0, textAlign: 'right', color: session.efficiencyScore === Infinity ? 'var(--text-faint)' : 'var(--accent)' }}>
        {session.efficiencyScore === Infinity ? '--' : formatTokens(Math.round(session.efficiencyScore))}
      </span>
      <span style={{ width: '28px', flexShrink: 0, textAlign: 'right', color: session.errorCount > 0 ? 'var(--error, #f87171)' : 'var(--text-faint)' }}>
        {session.errorCount}
      </span>
    </button>
  );
});

export const SessionHistoryTable = memo(function SessionHistoryTable({
  sessions,
  onSelectSession,
  selectedSessionId,
}: SessionHistoryTableProps): React.ReactElement | null {
  const [sortKey, setSortKey] = useState<SortKey>('startedAt');
  const [sortAsc, setSortAsc] = useState(false);
  const sorted = useMemo(() => sortSessionMetrics(sessions, sortKey, sortAsc), [sessions, sortAsc, sortKey]);
  const handleSort = useCallback((key: SortKey) => {
    setSortKey((previous) => {
      setSortAsc((ascending) => (previous === key ? !ascending : false));
      return key;
    });
  }, []);
  const handleToggle = useCallback((sessionId: string, isSelected: boolean) => onSelectSession(isSelected ? null : sessionId), [onSelectSession]);

  if (sessions.length === 0) return null;

  return (
    <div className="px-4 py-3 border-b border-border-semantic">
      <div className="text-[10px] font-medium uppercase tracking-wider mb-1.5 text-text-semantic-faint">Sessions ({sessions.length})</div>
      <SessionTableHeader onSort={handleSort} sortAsc={sortAsc} sortKey={sortKey} />
      <div className="overflow-y-auto" style={{ maxHeight: '240px' }}>
        {sorted.map((session) => <SessionHistoryRow key={session.sessionId} session={session} isSelected={selectedSessionId === session.sessionId} onToggle={handleToggle} />)}
      </div>
    </div>
  );
});

const SessionDetailHeader = memo(function SessionDetailHeader({
  model,
  onClose,
  sessionId,
  status,
}: {
  model?: string;
  onClose: () => void;
  sessionId: string;
  status: string;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: getSessionStatusColor(status) }} />
        <span className="text-[12px] font-semibold text-text-semantic-primary">Session {sessionId.slice(0, 8)}</span>
        {model ? <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold text-interactive-accent" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)' }}>{getModelBadgeLabel(model)}</span> : null}
      </div>
      <button onClick={onClose} className="text-text-semantic-muted" style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: 'none', background: 'transparent', fontSize: '14px', cursor: 'pointer', lineHeight: 1 }}>
        x
      </button>
    </div>
  );
});

const SessionTokenBreakdown = memo(function SessionTokenBreakdown({
  inputTokens,
  outputTokens,
  totalTokens,
}: Pick<SessionMetrics, 'inputTokens' | 'outputTokens' | 'totalTokens'>): React.ReactElement {
  return (
    <div className="rounded-md p-2 mb-2 bg-surface-base" style={{ border: '1px solid var(--border-muted)' }}>
      <div className="text-[9px] font-medium uppercase tracking-wider mb-1 text-text-semantic-faint">Token Breakdown</div>
      <div className="flex gap-4 text-[10px] tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
        <span className="text-text-semantic-muted">In: <span className="text-text-semantic-primary">{formatTokens(inputTokens)}</span></span>
        <span className="text-text-semantic-muted">Out: <span className="text-text-semantic-primary">{formatTokens(outputTokens)}</span></span>
        <span className="text-text-semantic-muted">Total: <span className="text-interactive-accent">{formatTokens(totalTokens)}</span></span>
      </div>
    </div>
  );
});

const FileEditRow = memo(function FileEditRow({ count, filePath }: FileEditRowProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="truncate text-text-semantic-muted" style={{ fontFamily: 'var(--font-mono)' }} title={filePath}>
        {shortenFilePath(filePath)}
      </span>
      <span className="tabular-nums flex-shrink-0 ml-2" style={{ fontFamily: 'var(--font-mono)', color: count >= 3 ? 'var(--error, #f87171)' : 'var(--text-faint)' }} title={count >= 3 ? 'Possible retry pattern' : ''}>
        {count}x
      </span>
    </div>
  );
});

const SessionFilesSection = memo(function SessionFilesSection({
  fileEditCounts,
}: SessionFilesSectionProps): React.ReactElement | null {
  const fileEntries = useMemo(() => getSortedFileEditEntries(fileEditCounts), [fileEditCounts]);

  if (fileEntries.length === 0) return null;

  return (
    <div className="rounded-md p-2 mb-2 bg-surface-base" style={{ border: '1px solid var(--border-muted)' }}>
      <div className="text-[9px] font-medium uppercase tracking-wider mb-1 text-text-semantic-faint">Files Edited ({fileEntries.length})</div>
      <div className="flex flex-col gap-0.5 overflow-y-auto" style={{ maxHeight: '80px' }}>
        {fileEntries.map(([filePath, count]) => <FileEditRow key={filePath} filePath={filePath} count={count} />)}
      </div>
    </div>
  );
});

const SessionToolCallRow = memo(function SessionToolCallRow({ toolCall }: SessionToolCallRowProps): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: getToolCallStatusColor(toolCall.status) }} />
      <span className="font-semibold flex-shrink-0" style={{ color: getToolColor(toolCall.toolName), width: '48px' }}>{toolCall.toolName}</span>
      <span className="truncate flex-1 min-w-0 text-text-semantic-muted" style={{ fontFamily: 'var(--font-mono)' }} title={toolCall.input}>
        {toolCall.input}
      </span>
      {toolCall.duration !== undefined ? <span className="tabular-nums flex-shrink-0 text-text-semantic-faint" style={{ fontFamily: 'var(--font-mono)' }}>{formatToolDuration(toolCall.duration)}</span> : null}
    </div>
  );
});

const SessionTimelineSection = memo(function SessionTimelineSection({
  session,
}: {
  session: SessionMetrics;
}): React.ReactElement {
  return (
    <div className="rounded-md p-2 bg-surface-base" style={{ border: '1px solid var(--border-muted)' }}>
      <div className="text-[9px] font-medium uppercase tracking-wider mb-1 text-text-semantic-faint">Tool Call Timeline ({session.toolCalls.length})</div>
      <div className="flex flex-col gap-0.5 overflow-y-auto" style={{ maxHeight: '120px' }}>
        {session.toolCalls.length === 0 ? <span className="text-[10px] italic text-text-semantic-faint">No tool calls</span> : session.toolCalls.map((toolCall) => <SessionToolCallRow key={toolCall.id} toolCall={toolCall} />)}
      </div>
    </div>
  );
});

const SessionErrorRow = memo(function SessionErrorRow({ toolCall }: SessionErrorRowProps): React.ReactElement {
  return (
    <div className="text-[10px] truncate text-text-semantic-muted" title={toolCall.output ?? toolCall.input}>
      <span style={{ color: getToolColor(toolCall.toolName) }}>{toolCall.toolName}</span>: {toolCall.output ?? toolCall.input}
    </div>
  );
});

const SessionErrorsSection = memo(function SessionErrorsSection({
  session,
}: {
  session: SessionMetrics;
}): React.ReactElement | null {
  const errorCalls = useMemo(() => session.toolCalls.filter((toolCall) => toolCall.status === 'error'), [session.toolCalls]);

  if (errorCalls.length === 0) return null;

  return (
    <div className="rounded-md p-2 mt-2 bg-surface-base" style={{ border: '1px solid var(--error, #f87171)' }}>
      <div className="text-[9px] font-medium uppercase tracking-wider mb-1 text-status-error">Errors ({session.errorCount})</div>
      <div className="flex flex-col gap-0.5 overflow-y-auto" style={{ maxHeight: '60px' }}>
        {errorCalls.map((toolCall) => <SessionErrorRow key={toolCall.id} toolCall={toolCall} />)}
      </div>
    </div>
  );
});

export const SessionDetailPanel = memo(function SessionDetailPanel({
  onClose,
  session,
}: SessionDetailPanelProps): React.ReactElement {
  return (
    <div className="px-4 py-3 border-b border-border-semantic bg-surface-raised">
      <SessionDetailHeader model={session.model} onClose={onClose} sessionId={session.sessionId} status={session.status} />
      <div className="text-[10px] mb-3 truncate text-text-semantic-muted" title={session.taskLabel}>{session.taskLabel}</div>
      <SessionTokenBreakdown inputTokens={session.inputTokens} outputTokens={session.outputTokens} totalTokens={session.totalTokens} />
      <SessionFilesSection fileEditCounts={session.fileEditCounts} />
      <SessionTimelineSection session={session} />
      <SessionErrorsSection session={session} />
    </div>
  );
});
