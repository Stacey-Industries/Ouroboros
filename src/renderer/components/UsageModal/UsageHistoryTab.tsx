import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';

import type { SessionUsage, UsageSummary } from '../../types/electron';
import { DailyCostChart, HistorySessionList } from './UsageHistoryTab.parts';
import {
  formatCost,
  formatTokens,
  getTimeSince,
  HISTORY_RANGES,
  summarizeModels,
  TimeRange,
} from './UsagePanelShared';

async function requestUsageSummary(
  timeRange: TimeRange,
): Promise<{ summary: UsageSummary | null; error: string | null }> {
  if (!window.electronAPI?.usage?.getSummary) {
    return { summary: null, error: 'Usage API not available' };
  }

  try {
    const result = await window.electronAPI.usage.getSummary({
      since: getTimeSince(timeRange),
      maxSessions: 200,
    });
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

function RangeButton({
  rangeKey,
  label,
  isActive,
  onClick,
}: {
  rangeKey: TimeRange;
  label: string;
  isActive: boolean;
  onClick: (key: TimeRange) => void;
}): React.JSX.Element {
  return (
    <button
      onClick={() => onClick(rangeKey)}
      className="rounded px-2 py-0.5 text-[10px] transition-colors"
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
      {label}
    </button>
  );
}

function HistoryToolbar({
  activeRange,
  onRangeChange,
  onRefresh,
}: {
  activeRange: TimeRange;
  onRangeChange: (nextRange: TimeRange) => void;
  onRefresh: () => Promise<void>;
}): React.JSX.Element {
  return (
    <div className="flex flex-shrink-0 items-center gap-1.5 px-4 py-2 border-b border-border-semantic">
      {HISTORY_RANGES.map((range) => (
        <RangeButton
          key={range.key}
          rangeKey={range.key}
          label={range.label}
          isActive={activeRange === range.key}
          onClick={onRangeChange}
        />
      ))}
      <div className="flex-1" />
      <button
        onClick={() => void onRefresh()}
        className="rounded px-2 py-0.5 text-[10px] transition-colors text-text-semantic-faint"
        style={{
          background: 'transparent',
          border: '1px solid var(--border-default)',
          cursor: 'pointer',
          fontFamily: 'var(--font-ui)',
        }}
      >
        Refresh
      </button>
    </div>
  );
}

function HistorySummaryCards({ summary }: { summary: UsageSummary }): React.JSX.Element {
  const { totals } = summary;
  const cards = [
    {
      label: 'Sessions',
      value: String(totals.sessionCount),
      sub: `${totals.messageCount} messages`,
    },
    { label: 'Input Tokens', value: formatTokens(totals.inputTokens), sub: null },
    { label: 'Output Tokens', value: formatTokens(totals.outputTokens), sub: null },
    { label: 'Cache Read', value: formatTokens(totals.cacheReadTokens), sub: null },
    { label: 'Cache Write', value: formatTokens(totals.cacheWriteTokens), sub: null },
    { label: 'Est. Cost', value: formatCost(totals.estimatedCost), sub: null },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-border-semantic">
      {cards.map((card) => (
        <div
          key={card.label}
          className="flex flex-col items-center rounded-md px-2 py-2 bg-surface-raised"
        >
          <span className="text-[9px] font-medium uppercase tracking-wider text-text-semantic-faint">
            {card.label}
          </span>
          <span
            className="text-[15px] font-bold tabular-nums text-interactive-accent"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {card.value}
          </span>
          {card.sub && <span className="text-[9px] text-text-semantic-faint">{card.sub}</span>}
        </div>
      ))}
    </div>
  );
}

type ModelSummary = ReturnType<typeof summarizeModels>[number];

function ModelBar({
  model,
  maxTokens,
}: {
  model: ModelSummary;
  maxTokens: number;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[10px] font-semibold"
        style={{ color: model.color, width: '50px', flexShrink: 0 }}
      >
        {model.name}
      </span>
      <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-surface-base">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${Math.max((model.tokens / maxTokens) * 100, 2)}%`,
            background: model.color,
            opacity: 0.7,
          }}
        />
      </div>
      <span
        className="text-[10px] tabular-nums text-text-semantic-muted"
        style={{ fontFamily: 'var(--font-mono)', width: '50px', textAlign: 'right', flexShrink: 0 }}
      >
        {formatTokens(model.tokens)}
      </span>
      <span
        className="text-[10px] tabular-nums text-text-semantic-faint"
        style={{ fontFamily: 'var(--font-mono)', width: '44px', textAlign: 'right', flexShrink: 0 }}
      >
        {formatCost(model.cost)}
      </span>
    </div>
  );
}

function ModelDistribution({ sessions }: { sessions: SessionUsage[] }): React.JSX.Element {
  const models = useMemo(() => summarizeModels(sessions), [sessions]);
  const maxTokens = models.length > 0 ? Math.max(...models.map((m) => m.tokens)) : 1;
  return (
    <div className="px-4 py-3 border-b border-border-semantic">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-text-semantic-faint">
        Model Distribution
      </div>
      <div className="flex flex-col gap-1.5">
        {models.map((model) => (
          <ModelBar key={model.name} model={model} maxTokens={maxTokens} />
        ))}
        {models.length === 0 && (
          <span className="text-[10px] italic text-text-semantic-faint">No data</span>
        )}
      </div>
    </div>
  );
}

interface HistoryContentProps {
  summary: UsageSummary | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => Promise<void>;
}

function HistoryContent({
  summary,
  isLoading,
  error,
  onRetry,
}: HistoryContentProps): React.JSX.Element | null {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-[11px] italic text-text-semantic-faint">
          Scanning Claude Code session files...
        </span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12">
        <span className="text-[11px] text-status-error">{error}</span>
        <button
          onClick={() => void onRetry()}
          className="rounded px-3 py-1 text-[10px] bg-surface-raised text-text-semantic-muted border border-border-semantic"
          style={{ cursor: 'pointer' }}
        >
          Retry
        </button>
      </div>
    );
  }
  return summary ? (
    <>
      <HistorySummaryCards summary={summary} />
      <ModelDistribution sessions={summary.sessions} />
      <DailyCostChart sessions={summary.sessions} />
      <HistorySessionList sessions={summary.sessions} />
    </>
  ) : null;
}

export const UsageHistoryTab = memo(function UsageHistoryTab(): React.JSX.Element {
  const [activeRange, setActiveRange] = useState<TimeRange>('30d');
  const { summary, isLoading, error, reload, setRange } = useUsageSummary(activeRange);
  const handleRangeChange = useCallback(
    (nextRange: TimeRange) => {
      setActiveRange(nextRange);
      setRange(nextRange);
    },
    [setRange],
  );

  return (
    <>
      <HistoryToolbar
        activeRange={activeRange}
        onRangeChange={handleRangeChange}
        onRefresh={reload}
      />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <HistoryContent summary={summary} isLoading={isLoading} error={error} onRetry={reload} />
      </div>
    </>
  );
});
