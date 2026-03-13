/**
 * UsageModal.tsx — Modal overlay showing real Claude Code usage data.
 *
 * Reads token usage from Claude Code's local JSONL session files via the
 * usage IPC API. Shows summary cards, per-session breakdown, and model
 * distribution — all based on actual API response data, not estimates.
 */

import React, { memo, useState, useEffect, useCallback, useMemo } from 'react';
import type { UsageSummary, SessionUsage } from '../../types/electron';

// ─── Formatting helpers ──────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n === 0) return '0';
  if (n < 1_000) return String(n);
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function formatCost(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Time range filter ───────────────────────────────────────────────────────

type TimeRange = 'today' | '7d' | '30d' | 'all';

function getTimeSince(range: TimeRange): number | undefined {
  const now = Date.now();
  switch (range) {
    case 'today': {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    case '7d': return now - 7 * 24 * 60 * 60 * 1000;
    case '30d': return now - 30 * 24 * 60 * 60 * 1000;
    case 'all': return undefined;
  }
}

// ─── Model badge color ───────────────────────────────────────────────────────

function modelColor(model: string): string {
  const m = model.toLowerCase();
  if (m.includes('opus')) return '#c084fc';    // purple
  if (m.includes('sonnet')) return '#60a5fa';  // blue
  if (m.includes('haiku')) return '#34d399';   // green
  return 'var(--text-muted)';
}

function modelShortName(model: string): string {
  const m = model.toLowerCase();
  if (m.includes('opus')) return 'Opus';
  if (m.includes('sonnet')) return 'Sonnet';
  if (m.includes('haiku')) return 'Haiku';
  return model.slice(0, 12);
}

// ─── Summary Cards ───────────────────────────────────────────────────────────

const SummaryCards = memo(function SummaryCards({ summary }: { summary: UsageSummary }) {
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
    <div className="grid grid-cols-3 gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      {cards.map((card) => (
        <div
          key={card.label}
          className="flex flex-col items-center rounded-md px-2 py-2"
          style={{ background: 'var(--bg-tertiary)' }}
        >
          <span className="text-[9px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
            {card.label}
          </span>
          <span
            className="text-[15px] font-bold tabular-nums"
            style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}
          >
            {card.value}
          </span>
          {card.sub && (
            <span className="text-[9px]" style={{ color: 'var(--text-faint)' }}>{card.sub}</span>
          )}
        </div>
      ))}
    </div>
  );
});

// ─── Model Distribution ─────────────────────────────────────────────────────

const ModelDistribution = memo(function ModelDistribution({ sessions }: { sessions: SessionUsage[] }) {
  const models = useMemo(() => {
    const map = new Map<string, { tokens: number; cost: number; count: number }>();
    for (const s of sessions) {
      const name = modelShortName(s.model);
      const existing = map.get(name) ?? { tokens: 0, cost: 0, count: 0 };
      existing.tokens += s.inputTokens + s.outputTokens;
      existing.cost += s.estimatedCost;
      existing.count += 1;
      map.set(name, existing);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].tokens - a[1].tokens);
  }, [sessions]);

  const maxTokens = models.length > 0 ? Math.max(...models.map(([, v]) => v.tokens)) : 1;

  return (
    <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-faint)' }}>
        Model Distribution
      </div>
      <div className="flex flex-col gap-1.5">
        {models.map(([name, data]) => (
          <div key={name} className="flex items-center gap-2">
            <span
              className="text-[10px] font-semibold"
              style={{ color: modelColor(name), width: '50px', flexShrink: 0 }}
            >
              {name}
            </span>
            <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: 'var(--bg)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.max((data.tokens / maxTokens) * 100, 2)}%`,
                  background: modelColor(name),
                  opacity: 0.7,
                }}
              />
            </div>
            <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', width: '50px', textAlign: 'right', flexShrink: 0 }}>
              {formatTokens(data.tokens)}
            </span>
            <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', width: '44px', textAlign: 'right', flexShrink: 0 }}>
              {formatCost(data.cost)}
            </span>
          </div>
        ))}
        {models.length === 0 && (
          <span className="text-[10px] italic" style={{ color: 'var(--text-faint)' }}>No data</span>
        )}
      </div>
    </div>
  );
});

// ─── Session List ────────────────────────────────────────────────────────────

const SessionList = memo(function SessionList({ sessions }: { sessions: SessionUsage[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (sessions.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[11px] italic" style={{ color: 'var(--text-faint)' }}>
        No sessions found in Claude Code's local data
      </div>
    );
  }

  return (
    <div className="px-4 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-faint)' }}>
        Sessions ({sessions.length})
      </div>

      {/* Header */}
      <div
        className="flex items-center gap-2 py-1 text-[9px] font-medium uppercase tracking-wider"
        style={{ color: 'var(--text-faint)', borderBottom: '1px solid var(--border-muted)' }}
      >
        <span style={{ width: '70px', flexShrink: 0 }}>When</span>
        <span className="flex-1 min-w-0">Session</span>
        <span style={{ width: '48px', flexShrink: 0, textAlign: 'right' }}>Model</span>
        <span style={{ width: '56px', flexShrink: 0, textAlign: 'right' }}>Tokens</span>
        <span style={{ width: '48px', flexShrink: 0, textAlign: 'right' }}>Cost</span>
      </div>

      {/* Rows */}
      <div className="overflow-y-auto" style={{ maxHeight: '300px' }}>
        {sessions.map((s) => {
          const isExpanded = expanded === s.sessionId;
          const totalTokens = s.inputTokens + s.outputTokens;

          return (
            <div key={s.sessionId}>
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
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                onClick={() => setExpanded((prev) => prev === s.sessionId ? null : s.sessionId)}
              >
                <span style={{ width: '70px', flexShrink: 0, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
                  {timeAgo(s.lastActiveAt)}
                </span>
                <span className="flex-1 min-w-0 truncate" style={{ fontFamily: 'var(--font-ui)' }}>
                  {s.sessionId.slice(0, 8)}
                </span>
                <span style={{ width: '48px', flexShrink: 0, textAlign: 'right', color: modelColor(s.model) }}>
                  {modelShortName(s.model)}
                </span>
                <span style={{ width: '56px', flexShrink: 0, textAlign: 'right', color: 'var(--text-muted)' }}>
                  {formatTokens(totalTokens)}
                </span>
                <span style={{ width: '48px', flexShrink: 0, textAlign: 'right', color: 'var(--accent)', fontWeight: 600 }}>
                  {formatCost(s.estimatedCost)}
                </span>
              </button>

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
                    <span>Model: <span style={{ color: modelColor(s.model) }}>{s.model}</span></span>
                    <span>Input: <span style={{ color: 'var(--text)' }}>{formatTokens(s.inputTokens)}</span></span>
                    <span>Output: <span style={{ color: 'var(--text)' }}>{formatTokens(s.outputTokens)}</span></span>
                    <span>Cache Read: <span style={{ color: 'var(--text)' }}>{formatTokens(s.cacheReadTokens)}</span></span>
                    <span>Cache Write: <span style={{ color: 'var(--text)' }}>{formatTokens(s.cacheWriteTokens)}</span></span>
                    <span>Messages: <span style={{ color: 'var(--text)' }}>{s.messageCount}</span></span>
                  </div>
                  <div className="mt-1 flex gap-x-4" style={{ color: 'var(--text-faint)' }}>
                    <span>Started: <span style={{ color: 'var(--text)' }}>{formatDate(s.startedAt)}</span></span>
                    <span>Last active: <span style={{ color: 'var(--text)' }}>{formatDate(s.lastActiveAt)}</span></span>
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

// ─── Main Modal ──────────────────────────────────────────────────────────────

interface UsageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UsageModal = memo(function UsageModal({ isOpen, onClose }: UsageModalProps): React.ReactElement | null {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<TimeRange>('30d');

  const loadUsage = useCallback(async (timeRange: TimeRange) => {
    if (!window.electronAPI?.usage?.getSummary) {
      setError('Usage API not available');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const since = getTimeSince(timeRange);
      const result = await window.electronAPI.usage.getSummary({ since, maxSessions: 200 });
      if (result.success && result.summary) {
        setSummary(result.summary);
      } else {
        setError(result.error ?? 'Failed to load usage data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load on open and when range changes
  useEffect(() => {
    if (isOpen) {
      void loadUsage(range);
    }
  }, [isOpen, range, loadUsage]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const ranges: { key: TimeRange; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: '7d', label: '7 days' },
    { key: '30d', label: '30 days' },
    { key: 'all', label: 'All time' },
  ];

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col rounded-lg shadow-2xl overflow-hidden"
        style={{
          width: '560px',
          maxHeight: '80vh',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          fontFamily: 'var(--font-ui)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--accent)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="5" width="3" height="10" rx="0.5" />
              <rect x="6.5" y="1" width="3" height="14" rx="0.5" />
              <rect x="12" y="3" width="3" height="12" rx="0.5" />
            </svg>
            <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
              Claude Code Usage
            </span>
            <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
              (from ~/.claude local data)
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Time range selector */}
        <div
          className="flex items-center gap-1.5 px-4 py-2 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          {ranges.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className="px-2 py-0.5 rounded text-[10px] transition-colors"
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

          <div className="flex-1" />

          {/* Refresh button */}
          <button
            onClick={() => void loadUsage(range)}
            className="px-2 py-0.5 rounded text-[10px] transition-colors"
            style={{
              background: 'transparent',
              color: 'var(--text-faint)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-faint)'; }}
          >
            Refresh
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <span className="text-[11px] italic" style={{ color: 'var(--text-faint)' }}>
                Scanning Claude Code session files...
              </span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <span className="text-[11px]" style={{ color: 'var(--error, #f87171)' }}>
                {error}
              </span>
              <button
                onClick={() => void loadUsage(range)}
                className="text-[10px] px-3 py-1 rounded"
                style={{
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </div>
          ) : summary ? (
            <>
              <SummaryCards summary={summary} />
              <ModelDistribution sessions={summary.sessions} />
              <SessionList sessions={summary.sessions} />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
});

export default UsageModal;
