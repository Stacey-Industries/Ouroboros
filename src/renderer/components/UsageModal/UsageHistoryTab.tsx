import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';

import type { SessionUsage, UsageSummary } from '../../types/electron';
import {
  formatCost,
  formatDate,
  formatTokens,
  getTimeSince,
  HISTORY_RANGES,
  modelShortName,
  summarizeModels,
  timeAgo,
  TimeRange,
} from './UsagePanelShared';

async function requestUsageSummary(timeRange: TimeRange): Promise<{ summary: UsageSummary | null; error: string | null }> {
  if (!window.electronAPI?.usage?.getSummary) {
    return { summary: null, error: 'Usage API not available' };
  }

  try {
    const result = await window.electronAPI.usage.getSummary({ since: getTimeSince(timeRange), maxSessions: 200 });
    if (result.success && result.summary) return { summary: result.summary, error: null };
    return { summary: null, error: result.error ?? 'Failed to load usage data' };
  } catch (error) {
    return { summary: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

function useUsageSummary(range: TimeRange): {
  summary: UsageSummary | null;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setRange: (nextRange: TimeRange) => void;
} {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState(range);
  const loadUsage = useCallback(async (timeRange: TimeRange) => {
    setIsLoading(true);
    setError(null);
    const result = await requestUsageSummary(timeRange);
    setSummary(result.summary);
    setError(result.error);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadUsage(selectedRange);
  }, [loadUsage, selectedRange]);

  return {
    summary,
    isLoading,
    error,
    reload: () => loadUsage(selectedRange),
    setRange: setSelectedRange,
  };
}

function HistoryToolbar({
  activeRange,
  onRangeChange,
  onRefresh,
}: {
  activeRange: TimeRange;
  onRangeChange: (nextRange: TimeRange) => void;
  onRefresh: () => Promise<void>;
}): React.ReactElement {
  return (
    <div className="flex flex-shrink-0 items-center gap-1.5 px-4 py-2 border-b border-border-semantic">
      {HISTORY_RANGES.map((range) => (
        <button
          key={range.key}
          onClick={() => onRangeChange(range.key)}
          className="rounded px-2 py-0.5 text-[10px] transition-colors"
          style={{
            background: activeRange === range.key ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'transparent',
            color: activeRange === range.key ? 'var(--accent)' : 'var(--text-faint)',
            border: activeRange === range.key ? '1px solid var(--accent)' : '1px solid transparent',
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
          }}
        >
          {range.label}
        </button>
      ))}
      <div className="flex-1" />
      <button
        onClick={() => void onRefresh()}
        className="rounded px-2 py-0.5 text-[10px] transition-colors text-text-semantic-faint" style={{ background: 'transparent', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
      >
        Refresh
      </button>
    </div>
  );
}

function HistorySummaryCards({ summary }: { summary: UsageSummary }): React.ReactElement {
  const { totals } = summary;
  const cards = [
    { label: 'Sessions', value: String(totals.sessionCount), sub: `${totals.messageCount} messages` },
    { label: 'Input Tokens', value: formatTokens(totals.inputTokens), sub: null },
    { label: 'Output Tokens', value: formatTokens(totals.outputTokens), sub: null },
    { label: 'Cache Read', value: formatTokens(totals.cacheReadTokens), sub: null },
    { label: 'Cache Write', value: formatTokens(totals.cacheWriteTokens), sub: null },
    { label: 'Est. Cost', value: formatCost(totals.estimatedCost), sub: null },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-border-semantic">
      {cards.map((card) => (
        <div key={card.label} className="flex flex-col items-center rounded-md px-2 py-2 bg-surface-raised">
          <span className="text-[9px] font-medium uppercase tracking-wider text-text-semantic-faint">{card.label}</span>
          <span className="text-[15px] font-bold tabular-nums text-interactive-accent" style={{ fontFamily: 'var(--font-mono)' }}>{card.value}</span>
          {card.sub && <span className="text-[9px] text-text-semantic-faint">{card.sub}</span>}
        </div>
      ))}
    </div>
  );
}

function ModelDistribution({ sessions }: { sessions: SessionUsage[] }): React.ReactElement {
  const models = useMemo(() => summarizeModels(sessions), [sessions]);
  const maxTokens = models.length > 0 ? Math.max(...models.map((model) => model.tokens)) : 1;

  return (
    <div className="px-4 py-3 border-b border-border-semantic">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-text-semantic-faint">Model Distribution</div>
      <div className="flex flex-col gap-1.5">
        {models.map((model) => (
          <div key={model.name} className="flex items-center gap-2">
            <span className="text-[10px] font-semibold" style={{ color: model.color, width: '50px', flexShrink: 0 }}>{model.name}</span>
            <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-surface-base">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.max((model.tokens / maxTokens) * 100, 2)}%`, background: model.color, opacity: 0.7 }} />
            </div>
            <span className="text-[10px] tabular-nums text-text-semantic-muted" style={{ fontFamily: 'var(--font-mono)', width: '50px', textAlign: 'right', flexShrink: 0 }}>{formatTokens(model.tokens)}</span>
            <span className="text-[10px] tabular-nums text-text-semantic-faint" style={{ fontFamily: 'var(--font-mono)', width: '44px', textAlign: 'right', flexShrink: 0 }}>{formatCost(model.cost)}</span>
          </div>
        ))}
        {models.length === 0 && <span className="text-[10px] italic text-text-semantic-faint">No data</span>}
      </div>
    </div>
  );
}

// ── Daily Cost Chart ─────────────────────────────────────────────────────

interface DailyBucket {
  label: string;
  cost: number;
  tokens: number;
}

function buildDailyBuckets(sessions: SessionUsage[]): DailyBucket[] {
  const bucketMap = new Map<string, DailyBucket>();

  for (const session of sessions) {
    const date = new Date(session.startedAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const label = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const bucket = bucketMap.get(key) ?? { label, cost: 0, tokens: 0 };
    bucket.cost += session.estimatedCost;
    bucket.tokens += session.inputTokens + session.outputTokens;
    bucketMap.set(key, bucket);
  }

  // Sort by date key (YYYY-MM-DD sorts naturally)
  return Array.from(bucketMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, bucket]) => bucket);
}

function DailyCostChart({ sessions }: { sessions: SessionUsage[] }): React.ReactElement | null {
  const buckets = useMemo(() => buildDailyBuckets(sessions), [sessions]);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (buckets.length < 2) return null;

  const maxCost = Math.max(...buckets.map((b) => b.cost));
  if (maxCost === 0) return null;

  return (
    <div className="px-4 py-3 border-b border-border-semantic">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-text-semantic-faint">Daily Spend</div>
      <div className="flex items-end gap-[3px]" style={{ height: '80px' }}>
        {buckets.map((bucket, i) => {
          const barHeight = Math.max((bucket.cost / maxCost) * 100, bucket.cost > 0 ? 3 : 0);
          const isHovered = hoveredIndex === i;
          return (
            <div
              key={i}
              className="relative flex flex-1 flex-col items-center justify-end"
              style={{ height: '100%' }}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {isHovered && (
                <div
                  className="absolute -top-5 rounded px-1.5 py-0.5 text-[8px] font-semibold tabular-nums whitespace-nowrap bg-surface-raised text-interactive-accent"
                  style={{ border: '1px solid var(--border-muted)', fontFamily: 'var(--font-mono)', zIndex: 1 }}
                >
                  {formatCost(bucket.cost)}
                </div>
              )}
              <div
                className="w-full rounded-t transition-opacity duration-100"
                style={{
                  height: `${barHeight}%`,
                  backgroundColor: 'var(--accent)',
                  opacity: isHovered ? 1 : 0.6,
                  minHeight: bucket.cost > 0 ? '2px' : '0',
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between">
        <span className="text-[8px] text-text-semantic-faint">{buckets[0].label}</span>
        <span className="text-[8px] text-text-semantic-faint">{buckets[buckets.length - 1].label}</span>
      </div>
    </div>
  );
}

function HistorySessionExpandedDetails({ session }: { session: SessionUsage }): React.ReactElement {
  return (
    <div className="px-2 py-1.5 text-[10px] bg-surface-raised" style={{ borderBottom: '1px solid var(--border-muted)', fontFamily: 'var(--font-mono)' }}>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-text-semantic-muted">
        <span>Model: <span className="text-text-semantic-primary">{session.model}</span></span>
        <span>Input: <span className="text-text-semantic-primary">{formatTokens(session.inputTokens)}</span></span>
        <span>Output: <span className="text-text-semantic-primary">{formatTokens(session.outputTokens)}</span></span>
        <span>Cache Read: <span className="text-text-semantic-primary">{formatTokens(session.cacheReadTokens)}</span></span>
        <span>Cache Write: <span className="text-text-semantic-primary">{formatTokens(session.cacheWriteTokens)}</span></span>
        <span>Messages: <span className="text-text-semantic-primary">{session.messageCount}</span></span>
      </div>
      <div className="mt-1 flex gap-x-4 text-text-semantic-faint">
        <span>Started: <span className="text-text-semantic-primary">{formatDate(session.startedAt)}</span></span>
        <span>Last active: <span className="text-text-semantic-primary">{formatDate(session.lastActiveAt)}</span></span>
      </div>
    </div>
  );
}

function HistorySessionRow({
  session,
  isExpanded,
  onToggle,
}: {
  session: SessionUsage;
  isExpanded: boolean;
  onToggle: () => void;
}): React.ReactElement {
  const totalTokens = session.inputTokens + session.outputTokens;

  return (
    <div>
      <button
        className="flex w-full items-center gap-2 py-1 text-[10px] tabular-nums transition-colors text-text-semantic-primary"
        style={{ fontFamily: 'var(--font-mono)', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-muted)', cursor: 'pointer', textAlign: 'left', padding: '4px 0' }}
        onClick={onToggle}
      >
        <span className="text-text-semantic-muted" style={{ width: '70px', flexShrink: 0, fontFamily: 'var(--font-ui)' }}>{timeAgo(session.lastActiveAt)}</span>
        <span className="min-w-0 flex-1 truncate" style={{ fontFamily: 'var(--font-ui)' }}>{session.sessionId.slice(0, 8)}</span>
        <span className="text-text-semantic-primary" style={{ width: '48px', flexShrink: 0, textAlign: 'right' }}>{modelShortName(session.model)}</span>
        <span className="text-text-semantic-muted" style={{ width: '56px', flexShrink: 0, textAlign: 'right' }}>{formatTokens(totalTokens)}</span>
        <span className="text-interactive-accent" style={{ width: '48px', flexShrink: 0, textAlign: 'right', fontWeight: 600 }}>{formatCost(session.estimatedCost)}</span>
      </button>
      {isExpanded && <HistorySessionExpandedDetails session={session} />}
    </div>
  );
}

function HistorySessionList({ sessions }: { sessions: SessionUsage[] }): React.ReactElement {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (sessions.length === 0) {
    return <div className="px-4 py-6 text-center text-[11px] italic text-text-semantic-faint">No sessions found in Claude Code&apos;s local data</div>;
  }

  return (
    <div className="px-4 py-2">
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-semantic-faint">Sessions ({sessions.length})</div>
      <div className="flex items-center gap-2 py-1 text-[9px] font-medium uppercase tracking-wider text-text-semantic-faint" style={{ borderBottom: '1px solid var(--border-muted)' }}>
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
            onToggle={() => setExpanded((current) => current === session.sessionId ? null : session.sessionId)}
          />
        ))}
      </div>
    </div>
  );
}

function HistoryContent({
  summary,
  isLoading,
  error,
  onRetry,
}: {
  summary: UsageSummary | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => Promise<void>;
}): React.ReactElement | null {
  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><span className="text-[11px] italic text-text-semantic-faint">Scanning Claude Code session files...</span></div>;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12">
        <span className="text-[11px] text-status-error">{error}</span>
        <button onClick={() => void onRetry()} className="rounded px-3 py-1 text-[10px] bg-surface-raised text-text-semantic-muted border border-border-semantic" style={{ cursor: 'pointer' }}>Retry</button>
      </div>
    );
  }

  return summary ? <><HistorySummaryCards summary={summary} /><ModelDistribution sessions={summary.sessions} /><DailyCostChart sessions={summary.sessions} /><HistorySessionList sessions={summary.sessions} /></> : null;
}

export const UsageHistoryTab = memo(function UsageHistoryTab(): React.ReactElement {
  const [activeRange, setActiveRange] = useState<TimeRange>('30d');
  const { summary, isLoading, error, reload, setRange } = useUsageSummary(activeRange);
  const handleRangeChange = useCallback((nextRange: TimeRange) => {
    setActiveRange(nextRange);
    setRange(nextRange);
  }, [setRange]);

  return (
    <>
      <HistoryToolbar activeRange={activeRange} onRangeChange={handleRangeChange} onRefresh={reload} />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <HistoryContent summary={summary} isLoading={isLoading} error={error} onRetry={reload} />
      </div>
    </>
  );
});
