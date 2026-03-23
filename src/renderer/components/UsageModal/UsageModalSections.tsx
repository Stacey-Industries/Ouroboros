import type { CSSProperties, MouseEventHandler } from 'react';
import React, { memo, useMemo, useState } from 'react';

import type { SessionUsage, UsageSummary } from '../../types/electron';
import {
  formatCost,
  formatDate,
  formatTokens,
  getModelRows,
  getSessionTotalTokens,
  getSummaryCards,
  modelColor,
  modelShortName,
  type SummaryCardData,
  TIME_RANGE_OPTIONS,
  timeAgo,
  type TimeRange,
} from './usageModalUtils';

const sessionButtonStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid var(--border-subtle)',
  cursor: 'pointer',
  textAlign: 'left',
  padding: '4px 0',
};

function setHoverColor(color: string): MouseEventHandler<HTMLButtonElement> {
  return (event) => {
    event.currentTarget.style.color = color;
  };
}

function setHoverBackground(background: string): MouseEventHandler<HTMLButtonElement> {
  return (event) => {
    event.currentTarget.style.background = background;
  };
}

export const UsageModalHeader = memo(function UsageModalHeader({
  onClose,
}: {
  onClose: () => void;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0 border-b border-border-semantic">
      <div className="flex items-center gap-2">
        <UsageIcon />
        <span className="text-[13px] font-semibold text-text-semantic-primary">
          Claude Code Usage
        </span>
        <span className="text-[10px] text-text-semantic-faint">(from ~/.claude local data)</span>
      </div>
      <button
        onClick={onClose}
        className="text-text-semantic-muted"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onMouseEnter={setHoverColor('var(--text-primary)')}
        onMouseLeave={setHoverColor('var(--text-muted)')}
      >
        <CloseIcon />
      </button>
    </div>
  );
});

function UsageIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="var(--interactive-accent)"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="5" width="3" height="10" rx="0.5" />
      <rect x="6.5" y="1" width="3" height="14" rx="0.5" />
      <rect x="12" y="3" width="3" height="12" rx="0.5" />
    </svg>
  );
}

function CloseIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

interface UsageRangeControlsProps {
  range: TimeRange;
  onRangeChange: (range: TimeRange) => void;
  onRefresh: () => void;
}

export const UsageRangeControls = memo(function UsageRangeControls({
  range,
  onRangeChange,
  onRefresh,
}: UsageRangeControlsProps): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5 px-4 py-2 flex-shrink-0 border-b border-border-semantic">
      {TIME_RANGE_OPTIONS.map((option) => (
        <RangeButton
          key={option.key}
          option={option}
          isActive={range === option.key}
          onClick={onRangeChange}
        />
      ))}
      <div className="flex-1" />
      <button
        onClick={onRefresh}
        className="px-2 py-0.5 rounded text-[10px] transition-colors text-text-semantic-faint border border-border-semantic"
        style={{ background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
        onMouseEnter={setHoverColor('var(--text-primary)')}
        onMouseLeave={setHoverColor('var(--text-faint)')}
      >
        Refresh
      </button>
    </div>
  );
});

interface RangeButtonProps {
  isActive: boolean;
  onClick: (range: TimeRange) => void;
  option: { key: TimeRange; label: string };
}

const RangeButton = memo(function RangeButton({
  isActive,
  onClick,
  option,
}: RangeButtonProps): React.ReactElement {
  return (
    <button
      onClick={() => onClick(option.key)}
      className="px-2 py-0.5 rounded text-[10px] transition-colors"
      style={{
        background: isActive
          ? 'color-mix(in srgb, var(--interactive-accent) 20%, transparent)'
          : 'transparent',
        color: isActive ? 'var(--interactive-accent)' : 'var(--text-faint)',
        border: isActive ? '1px solid var(--interactive-accent)' : '1px solid transparent',
        cursor: 'pointer',
        fontFamily: 'var(--font-ui)',
      }}
    >
      {option.label}
    </button>
  );
});

interface UsageModalContentProps {
  error: string | null;
  isLoading: boolean;
  onRetry: () => void;
  summary: UsageSummary | null;
}

export const UsageModalContent = memo(function UsageModalContent({
  error,
  isLoading,
  onRetry,
  summary,
}: UsageModalContentProps): React.ReactElement {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {getUsageContent(summary, isLoading, error, onRetry)}
    </div>
  );
});

function getUsageContent(
  summary: UsageSummary | null,
  isLoading: boolean,
  error: string | null,
  onRetry: () => void,
): React.ReactNode {
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!summary) return null;
  return (
    <>
      <SummaryCards summary={summary} />
      <ModelDistribution sessions={summary.sessions} />
      <SessionList sessions={summary.sessions} />
    </>
  );
}

function LoadingState(): React.ReactElement {
  return (
    <div className="flex items-center justify-center py-12">
      <span className="text-[11px] italic text-text-semantic-faint">
        Scanning Claude Code session files...
      </span>
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2">
      <span className="text-[11px] text-status-error">{error}</span>
      <button
        onClick={onRetry}
        className="text-[10px] px-3 py-1 rounded bg-surface-raised text-text-semantic-muted border border-border-semantic"
        style={{ cursor: 'pointer' }}
      >
        Retry
      </button>
    </div>
  );
}

const SummaryCards = memo(function SummaryCards({
  summary,
}: {
  summary: UsageSummary;
}): React.ReactElement {
  return (
    <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-border-semantic">
      {getSummaryCards(summary.totals).map((card) => (
        <SummaryCard key={card.label} card={card} />
      ))}
    </div>
  );
});

function SummaryCard({ card }: { card: SummaryCardData }): React.ReactElement {
  return (
    <div className="flex flex-col items-center rounded-md px-2 py-2 bg-surface-raised">
      <span className="text-[9px] font-medium uppercase tracking-wider text-text-semantic-faint">
        {card.label}
      </span>
      <span
        className="text-[15px] font-bold tabular-nums text-interactive-accent"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {card.value}
      </span>
      {card.sub ? <span className="text-[9px] text-text-semantic-faint">{card.sub}</span> : null}
    </div>
  );
}

const ModelDistribution = memo(function ModelDistribution({
  sessions,
}: {
  sessions: SessionUsage[];
}): React.ReactElement {
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

function ModelRow({
  maxTokens,
  row,
}: {
  maxTokens: number;
  row: { name: string; tokens: number; cost: number };
}): React.ReactElement {
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

const SessionList = memo(function SessionList({
  sessions,
}: {
  sessions: SessionUsage[];
}): React.ReactElement {
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

function EmptySessionState(): React.ReactElement {
  return (
    <div className="px-4 py-6 text-center text-[11px] italic text-text-semantic-faint">
      No sessions found in Claude Code&apos;s local data
    </div>
  );
}

function SessionTableHeader({ count }: { count: number }): React.ReactElement {
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

interface SessionRowProps {
  isExpanded: boolean;
  onToggle: () => void;
  session: SessionUsage;
}

const SessionRow = memo(function SessionRow({
  isExpanded,
  onToggle,
  session,
}: SessionRowProps): React.ReactElement {
  return (
    <div>
      <button
        className="w-full flex items-center gap-2 py-1 text-[10px] tabular-nums transition-colors text-text-semantic-primary"
        style={sessionButtonStyle}
        onClick={onToggle}
        onMouseEnter={setHoverBackground('var(--surface-raised)')}
        onMouseLeave={setHoverBackground('transparent')}
      >
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
      </button>
      {isExpanded ? <SessionDetails session={session} /> : null}
    </div>
  );
});

function SessionDetails({ session }: { session: SessionUsage }): React.ReactElement {
  return (
    <div
      className="py-1.5 px-2 text-[10px] bg-surface-raised"
      style={{ borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)' }}
    >
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
          <span className="text-text-semantic-primary">
            {formatTokens(session.cacheReadTokens)}
          </span>
        </span>
        <span>
          Cache Write:{' '}
          <span className="text-text-semantic-primary">
            {formatTokens(session.cacheWriteTokens)}
          </span>
        </span>
        <span>
          Messages: <span className="text-text-semantic-primary">{session.messageCount}</span>
        </span>
      </div>
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
