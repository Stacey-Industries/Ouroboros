/**
 * UsagePanel.tsx — Inline usage panel for the centre pane.
 *
 * Two tabs:
 *   "Current" — Live usage for active Claude Code session(s), read from JSONL on disk.
 *               Mirrors the output of `/usage` in the CLI.
 *   "History" — Aggregate usage across all sessions with time-range filtering.
 */

import React, { memo, useState, useEffect, useCallback, useMemo } from 'react';
import type { UsageSummary, SessionUsage, SessionDetail, WindowedUsage } from '../../types/electron';

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

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hours}h ${remainMins}m` : `${hours}h`;
}

type TimeRange = 'today' | '7d' | '30d' | 'all';

function getTimeSince(range: TimeRange): number | undefined {
  const now = Date.now();
  switch (range) {
    case 'today': { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
    case '7d': return now - 7 * 24 * 60 * 60 * 1000;
    case '30d': return now - 30 * 24 * 60 * 60 * 1000;
    case 'all': return undefined;
  }
}

function modelColor(model: string): string {
  const m = model.toLowerCase();
  if (m.includes('opus')) return '#c084fc';
  if (m.includes('sonnet')) return '#60a5fa';
  if (m.includes('haiku')) return '#34d399';
  return 'var(--text-muted)';
}

function modelShortName(model: string): string {
  const m = model.toLowerCase();
  if (m.includes('opus')) return 'Opus';
  if (m.includes('sonnet')) return 'Sonnet';
  if (m.includes('haiku')) return 'Haiku';
  return model.slice(0, 12);
}

// ─── Shared: stat row component ──────────────────────────────────────────────

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1" style={{ borderBottom: '1px solid var(--border-muted)' }}>
      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-[12px] font-semibold tabular-nums" style={{ color: color ?? 'var(--text)', fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── WINDOWED USAGE BANNER ───────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function WindowBucket({ label, tokens, cost, sub }: { label: string; tokens: number; cost: number; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5 flex-1 min-w-0 rounded-md px-3 py-2" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-muted)' }}>
      <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>{label}</span>
      <span className="text-[15px] font-bold tabular-nums leading-tight" style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{formatTokens(tokens)}</span>
      <span className="text-[9px] tabular-nums" style={{ color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{formatCost(cost)}</span>
      {sub && <span className="text-[8px] italic" style={{ color: 'var(--text-faint)', opacity: 0.7 }}>{sub}</span>}
    </div>
  );
}

const WindowSummaryBanner = memo(function WindowSummaryBanner(): React.ReactElement | null {
  const [windowed, setWindowed] = useState<WindowedUsage | null>(null);

  const load = useCallback(async () => {
    const api = window.electronAPI?.usage;
    if (!api?.getWindowedUsage) return;
    try {
      const result = await api.getWindowedUsage();
      if (result.success && result.windowed) setWindowed(result.windowed);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 10_000);
    return () => clearInterval(interval);
  }, [load]);

  if (!windowed) return null;

  return (
    <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-faint)' }}>
        Rolling Window Usage
      </div>
      <div className="flex gap-2">
        <WindowBucket label="5h session" tokens={windowed.fiveHour.totalTokens} cost={windowed.fiveHour.estimatedCost} sub="all models" />
        <WindowBucket label="Weekly" tokens={windowed.weekly.totalTokens} cost={windowed.weekly.estimatedCost} sub="7 days" />
        <WindowBucket label="Sonnet 5h" tokens={windowed.sonnetFiveHour.totalTokens} cost={windowed.sonnetFiveHour.estimatedCost} sub="sonnet only" />
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── CURRENT SESSION TAB ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const CurrentSessionTab = memo(function CurrentSessionTab(): React.ReactElement {
  const [sessions, setSessions] = useState<SessionDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadRecent = useCallback(async () => {
    const api = window.electronAPI?.usage;
    if (!api) { setIsLoading(false); return; }

    try {
      // Primary path: dedicated endpoint that reads the N most recent JSONL files
      if (api.getRecentSessions) {
        const result = await api.getRecentSessions(3);
        if (result.success && result.sessions) {
          setSessions(result.sessions);
          setIsLoading(false);
          return;
        }
      }

      // Fallback: use getSummary to find recent session IDs, then fetch details
      const summaryResult = await api.getSummary({ maxSessions: 5 });
      if (!summaryResult.success || !summaryResult.summary) { setIsLoading(false); return; }

      const recentIds = summaryResult.summary.sessions
        .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
        .slice(0, 3)
        .map((s) => s.sessionId);

      if (recentIds.length === 0) { setIsLoading(false); return; }

      const details: SessionDetail[] = [];
      for (const id of recentIds) {
        try {
          const r = await api.getSessionDetail(id);
          if (r.success && r.detail) details.push(r.detail);
        } catch { /* skip */ }
      }
      setSessions(details);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load on mount and auto-refresh every 10s
  useEffect(() => {
    void loadRecent();
    const interval = setInterval(() => void loadRecent(), 10_000);
    return () => clearInterval(interval);
  }, [loadRecent]);

  if (isLoading && sessions.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-[11px] italic" style={{ color: 'var(--text-faint)' }}>Reading session data from ~/.claude ...</span>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <svg width="32" height="32" viewBox="0 0 16 16" fill="none" stroke="var(--text-faint)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.5">
          <rect x="1" y="5" width="3" height="10" rx="0.5" />
          <rect x="6.5" y="1" width="3" height="14" rx="0.5" />
          <rect x="12" y="3" width="3" height="12" rx="0.5" />
        </svg>
        <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>No Claude Code sessions found</span>
        <span className="text-[10px]" style={{ color: 'var(--text-faint)', opacity: 0.6 }}>Session data is read from ~/.claude/projects/</span>
      </div>
    );
  }

  return (
    <div>
      <WindowSummaryBanner />
      {sessions.map((detail, idx) => {
        // The first session (most recently modified file) is likely the active one
        const isFirst = idx === 0;

        return (
          <div key={detail.sessionId} className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            {/* Session header */}
            <div className="flex items-center gap-2 mb-3">
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: isFirst ? '#34d399' : 'var(--text-faint)' }}
              />
              <span className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>
                Session {detail.sessionId.slice(0, 8)}
              </span>
              {detail.totals.model && detail.totals.model !== 'unknown' && (
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                  style={{
                    color: modelColor(detail.totals.model),
                    background: `color-mix(in srgb, ${modelColor(detail.totals.model)} 15%, transparent)`,
                  }}
                >
                  {modelShortName(detail.totals.model)}
                </span>
              )}
              {isFirst && (
                <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: '#34d399', background: 'rgba(52, 211, 153, 0.1)' }}>
                  LATEST
                </span>
              )}
            </div>

            <div className="flex flex-col gap-0">
              {/* Token breakdown */}
              <div className="rounded-md p-3 mb-2" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-muted)' }}>
                <div className="text-[9px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-faint)' }}>
                  Token Usage
                </div>
                <StatRow label="Input tokens" value={formatTokens(detail.totals.inputTokens)} />
                <StatRow label="Output tokens" value={formatTokens(detail.totals.outputTokens)} />
                <StatRow label="Cache read tokens" value={formatTokens(detail.totals.cacheReadTokens)} />
                <StatRow label="Cache write tokens" value={formatTokens(detail.totals.cacheWriteTokens)} />
                <div className="flex items-center justify-between pt-1.5 mt-1" style={{ borderTop: '1px solid var(--border)' }}>
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--text)' }}>Total tokens</span>
                  <span className="text-[13px] font-bold tabular-nums" style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                    {formatTokens(detail.totals.totalTokens)}
                  </span>
                </div>
              </div>

              {/* Cost + metadata */}
              <div className="rounded-md p-3" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-muted)' }}>
                <StatRow label="Estimated cost" value={formatCost(detail.totals.estimatedCost)} color="var(--accent)" />
                <StatRow label="API calls" value={String(detail.totals.messageCount)} />
                <StatRow label="Duration" value={formatDuration(detail.totals.durationMs)} />
                <StatRow label="Session ID" value={detail.sessionId.slice(0, 8) + '...'} />
              </div>
            </div>
          </div>
        );
      })}

      {/* Auto-refresh indicator */}
      <div className="px-4 py-2 flex items-center justify-between">
        <span className="text-[9px]" style={{ color: 'var(--text-faint)' }}>Auto-refreshes every 10s</span>
        <button
          onClick={() => void loadRecent()}
          className="text-[9px] px-2 py-0.5 rounded"
          style={{ background: 'transparent', color: 'var(--text-faint)', border: '1px solid var(--border)', cursor: 'pointer' }}
        >
          Refresh now
        </button>
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── HISTORY TAB (existing) ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const HistorySummaryCards = memo(function HistorySummaryCards({ summary }: { summary: UsageSummary }) {
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
        <div key={card.label} className="flex flex-col items-center rounded-md px-2 py-2" style={{ background: 'var(--bg-tertiary)' }}>
          <span className="text-[9px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>{card.label}</span>
          <span className="text-[15px] font-bold tabular-nums" style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{card.value}</span>
          {card.sub && <span className="text-[9px]" style={{ color: 'var(--text-faint)' }}>{card.sub}</span>}
        </div>
      ))}
    </div>
  );
});

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
      <div className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-faint)' }}>Model Distribution</div>
      <div className="flex flex-col gap-1.5">
        {models.map(([name, data]) => (
          <div key={name} className="flex items-center gap-2">
            <span className="text-[10px] font-semibold" style={{ color: modelColor(name), width: '50px', flexShrink: 0 }}>{name}</span>
            <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: 'var(--bg)' }}>
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.max((data.tokens / maxTokens) * 100, 2)}%`, background: modelColor(name), opacity: 0.7 }} />
            </div>
            <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', width: '50px', textAlign: 'right', flexShrink: 0 }}>{formatTokens(data.tokens)}</span>
            <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', width: '44px', textAlign: 'right', flexShrink: 0 }}>{formatCost(data.cost)}</span>
          </div>
        ))}
        {models.length === 0 && <span className="text-[10px] italic" style={{ color: 'var(--text-faint)' }}>No data</span>}
      </div>
    </div>
  );
});

const HistorySessionList = memo(function HistorySessionList({ sessions }: { sessions: SessionUsage[] }) {
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
      <div className="text-[10px] font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-faint)' }}>Sessions ({sessions.length})</div>
      <div className="flex items-center gap-2 py-1 text-[9px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-faint)', borderBottom: '1px solid var(--border-muted)' }}>
        <span style={{ width: '70px', flexShrink: 0 }}>When</span>
        <span className="flex-1 min-w-0">Session</span>
        <span style={{ width: '48px', flexShrink: 0, textAlign: 'right' }}>Model</span>
        <span style={{ width: '56px', flexShrink: 0, textAlign: 'right' }}>Tokens</span>
        <span style={{ width: '48px', flexShrink: 0, textAlign: 'right' }}>Cost</span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 400px)' }}>
        {sessions.map((s) => {
          const isExpanded = expanded === s.sessionId;
          const totalTokens = s.inputTokens + s.outputTokens;
          return (
            <div key={s.sessionId}>
              <button
                className="w-full flex items-center gap-2 py-1 text-[10px] tabular-nums transition-colors"
                style={{ fontFamily: 'var(--font-mono)', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-muted)', cursor: 'pointer', color: 'var(--text)', textAlign: 'left', padding: '4px 0' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                onClick={() => setExpanded((prev) => prev === s.sessionId ? null : s.sessionId)}
              >
                <span style={{ width: '70px', flexShrink: 0, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>{timeAgo(s.lastActiveAt)}</span>
                <span className="flex-1 min-w-0 truncate" style={{ fontFamily: 'var(--font-ui)' }}>{s.sessionId.slice(0, 8)}</span>
                <span style={{ width: '48px', flexShrink: 0, textAlign: 'right', color: modelColor(s.model) }}>{modelShortName(s.model)}</span>
                <span style={{ width: '56px', flexShrink: 0, textAlign: 'right', color: 'var(--text-muted)' }}>{formatTokens(totalTokens)}</span>
                <span style={{ width: '48px', flexShrink: 0, textAlign: 'right', color: 'var(--accent)', fontWeight: 600 }}>{formatCost(s.estimatedCost)}</span>
              </button>
              {isExpanded && (
                <div className="py-1.5 px-2 text-[10px]" style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-muted)', fontFamily: 'var(--font-mono)' }}>
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

const HistoryTab = memo(function HistoryTab() {
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
      if (result.success && result.summary) setSummary(result.summary);
      else setError(result.error ?? 'Failed to load usage data');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void loadUsage(range); }, [range, loadUsage]);

  const ranges: { key: TimeRange; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: '7d', label: '7 days' },
    { key: '30d', label: '30 days' },
    { key: 'all', label: 'All time' },
  ];

  return (
    <>
      {/* Time range + refresh */}
      <div className="flex items-center gap-1.5 px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        {ranges.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className="px-2 py-0.5 rounded text-[10px] transition-colors"
            style={{
              background: range === r.key ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'transparent',
              color: range === r.key ? 'var(--accent)' : 'var(--text-faint)',
              border: range === r.key ? '1px solid var(--accent)' : '1px solid transparent',
              cursor: 'pointer', fontFamily: 'var(--font-ui)',
            }}
          >
            {r.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => void loadUsage(range)}
          className="px-2 py-0.5 rounded text-[10px] transition-colors"
          style={{ background: 'transparent', color: 'var(--text-faint)', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-faint)'; }}
        >
          Refresh
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <span className="text-[11px] italic" style={{ color: 'var(--text-faint)' }}>Scanning Claude Code session files...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <span className="text-[11px]" style={{ color: 'var(--error, #f87171)' }}>{error}</span>
            <button onClick={() => void loadUsage(range)} className="text-[10px] px-3 py-1 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>Retry</button>
          </div>
        ) : summary ? (
          <>
            <HistorySummaryCards summary={summary} />
            <ModelDistribution sessions={summary.sessions} />
            <HistorySessionList sessions={summary.sessions} />
          </>
        ) : null}
      </div>
    </>
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── MAIN USAGE PANEL ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

type UsageTab = 'current' | 'history';

export interface UsagePanelProps {
  onClose: () => void;
}

export const UsagePanel = memo(function UsagePanel({ onClose }: UsagePanelProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<UsageTab>('current');

  const tabs: { key: UsageTab; label: string }[] = [
    { key: 'current', label: 'Current' },
    { key: 'history', label: 'History' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', fontFamily: 'var(--font-ui)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--accent)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="5" width="3" height="10" rx="0.5" />
            <rect x="6.5" y="1" width="3" height="14" rx="0.5" />
            <rect x="12" y="3" width="3" height="12" rx="0.5" />
          </svg>
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>Claude Code Usage</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close usage"
          style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex" style={{ borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-secondary)' }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex items-center gap-1.5 px-4 py-2 text-[12px] transition-colors"
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === tab.key ? 'var(--text)' : 'var(--text-muted)',
              fontWeight: activeTab === tab.key ? 600 : 400,
              cursor: 'pointer',
              marginBottom: '-1px',
              fontFamily: 'var(--font-ui)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {activeTab === 'current' ? <CurrentSessionTab /> : <HistoryTab />}
      </div>
    </div>
  );
});
