/**
 * CostDashboard.tsx — Persistent cost analytics dashboard.
 */

import log from 'electron-log/renderer';
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';

import type { CostEntry } from '../../types/electron';
import { estimateCost } from './costCalculator';
import { Controls } from './CostControls';
import type { DateRange } from './costHelpers';
import { daysAgo, toDateStr } from './costHelpers';
import { DailyChart } from './DailyChart';
import { SessionTable } from './SessionTable';
import { SummaryCards } from './SummaryCards';
import type { AgentSession } from './types';

interface CostDashboardProps {
  sessions: AgentSession[];
}

function sessionToCostEntry(session: AgentSession): CostEntry | null {
  if (session.inputTokens === 0 && session.outputTokens === 0) return null;

  const cost = estimateCost({
    inputTokens: session.inputTokens,
    outputTokens: session.outputTokens,
    model: session.model,
    cacheReadTokens: session.cacheReadTokens,
    cacheWriteTokens: session.cacheWriteTokens,
  });

  const ts = session.completedAt ?? session.startedAt;
  return {
    date: toDateStr(ts),
    sessionId: session.id,
    taskLabel: session.taskLabel,
    model: session.model ?? 'unknown',
    inputTokens: session.inputTokens,
    outputTokens: session.outputTokens,
    cacheReadTokens: session.cacheReadTokens ?? 0,
    cacheWriteTokens: session.cacheWriteTokens ?? 0,
    estimatedCost: cost.totalCost,
    timestamp: ts,
  };
}

function mergeEntries(sessions: AgentSession[], historicalEntries: CostEntry[]): CostEntry[] {
  const historicalIds = new Set(historicalEntries.map((e) => e.sessionId));
  const liveEntries: CostEntry[] = [];

  for (const session of sessions) {
    if (historicalIds.has(session.id)) continue;
    const entry = sessionToCostEntry(session);
    if (entry) liveEntries.push(entry);
  }

  const merged = [...historicalEntries, ...liveEntries];
  merged.sort((a, b) => b.timestamp - a.timestamp);
  return merged;
}

export const CostDashboard = memo(function CostDashboard({
  sessions,
}: CostDashboardProps): React.ReactElement {
  const [historicalEntries, setHistoricalEntries] = useState<CostEntry[]>([]);
  const [range, setRange] = useState<DateRange>('30d');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!window.electronAPI?.cost?.getHistory) {
      setIsLoading(false);
      return;
    }
    window.electronAPI.cost
      .getHistory()
      .then((result) => {
        if (result.success && result.entries) setHistoricalEntries(result.entries);
        setIsLoading(false);
      })
      .catch((error) => {
        log.error('Failed to load cost history:', error);
        setIsLoading(false);
      });
  }, []);

  const allEntries = useMemo(
    () => mergeEntries(sessions, historicalEntries),
    [sessions, historicalEntries],
  );

  const filteredEntries = useMemo(() => {
    if (range === 'all') return allEntries;
    const cutoff = daysAgo(range === '7d' ? 7 : 30);
    return allEntries.filter((e) => e.timestamp >= cutoff);
  }, [allEntries, range]);

  const handleClearHistory = useCallback(() => {
    if (!window.electronAPI?.cost?.clearHistory) return;
    window.electronAPI.cost
      .clearHistory()
      .then((result) => {
        if (result.success) setHistoricalEntries([]);
      })
      .catch((error) => {
        log.error('Failed to clear cost history:', error);
      });
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center px-4 py-8" style={{ minHeight: '120px' }}>
        <span className="text-[11px] italic text-text-semantic-faint">Loading cost history...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <Controls
        range={range}
        onRangeChange={setRange}
        onClearHistory={handleClearHistory}
        entryCount={allEntries.length}
      />
      <SummaryCards entries={allEntries} />
      <DailyChart entries={allEntries} days={range === '7d' ? 7 : 14} />
      <SessionTable entries={filteredEntries} />
    </div>
  );
});
