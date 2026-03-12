/**
 * CostDashboard.tsx — Persistent cost analytics dashboard.
 *
 * Shows summary cards (today/week/month/all-time), a daily bar chart,
 * session history table, and controls for date range filtering + clearing.
 * Loads historical cost data from disk via the cost IPC API and also
 * computes live session costs from the current app run.
 */

import React, { memo, useMemo, useState, useEffect, useCallback } from 'react';
import type { AgentSession } from './types';
import type { CostEntry } from '../../types/electron';
import { estimateCost, formatCost, formatTokenCount } from './costCalculator';

interface CostDashboardProps {
  sessions: AgentSession[];
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function toDateStr(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayStr(): string {
  return toDateStr(Date.now());
}

function daysAgo(n: number): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.getTime();
}

function formatDateShort(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

type DateRange = '7d' | '30d' | 'all';

// ─── Summary Cards ───────────────────────────────────────────────────────────

interface SummaryCardsProps {
  entries: CostEntry[];
}

const SummaryCards = memo(function SummaryCards({ entries }: SummaryCardsProps): React.ReactElement {
  const stats = useMemo(() => {
    const today = todayStr();
    const weekAgo = daysAgo(7);
    const monthAgo = daysAgo(30);

    let todayCost = 0;
    let weekCost = 0;
    let monthCost = 0;
    let allTimeCost = 0;

    for (const e of entries) {
      allTimeCost += e.estimatedCost;
      if (e.date === today) todayCost += e.estimatedCost;
      if (e.timestamp >= weekAgo) weekCost += e.estimatedCost;
      if (e.timestamp >= monthAgo) monthCost += e.estimatedCost;
    }

    return { todayCost, weekCost, monthCost, allTimeCost };
  }, [entries]);

  const cards = [
    { label: 'Today', value: stats.todayCost },
    { label: '7 Days', value: stats.weekCost },
    { label: '30 Days', value: stats.monthCost },
    { label: 'All Time', value: stats.allTimeCost },
  ];

  return (
    <div
      className="grid grid-cols-4 gap-2 px-3 py-2"
      style={{ borderBottom: '1px solid var(--border-muted)' }}
    >
      {cards.map((card) => (
        <div
          key={card.label}
          className="flex flex-col items-center rounded px-2 py-1.5"
          style={{ background: 'var(--bg-tertiary)' }}
        >
          <span
            className="text-[9px] font-medium uppercase tracking-wider"
            style={{ color: 'var(--text-faint)' }}
          >
            {card.label}
          </span>
          <span
            className="text-[14px] font-bold tabular-nums"
            style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}
          >
            {formatCost(card.value)}
          </span>
        </div>
      ))}
    </div>
  );
});

// ─── Daily Cost Chart ────────────────────────────────────────────────────────

interface DailyChartProps {
  entries: CostEntry[];
  days: number;
}

const DailyChart = memo(function DailyChart({ entries, days }: DailyChartProps): React.ReactElement {
  const chartData = useMemo(() => {
    // Build array of last N days
    const result: { date: string; cost: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const ts = daysAgo(i);
      result.push({ date: toDateStr(ts), cost: 0 });
    }

    // Accumulate costs per day
    const dateMap = new Map<string, number>();
    for (const r of result) dateMap.set(r.date, 0);
    for (const e of entries) {
      const cur = dateMap.get(e.date);
      if (cur !== undefined) {
        dateMap.set(e.date, cur + e.estimatedCost);
      }
    }
    for (const r of result) {
      r.cost = dateMap.get(r.date) ?? 0;
    }

    return result;
  }, [entries, days]);

  const maxCost = useMemo(() => Math.max(...chartData.map((d) => d.cost), 0.01), [chartData]);

  return (
    <div
      className="px-3 py-2"
      style={{ borderBottom: '1px solid var(--border-muted)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="text-[10px] font-medium uppercase tracking-wider"
          style={{ color: 'var(--text-faint)' }}
        >
          Daily Cost (Last {days} days)
        </span>
        <span
          className="text-[10px] tabular-nums ml-auto"
          style={{ color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}
        >
          max {formatCost(maxCost)}
        </span>
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-[2px]" style={{ height: '60px' }}>
        {chartData.map((day) => {
          const barHeight = maxCost > 0 ? Math.max((day.cost / maxCost) * 100, day.cost > 0 ? 3 : 0) : 0;
          return (
            <div
              key={day.date}
              className="flex-1 flex flex-col items-center justify-end"
              style={{ height: '100%' }}
              title={`${day.date}: ${formatCost(day.cost)}`}
            >
              <div
                className="w-full rounded-t"
                style={{
                  height: `${barHeight}%`,
                  background: 'var(--accent)',
                  opacity: day.cost > 0 ? 0.8 : 0.15,
                  minHeight: day.cost > 0 ? '2px' : '1px',
                  transition: 'height 300ms ease',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* X-axis labels — show every other date to avoid crowding */}
      <div className="flex gap-[2px] mt-0.5">
        {chartData.map((day, i) => (
          <div key={day.date} className="flex-1 text-center">
            {i % Math.ceil(days / 7) === 0 ? (
              <span
                className="text-[8px] tabular-nums"
                style={{ color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}
              >
                {formatDateShort(day.date)}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
});

// ─── Session History Table ───────────────────────────────────────────────────

interface SessionTableProps {
  entries: CostEntry[];
}

const SessionTable = memo(function SessionTable({ entries }: SessionTableProps): React.ReactElement {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  if (entries.length === 0) {
    return (
      <div
        className="px-3 py-4 text-center text-[11px] italic"
        style={{ color: 'var(--text-faint)' }}
      >
        No cost entries recorded yet
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      <div
        className="text-[10px] font-medium uppercase tracking-wider mb-1.5"
        style={{ color: 'var(--text-faint)' }}
      >
        Session History ({entries.length} entries)
      </div>

      {/* Table header */}
      <div
        className="flex items-center gap-2 py-1 text-[9px] font-medium uppercase tracking-wider"
        style={{ color: 'var(--text-faint)', borderBottom: '1px solid var(--border-muted)' }}
      >
        <span style={{ width: '52px', flexShrink: 0 }}>Date</span>
        <span className="flex-1 min-w-0">Task</span>
        <span style={{ width: '55px', flexShrink: 0, textAlign: 'right' }}>Model</span>
        <span style={{ width: '70px', flexShrink: 0, textAlign: 'right' }}>Tokens</span>
        <span style={{ width: '52px', flexShrink: 0, textAlign: 'right' }}>Cost</span>
      </div>

      {/* Table rows — scrollable */}
      <div
        className="overflow-y-auto"
        style={{ maxHeight: '240px' }}
      >
        {entries.map((entry) => {
          const isExpanded = expandedId === entry.sessionId;
          const label = entry.taskLabel.length > 30
            ? entry.taskLabel.slice(0, 27) + '...'
            : entry.taskLabel;
          const modelShort = entry.model.includes('opus') ? 'opus'
            : entry.model.includes('sonnet') ? 'sonnet'
            : entry.model.includes('haiku') ? 'haiku'
            : entry.model.slice(0, 8);

          return (
            <div key={entry.sessionId}>
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
                onClick={() => handleToggle(entry.sessionId)}
                title={entry.taskLabel}
              >
                <span style={{ width: '52px', flexShrink: 0, color: 'var(--text-muted)' }}>
                  {formatDateShort(entry.date)}
                </span>
                <span
                  className="flex-1 min-w-0 truncate"
                  style={{ fontFamily: 'var(--font-ui)' }}
                >
                  {label}
                </span>
                <span style={{ width: '55px', flexShrink: 0, textAlign: 'right', color: 'var(--text-muted)' }}>
                  {modelShort}
                </span>
                <span style={{ width: '70px', flexShrink: 0, textAlign: 'right', color: 'var(--text-muted)' }}>
                  {formatTokenCount(entry.inputTokens + entry.outputTokens)}
                </span>
                <span style={{ width: '52px', flexShrink: 0, textAlign: 'right', color: 'var(--accent)', fontWeight: 600 }}>
                  {formatCost(entry.estimatedCost)}
                </span>
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div
                  className="py-1.5 px-2 text-[10px]"
                  style={{
                    background: 'var(--bg-tertiary)',
                    borderBottom: '1px solid var(--border-muted)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5" style={{ color: 'var(--text-muted)' }}>
                    <span>Model: <span style={{ color: 'var(--text)' }}>{entry.model}</span></span>
                    <span>Input: <span style={{ color: 'var(--text)' }}>{formatTokenCount(entry.inputTokens)}</span></span>
                    <span>Output: <span style={{ color: 'var(--text)' }}>{formatTokenCount(entry.outputTokens)}</span></span>
                    {entry.cacheReadTokens > 0 && (
                      <span>Cache Read: <span style={{ color: 'var(--text)' }}>{formatTokenCount(entry.cacheReadTokens)}</span></span>
                    )}
                    {entry.cacheWriteTokens > 0 && (
                      <span>Cache Write: <span style={{ color: 'var(--text)' }}>{formatTokenCount(entry.cacheWriteTokens)}</span></span>
                    )}
                    <span>Session: <span style={{ color: 'var(--text)' }}>{entry.sessionId.slice(0, 8)}</span></span>
                    <span>Time: <span style={{ color: 'var(--text)' }}>{new Date(entry.timestamp).toLocaleTimeString()}</span></span>
                  </div>
                  <div className="mt-1" style={{ color: 'var(--text-faint)' }}>
                    Task: <span style={{ color: 'var(--text)' }}>{entry.taskLabel}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ─── Controls ────────────────────────────────────────────────────────────────

interface ControlsProps {
  range: DateRange;
  onRangeChange: (range: DateRange) => void;
  onClearHistory: () => void;
  entryCount: number;
}

const Controls = memo(function Controls({
  range,
  onRangeChange,
  onClearHistory,
  entryCount,
}: ControlsProps): React.ReactElement {
  const [confirmClear, setConfirmClear] = useState(false);

  const handleClear = useCallback(() => {
    if (confirmClear) {
      onClearHistory();
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      // Auto-dismiss confirmation after 3s
      setTimeout(() => setConfirmClear(false), 3000);
    }
  }, [confirmClear, onClearHistory]);

  const ranges: { key: DateRange; label: string }[] = [
    { key: '7d', label: '7 days' },
    { key: '30d', label: '30 days' },
    { key: 'all', label: 'All time' },
  ];

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5"
      style={{ borderBottom: '1px solid var(--border-muted)' }}
    >
      {/* Date range selector */}
      <div className="flex items-center gap-1">
        {ranges.map((r) => (
          <button
            key={r.key}
            onClick={() => onRangeChange(r.key)}
            className="px-1.5 py-0.5 rounded text-[10px] transition-colors"
            style={{
              background: range === r.key ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'transparent',
              color: range === r.key ? 'var(--accent)' : 'var(--text-faint)',
              border: range === r.key ? '1px solid var(--accent)' : '1px solid transparent',
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      <span className="flex-1" />

      {/* Entry count */}
      <span
        className="text-[10px] tabular-nums"
        style={{ color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}
      >
        {entryCount} entries
      </span>

      {/* Clear button */}
      {entryCount > 0 && (
        <button
          onClick={handleClear}
          className="px-1.5 py-0.5 rounded text-[10px] transition-colors"
          style={{
            background: confirmClear ? 'color-mix(in srgb, var(--error) 20%, transparent)' : 'transparent',
            color: confirmClear ? 'var(--error)' : 'var(--text-faint)',
            border: confirmClear ? '1px solid var(--error)' : '1px solid var(--border)',
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
          }}
        >
          {confirmClear ? 'Confirm Clear' : 'Clear History'}
        </button>
      )}
    </div>
  );
});

// ─── Main Component ──────────────────────────────────────────────────────────

export const CostDashboard = memo(function CostDashboard({
  sessions,
}: CostDashboardProps): React.ReactElement {
  const [historicalEntries, setHistoricalEntries] = useState<CostEntry[]>([]);
  const [range, setRange] = useState<DateRange>('30d');
  const [isLoading, setIsLoading] = useState(true);

  // Load historical cost entries from disk
  useEffect(() => {
    if (!window.electronAPI?.cost?.getHistory) {
      setIsLoading(false);
      return;
    }

    window.electronAPI.cost.getHistory().then((result) => {
      if (result.success && result.entries) {
        setHistoricalEntries(result.entries);
      }
      setIsLoading(false);
    }).catch(() => {
      setIsLoading(false);
    });
  }, []);

  // Merge live session data with historical entries (deduplicating by sessionId)
  const allEntries = useMemo(() => {
    const historicalIds = new Set(historicalEntries.map((e) => e.sessionId));
    const liveEntries: CostEntry[] = [];

    for (const session of sessions) {
      if (historicalIds.has(session.id)) continue;
      // Only include sessions that have token data
      if (session.inputTokens === 0 && session.outputTokens === 0) continue;

      const cost = estimateCost(
        session.inputTokens,
        session.outputTokens,
        session.model,
        session.cacheReadTokens,
        session.cacheWriteTokens,
      );

      const ts = session.completedAt ?? session.startedAt;
      const now = new Date(ts);
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      liveEntries.push({
        date: dateStr,
        sessionId: session.id,
        taskLabel: session.taskLabel,
        model: session.model ?? 'unknown',
        inputTokens: session.inputTokens,
        outputTokens: session.outputTokens,
        cacheReadTokens: session.cacheReadTokens ?? 0,
        cacheWriteTokens: session.cacheWriteTokens ?? 0,
        estimatedCost: cost.totalCost,
        timestamp: ts,
      });
    }

    // Merge and sort by timestamp descending
    const merged = [...historicalEntries, ...liveEntries];
    merged.sort((a, b) => b.timestamp - a.timestamp);
    return merged;
  }, [sessions, historicalEntries]);

  // Filter entries by date range
  const filteredEntries = useMemo(() => {
    if (range === 'all') return allEntries;
    const cutoff = daysAgo(range === '7d' ? 7 : 30);
    return allEntries.filter((e) => e.timestamp >= cutoff);
  }, [allEntries, range]);

  // Handle clearing
  const handleClearHistory = useCallback(() => {
    if (!window.electronAPI?.cost?.clearHistory) return;
    window.electronAPI.cost.clearHistory().then((result) => {
      if (result.success) {
        setHistoricalEntries([]);
      }
    }).catch(() => { /* non-fatal */ });
  }, []);

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center px-4 py-8"
        style={{ minHeight: '120px' }}
      >
        <span
          className="text-[11px] italic"
          style={{ color: 'var(--text-faint)' }}
        >
          Loading cost history...
        </span>
      </div>
    );
  }

  const chartDays = range === '7d' ? 7 : 14;

  return (
    <div className="flex flex-col">
      {/* Controls: range filter + clear */}
      <Controls
        range={range}
        onRangeChange={setRange}
        onClearHistory={handleClearHistory}
        entryCount={allEntries.length}
      />

      {/* Summary cards */}
      <SummaryCards entries={allEntries} />

      {/* Daily cost bar chart */}
      <DailyChart entries={allEntries} days={chartDays} />

      {/* Session history table */}
      <SessionTable entries={filteredEntries} />
    </div>
  );
});
