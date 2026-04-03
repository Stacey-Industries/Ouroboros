/**
 * UsageModalSections.parts.tsx - Session list and model distribution sub-components
 * for the modal usage view. Extracted to keep UsageModalSections.tsx under 300 lines.
 */

import type { MouseEventHandler } from 'react';
import React, { memo, useMemo, useState } from 'react';

import type { SessionUsage } from '../../types/electron';
import {
  formatCost,
  formatDate,
  formatTokens,
  getModelRows,
  getSessionTotalTokens,
  modelColor,
  modelShortName,
  timeAgo,
} from './usageModalUtils';

const sessionButtonStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid var(--border-subtle)',
  cursor: 'pointer',
  textAlign: 'left',
  padding: '4px 0',
};

function setHoverBackground(background: string): MouseEventHandler<HTMLButtonElement> {
  return (event) => {
    event.currentTarget.style.background = background;
  };
}

// ─── Model distribution ────────────────────────────────────────────────────────

function ModelRow({
  maxTokens,
  row,
}: {
  maxTokens: number;
  row: { name: string; tokens: number; cost: number };
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[10px] font-semibold"
        style={{ color: modelColor(row.name), width: '50px', flexShrink: 0 }}
      >
        {row.name}
      </span>
      <div className="flex-1 h-[6px] rounded-full overflow-hidden bg-surface-base">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${Math.max((row.tokens / maxTokens) * 100, 2)}%`,
            background: modelColor(row.name),
            opacity: 0.7,
          }}
        />
      </div>
      <span
        className="text-[10px] tabular-nums text-text-semantic-muted"
        style={{ fontFamily: 'var(--font-mono)', width: '50px', textAlign: 'right', flexShrink: 0 }}
      >
        {formatTokens(row.tokens)}
      </span>
      <span
        className="text-[10px] tabular-nums text-text-semantic-faint"
        style={{ fontFamily: 'var(--font-mono)', width: '44px', textAlign: 'right', flexShrink: 0 }}
      >
        {formatCost(row.cost)}
      </span>
    </div>
  );
}

export const ModelDistribution = memo(function ModelDistribution({
  sessions,
}: {
  sessions: SessionUsage[];
}): React.JSX.Element {
  const rows = useMemo(() => getModelRows(sessions), [sessions]);
  const maxTokens = rows[0]?.tokens ?? 1;
  return (
    <div className="px-4 py-3 border-b border-border-semantic">
      <div className="text-[10px] font-medium uppercase tracking-wider mb-2 text-text-semantic-faint">
        Model Distribution
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.length > 0 ? (
          rows.map((row) => <ModelRow key={row.name} row={row} maxTokens={maxTokens} />)
        ) : (
          <span className="text-[10px] italic text-text-semantic-faint">No data</span>
        )}
      </div>
    </div>
  );
});

// ─── Session list ──────────────────────────────────────────────────────────────

function EmptySessionState(): React.JSX.Element {
  return (
    <div className="px-4 py-6 text-center text-[11px] italic text-text-semantic-faint">
      No sessions found in Claude Code&apos;s local data
    </div>
  );
}

function SessionTableHeader({ count }: { count: number }): React.JSX.Element {
  return (
    <>
      <div className="text-[10px] font-medium uppercase tracking-wider mb-1.5 text-text-semantic-faint">
        Sessions ({count})
      </div>
      <div
        className="flex items-center gap-2 py-1 text-[9px] font-medium uppercase tracking-wider text-text-semantic-faint"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <span style={{ width: '70px', flexShrink: 0 }}>When</span>
        <span className="flex-1 min-w-0">Session</span>
        <span style={{ width: '48px', flexShrink: 0, textAlign: 'right' }}>Model</span>
        <span style={{ width: '56px', flexShrink: 0, textAlign: 'right' }}>Tokens</span>
        <span style={{ width: '48px', flexShrink: 0, textAlign: 'right' }}>Cost</span>
      </div>
    </>
  );
}

function SessionRowCells({ session }: { session: SessionUsage }): React.JSX.Element {
  return (
    <>
      <span
        className="text-text-semantic-muted"
        style={{ width: '70px', flexShrink: 0, fontFamily: 'var(--font-ui)' }}
      >
        {timeAgo(session.lastActiveAt)}
      </span>
      <span className="flex-1 min-w-0 truncate" style={{ fontFamily: 'var(--font-ui)' }}>
        {session.sessionId.slice(0, 8)}
      </span>
      <span
        style={{
          width: '48px',
          flexShrink: 0,
          textAlign: 'right',
          color: modelColor(session.model),
        }}
      >
        {modelShortName(session.model)}
      </span>
      <span
        className="text-text-semantic-muted"
        style={{ width: '56px', flexShrink: 0, textAlign: 'right' }}
      >
        {formatTokens(getSessionTotalTokens(session))}
      </span>
      <span
        className="text-interactive-accent"
        style={{ width: '48px', flexShrink: 0, textAlign: 'right', fontWeight: 600 }}
      >
        {formatCost(session.estimatedCost)}
      </span>
    </>
  );
}

function SessionDetailsTokens({ session }: { session: SessionUsage }): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-text-semantic-muted">
      <span>
        Model: <span style={{ color: modelColor(session.model) }}>{session.model}</span>
      </span>
      <span>
        Input:{' '}
        <span className="text-text-semantic-primary">{formatTokens(session.inputTokens)}</span>
      </span>
      <span>
        Output:{' '}
        <span className="text-text-semantic-primary">{formatTokens(session.outputTokens)}</span>
      </span>
      <span>
        Cache Read:{' '}
        <span className="text-text-semantic-primary">{formatTokens(session.cacheReadTokens)}</span>
      </span>
      <span>
        Cache Write:{' '}
        <span className="text-text-semantic-primary">{formatTokens(session.cacheWriteTokens)}</span>
      </span>
      <span>
        Messages: <span className="text-text-semantic-primary">{session.messageCount}</span>
      </span>
    </div>
  );
}

function SessionDetails({ session }: { session: SessionUsage }): React.JSX.Element {
  return (
    <div
      className="py-1.5 px-2 text-[10px] bg-surface-raised"
      style={{ borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)' }}
    >
      <SessionDetailsTokens session={session} />
      <div className="mt-1 flex gap-x-4 text-text-semantic-faint">
        <span>
          Started:{' '}
          <span className="text-text-semantic-primary">{formatDate(session.startedAt)}</span>
        </span>
        <span>
          Last active:{' '}
          <span className="text-text-semantic-primary">{formatDate(session.lastActiveAt)}</span>
        </span>
      </div>
    </div>
  );
}

const SessionRow = memo(function SessionRow({
  isExpanded,
  onToggle,
  session,
}: {
  isExpanded: boolean;
  onToggle: () => void;
  session: SessionUsage;
}): React.JSX.Element {
  return (
    <div>
      <button
        className="w-full flex items-center gap-2 py-1 text-[10px] tabular-nums transition-colors text-text-semantic-primary"
        style={sessionButtonStyle}
        onClick={onToggle}
        onMouseEnter={setHoverBackground('var(--surface-raised)')}
        onMouseLeave={setHoverBackground('transparent')}
      >
        <SessionRowCells session={session} />
      </button>
      {isExpanded ? <SessionDetails session={session} /> : null}
    </div>
  );
});

export const SessionList = memo(function SessionList({
  sessions,
}: {
  sessions: SessionUsage[];
}): React.JSX.Element {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (sessions.length === 0) return <EmptySessionState />;
  return (
    <div className="px-4 py-2">
      <SessionTableHeader count={sessions.length} />
      <div className="overflow-y-auto" style={{ maxHeight: '300px' }}>
        {sessions.map((session) => (
          <SessionRow
            key={session.sessionId}
            session={session}
            isExpanded={expanded === session.sessionId}
            onToggle={() =>
              setExpanded((current) => (current === session.sessionId ? null : session.sessionId))
            }
          />
        ))}
      </div>
    </div>
  );
});
