/**
 * UsageHistoryTab.parts.tsx - Sub-components for UsageHistoryTab.
 * Chart, session rows, and session list extracted to keep the main file under 300 lines.
 */

import React, { useMemo, useState } from 'react';

import type { SessionUsage } from '../../types/electron';
import { formatCost, formatDate, formatTokens, modelShortName, timeAgo } from './UsagePanelShared';

// ─── Daily cost chart ──────────────────────────────────────────────────────────

interface DailyBucket {
  label: string;
  cost: number;
  tokens: number;
}

function buildDailyBuckets(sessions: SessionUsage[]): DailyBucket[] {
  const map = new Map<string, DailyBucket>();
  for (const s of sessions) {
    const d = new Date(s.startedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const bucket = map.get(key) ?? { label, cost: 0, tokens: 0 };
    bucket.cost += s.estimatedCost;
    bucket.tokens += s.inputTokens + s.outputTokens;
    map.set(key, bucket);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, b]) => b);
}

function DailyBarTooltip({ cost }: { cost: number }): React.ReactElement<any> {
  return (
    <div
      className="absolute -top-5 rounded px-1.5 py-0.5 text-[8px] font-semibold tabular-nums whitespace-nowrap bg-surface-raised text-interactive-accent"
      style={{
        border: '1px solid var(--border-subtle)',
        fontFamily: 'var(--font-mono)',
        zIndex: 1,
      }}
    >
      {formatCost(cost)}
    </div>
  );
}

function DailyBar({
  bucket,
  maxCost,
  isHovered,
  onEnter,
  onLeave,
}: {
  bucket: DailyBucket;
  maxCost: number;
  isHovered: boolean;
  onEnter: () => void;
  onLeave: () => void;
}): React.ReactElement<any> {
  const barHeight = Math.max((bucket.cost / maxCost) * 100, bucket.cost > 0 ? 3 : 0);
  return (
    <div
      className="relative flex flex-1 flex-col items-center justify-end"
      style={{ height: '100%' }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {isHovered && <DailyBarTooltip cost={bucket.cost} />}
      <div
        className="w-full rounded-t transition-opacity duration-100"
        style={{
          height: `${barHeight}%`,
          backgroundColor: 'var(--interactive-accent)',
          opacity: isHovered ? 1 : 0.6,
          minHeight: bucket.cost > 0 ? '2px' : '0',
        }}
      />
    </div>
  );
}

export function DailyCostChart({
  sessions,
}: {
  sessions: SessionUsage[];
}): React.ReactElement<any> | null {
  const buckets = useMemo(() => buildDailyBuckets(sessions), [sessions]);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (buckets.length < 2) return null;
  const maxCost = Math.max(...buckets.map((b) => b.cost));
  if (maxCost === 0) return null;

  return (
    <div className="px-4 py-3 border-b border-border-semantic">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-text-semantic-faint">
        Daily Spend
      </div>
      <div className="flex items-end gap-[3px]" style={{ height: '80px' }}>
        {buckets.map((bucket, i) => (
          <DailyBar
            key={i}
            bucket={bucket}
            maxCost={maxCost}
            isHovered={hoveredIndex === i}
            onEnter={() => setHoveredIndex(i)}
            onLeave={() => setHoveredIndex(null)}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between">
        <span className="text-[8px] text-text-semantic-faint">{buckets[0].label}</span>
        <span className="text-[8px] text-text-semantic-faint">
          {buckets[buckets.length - 1].label}
        </span>
      </div>
    </div>
  );
}

// ─── Session list ──────────────────────────────────────────────────────────────

function SessionTokenStats({ session }: { session: SessionUsage }): React.ReactElement<any> {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-text-semantic-muted">
      <span>
        Model: <span className="text-text-semantic-primary">{session.model}</span>
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

function SessionDateRange({ session }: { session: SessionUsage }): React.ReactElement<any> {
  return (
    <div className="mt-1 flex gap-x-4 text-text-semantic-faint">
      <span>
        Started: <span className="text-text-semantic-primary">{formatDate(session.startedAt)}</span>
      </span>
      <span>
        Last active:{' '}
        <span className="text-text-semantic-primary">{formatDate(session.lastActiveAt)}</span>
      </span>
    </div>
  );
}

function HistorySessionExpandedDetails({ session }: { session: SessionUsage }): React.ReactElement<any> {
  return (
    <div
      className="px-2 py-1.5 text-[10px] bg-surface-raised"
      style={{ borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)' }}
    >
      <SessionTokenStats session={session} />
      <SessionDateRange session={session} />
    </div>
  );
}

interface HistorySessionRowProps {
  session: SessionUsage;
  isExpanded: boolean;
  onToggle: () => void;
}

function SessionRowContent({ session }: { session: SessionUsage }): React.ReactElement<any> {
  const totalTokens = session.inputTokens + session.outputTokens;
  return (
    <>
      <span
        className="text-text-semantic-muted"
        style={{ width: '70px', flexShrink: 0, fontFamily: 'var(--font-ui)' }}
      >
        {timeAgo(session.lastActiveAt)}
      </span>
      <span className="min-w-0 flex-1 truncate" style={{ fontFamily: 'var(--font-ui)' }}>
        {session.sessionId.slice(0, 8)}
      </span>
      <span
        className="text-text-semantic-primary"
        style={{ width: '48px', flexShrink: 0, textAlign: 'right' }}
      >
        {modelShortName(session.model)}
      </span>
      <span
        className="text-text-semantic-muted"
        style={{ width: '56px', flexShrink: 0, textAlign: 'right' }}
      >
        {formatTokens(totalTokens)}
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

function HistorySessionRow({
  session,
  isExpanded,
  onToggle,
}: HistorySessionRowProps): React.ReactElement<any> {
  return (
    <div>
      <button
        className="flex w-full items-center gap-2 py-1 text-[10px] tabular-nums transition-colors text-text-semantic-primary"
        style={{
          fontFamily: 'var(--font-mono)',
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid var(--border-subtle)',
          cursor: 'pointer',
          textAlign: 'left',
          padding: '4px 0',
        }}
        onClick={onToggle}
      >
        <SessionRowContent session={session} />
      </button>
      {isExpanded && <HistorySessionExpandedDetails session={session} />}
    </div>
  );
}

export function HistorySessionList({ sessions }: { sessions: SessionUsage[] }): React.ReactElement<any> {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (sessions.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[11px] italic text-text-semantic-faint">
        No sessions found in Claude Code&apos;s local data
      </div>
    );
  }

  return (
    <div className="px-4 py-2">
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-semantic-faint">
        Sessions ({sessions.length})
      </div>
      <div
        className="flex items-center gap-2 py-1 text-[9px] font-medium uppercase tracking-wider text-text-semantic-faint"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <span style={{ width: '70px', flexShrink: 0 }}>When</span>
        <span className="min-w-0 flex-1">Session</span>
        <span style={{ width: '48px', flexShrink: 0, textAlign: 'right' }}>Model</span>
        <span style={{ width: '56px', flexShrink: 0, textAlign: 'right' }}>Tokens</span>
        <span style={{ width: '48px', flexShrink: 0, textAlign: 'right' }}>Cost</span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 400px)' }}>
        {sessions.map((session) => (
          <HistorySessionRow
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
}
