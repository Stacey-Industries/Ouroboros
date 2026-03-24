import React, { memo, useMemo } from 'react';

import type {
  AggregateMetrics,
  SessionMetrics,
  ToolDistributionEntry,
} from '../../hooks/useSessionAnalytics';
import {
  formatPercent,
  formatTokens,
  getEfficiencyTrend,
  getSparklinePoints,
  getToolColor,
} from './analyticsDashboardFormatting';

interface SummaryCardProps {
  label: string;
  value: string;
  sub?: string;
}

interface AnalyticsSummaryGridProps {
  aggregate: AggregateMetrics;
}

interface ToolDistributionChartProps {
  distribution: ToolDistributionEntry[];
}

interface ToolDistributionRowProps {
  entry: ToolDistributionEntry;
  maxCount: number;
}

interface EfficiencySparklineProps {
  sessions: SessionMetrics[];
}

interface SparklineDotsProps {
  points: { x: number; y: number }[];
}

const SummaryCard = memo(function SummaryCard({
  label,
  value,
  sub,
}: SummaryCardProps): React.ReactElement {
  return (
    <div
      className="flex flex-col items-center rounded-md px-2 py-2 min-w-0 bg-surface-raised"
      style={{ border: '1px solid var(--border-subtle)' }}
    >
      <span className="text-[9px] font-semibold uppercase tracking-wider text-text-semantic-faint">
        {label}
      </span>
      <span
        className="text-[15px] font-bold tabular-nums leading-tight text-interactive-accent"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {value}
      </span>
      {sub ? <span className="text-[9px] text-text-semantic-faint">{sub}</span> : null}
    </div>
  );
});

export const AnalyticsSummaryGrid = memo(function AnalyticsSummaryGrid({
  aggregate,
}: AnalyticsSummaryGridProps): React.ReactElement {
  return (
    <div className="grid grid-cols-2 gap-2 px-4 py-3 border-b border-border-semantic">
      <SummaryCard
        label="Sessions"
        value={String(aggregate.totalSessions)}
        sub={`${aggregate.totalToolCalls} tool calls`}
      />
      <SummaryCard
        label="Tokens / Edit"
        value={
          aggregate.avgTokensPerEdit > 0
            ? formatTokens(Math.round(aggregate.avgTokensPerEdit))
            : '--'
        }
        sub={`${aggregate.totalFileEdits} edits total`}
      />
      <SummaryCard
        label="Retry Rate"
        value={formatPercent(aggregate.avgRetryRate)}
        sub="3+ edits = retry"
      />
      <SummaryCard
        label="Error Rate"
        value={formatPercent(aggregate.errorRate)}
        sub={`${aggregate.totalErrors} errors`}
      />
    </div>
  );
});

function ToolDistributionBar({
  entry,
  maxCount,
}: {
  entry: ToolDistributionEntry;
  maxCount: number;
}): React.ReactElement {
  return (
    <div className="flex-1 h-[6px] rounded-full overflow-hidden bg-surface-base">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{
          width: `${Math.max((entry.count / maxCount) * 100, 2)}%`,
          background: getToolColor(entry.toolName),
          opacity: 0.7,
        }}
      />
    </div>
  );
}

const MONO_FIXED = (width: string): React.CSSProperties => ({
  fontFamily: 'var(--font-mono)',
  width,
  textAlign: 'right',
  flexShrink: 0,
});

const ToolDistributionRow = memo(function ToolDistributionRow({
  entry,
  maxCount,
}: ToolDistributionRowProps): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[10px] font-semibold truncate"
        style={{ color: getToolColor(entry.toolName), width: '56px', flexShrink: 0 }}
        title={entry.toolName}
      >
        {entry.toolName}
      </span>
      <ToolDistributionBar entry={entry} maxCount={maxCount} />
      <span
        className="text-[10px] tabular-nums text-text-semantic-muted"
        style={MONO_FIXED('32px')}
      >
        {entry.count}
      </span>
      <span
        className="text-[10px] tabular-nums text-text-semantic-faint"
        style={MONO_FIXED('36px')}
      >
        {formatPercent(entry.percentage)}
      </span>
      {entry.errorCount > 0 ? (
        <span
          className="text-[9px] tabular-nums text-status-error"
          style={MONO_FIXED('24px')}
          title={`${entry.errorCount} error(s)`}
        >
          {entry.errorCount}err
        </span>
      ) : null}
    </div>
  );
});

export const ToolDistributionChart = memo(function ToolDistributionChart({
  distribution,
}: ToolDistributionChartProps): React.ReactElement {
  if (distribution.length === 0) {
    return (
      <div className="px-4 py-3 border-b border-border-semantic">
        <div className="text-[10px] font-medium uppercase tracking-wider mb-2 text-text-semantic-faint">
          Tool Distribution
        </div>
        <span className="text-[10px] italic text-text-semantic-faint">No tool calls recorded</span>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-b border-border-semantic">
      <div className="text-[10px] font-medium uppercase tracking-wider mb-2 text-text-semantic-faint">
        Tool Distribution
      </div>
      <div className="flex flex-col gap-1">
        {distribution.map((entry) => (
          <ToolDistributionRow
            key={entry.toolName}
            entry={entry}
            maxCount={distribution[0].count}
          />
        ))}
      </div>
    </div>
  );
});

const SparklineDots = memo(function SparklineDots({
  points,
}: SparklineDotsProps): React.ReactElement {
  return (
    <>
      {points.map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r="2"
          fill="var(--interactive-accent)"
          opacity="0.6"
        />
      ))}
    </>
  );
});

export const EfficiencySparkline = memo(function EfficiencySparkline({
  sessions,
}: EfficiencySparklineProps): React.ReactElement | null {
  const dataPoints = useMemo(() => getEfficiencyTrend(sessions), [sessions]);
  const points = useMemo(() => getSparklinePoints(dataPoints, 200, 40, 2), [dataPoints]);

  if (dataPoints.length < 2) return null;

  return (
    <div className="px-4 py-3 border-b border-border-semantic">
      <div className="text-[10px] font-medium uppercase tracking-wider mb-2 text-text-semantic-faint">
        Tokens per Edit Trend (lower is better)
      </div>
      <svg width="200" height="40" viewBox="0 0 200 40" style={{ overflow: 'visible' }}>
        <polyline
          points={points.map((point) => `${point.x},${point.y}`).join(' ')}
          fill="none"
          stroke="var(--interactive-accent)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.8"
        />
        <SparklineDots points={points} />
      </svg>
      <div
        className="flex justify-between text-[9px] tabular-nums mt-1 text-text-semantic-faint"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <span>{formatTokens(Math.round(dataPoints[0]))}</span>
        <span>{formatTokens(Math.round(dataPoints[dataPoints.length - 1]))}</span>
      </div>
    </div>
  );
});

export const AnalyticsEmptyState = memo(function AnalyticsEmptyState(): React.ReactElement {
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
        <path d="M1 12 L4 4 L7 8 L10 2 L15 10" />
        <line x1="1" y1="14" x2="15" y2="14" />
      </svg>
      <span className="text-[11px] text-text-semantic-faint">No sessions tracked yet</span>
      <span className="text-[10px] text-text-semantic-faint" style={{ opacity: 0.6 }}>
        Analytics will appear once Claude Code sessions are detected
      </span>
    </div>
  );
});
