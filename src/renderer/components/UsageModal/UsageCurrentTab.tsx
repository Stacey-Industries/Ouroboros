import React, { memo, useCallback, useEffect, useState } from 'react';

import type { SessionDetail, UsageAPI, WindowedUsage } from '../../types/electron';
import { SessionCard } from './UsageCurrentTab.parts';
import { formatCost, formatTokens, USAGE_REFRESH_MS } from './UsagePanelShared';

const WINDOW_BUCKETS: Array<{ key: keyof WindowedUsage; label: string; sub: string }> = [
  { key: 'fiveHour', label: '5h session', sub: 'all models' },
  { key: 'weekly', label: 'Weekly', sub: '7 days' },
  { key: 'sonnetFiveHour', label: 'Sonnet 5h', sub: 'sonnet only' },
];

function usePolling(task: () => Promise<void>): void {
  useEffect(() => {
    void task();
    const interval = setInterval(() => void task(), USAGE_REFRESH_MS);
    return () => clearInterval(interval);
  }, [task]);
}

async function fetchWindowedUsage(api: UsageAPI | undefined): Promise<WindowedUsage | null> {
  if (!api?.getWindowedUsage) return null;
  try {
    const result = await api.getWindowedUsage();
    return result.success && result.windowed ? result.windowed : null;
  } catch {
    return null;
  }
}

async function fetchRecentSessionIds(api: UsageAPI): Promise<string[]> {
  const summaryResult = await api.getSummary({ maxSessions: 5 });
  if (!summaryResult.success || !summaryResult.summary) return [];
  return summaryResult.summary.sessions
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
    .slice(0, 3)
    .map((session) => session.sessionId);
}

async function fetchSessionDetails(api: UsageAPI, sessionIds: string[]): Promise<SessionDetail[]> {
  const results = await Promise.all(
    sessionIds.map(async (sessionId) => {
      try {
        return await api.getSessionDetail(sessionId);
      } catch {
        return null;
      }
    }),
  );

  return results.flatMap((result) => (result?.success && result.detail ? [result.detail] : []));
}

async function fetchRecentSessions(api: UsageAPI): Promise<SessionDetail[]> {
  if (api.getRecentSessions) {
    const result = await api.getRecentSessions(3);
    if (result.success && result.sessions) return result.sessions;
  }
  return fetchSessionDetails(api, await fetchRecentSessionIds(api));
}

function useWindowedUsage(): WindowedUsage | null {
  const [windowed, setWindowed] = useState<WindowedUsage | null>(null);
  const loadWindowed = useCallback(async () => {
    setWindowed(await fetchWindowedUsage(window.electronAPI?.usage));
  }, []);

  usePolling(loadWindowed);
  return windowed;
}

function useRecentSessions(): {
  sessions: SessionDetail[];
  isLoading: boolean;
  reload: () => Promise<void>;
} {
  const [sessions, setSessions] = useState<SessionDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const loadRecent = useCallback(async () => {
    const api = window.electronAPI?.usage;
    if (!api) return setIsLoading(false);
    try {
      setSessions(await fetchRecentSessions(api));
    } catch {
      setSessions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  usePolling(loadRecent);
  return { sessions, isLoading, reload: loadRecent };
}

function CurrentSessionLoading(): React.JSX.Element {
  return (
    <div className="flex items-center justify-center py-12">
      <span className="text-[11px] italic text-text-semantic-faint">
        Reading session data from ~/.claude ...
      </span>
    </div>
  );
}

function CurrentSessionEmpty(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <svg
        width="32"
        height="32"
        viewBox="0 0 16 16"
        fill="none"
        stroke="var(--text-faint)"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
      >
        <rect x="1" y="5" width="3" height="10" rx="0.5" />
        <rect x="6.5" y="1" width="3" height="14" rx="0.5" />
        <rect x="12" y="3" width="3" height="12" rx="0.5" />
      </svg>
      <span className="text-[11px] text-text-semantic-faint">No Claude Code sessions found</span>
      <span className="text-[10px] text-text-semantic-faint" style={{ opacity: 0.6 }}>
        Session data is read from ~/.claude/projects/
      </span>
    </div>
  );
}

function WindowBucket({
  label,
  tokens,
  cost,
  sub,
}: {
  label: string;
  tokens: number;
  cost: number;
  sub: string;
}): React.JSX.Element {
  return (
    <div
      className="flex flex-1 min-w-0 flex-col gap-0.5 rounded-md px-3 py-2 bg-surface-raised"
      style={{ border: '1px solid var(--border-subtle)' }}
    >
      <span className="text-[9px] font-semibold uppercase tracking-wider text-text-semantic-faint">
        {label}
      </span>
      <span
        className="text-[15px] font-bold tabular-nums leading-tight text-interactive-accent"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {formatTokens(tokens)}
      </span>
      <span
        className="text-[9px] tabular-nums text-text-semantic-faint"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {formatCost(cost)}
      </span>
      <span className="text-[8px] italic text-text-semantic-faint" style={{ opacity: 0.7 }}>
        {sub}
      </span>
    </div>
  );
}

function WindowSummaryBanner(): React.JSX.Element | null {
  const windowed = useWindowedUsage();
  if (!windowed) return null;

  return (
    <div className="px-4 py-3 border-b border-border-semantic">
      <div className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-text-semantic-faint">
        Rolling Window Usage
      </div>
      <div className="flex gap-2">
        {WINDOW_BUCKETS.map((bucket) => (
          <WindowBucket
            key={bucket.key}
            label={bucket.label}
            tokens={windowed[bucket.key].totalTokens}
            cost={windowed[bucket.key].estimatedCost}
            sub={bucket.sub}
          />
        ))}
      </div>
    </div>
  );
}

function CurrentSessionFooter({
  onRefresh,
}: {
  onRefresh: () => Promise<void>;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <span className="text-[9px] text-text-semantic-faint">Auto-refreshes every 10s</span>
      <button
        onClick={() => void onRefresh()}
        className="rounded px-2 py-0.5 text-[9px] text-text-semantic-faint border border-border-semantic"
        style={{ background: 'transparent', cursor: 'pointer' }}
      >
        Refresh now
      </button>
    </div>
  );
}

export const UsageCurrentTab = memo(function UsageCurrentTab(): React.JSX.Element {
  const { sessions, isLoading, reload } = useRecentSessions();
  if (isLoading && sessions.length === 0) return <CurrentSessionLoading />;
  if (sessions.length === 0) return <CurrentSessionEmpty />;

  return (
    <div>
      <WindowSummaryBanner />
      {sessions.map((detail, index) => (
        <SessionCard key={detail.sessionId} detail={detail} isLatest={index === 0} />
      ))}
      <CurrentSessionFooter onRefresh={reload} />
    </div>
  );
});
