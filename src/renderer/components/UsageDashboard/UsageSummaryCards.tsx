/**
 * UsageSummaryCards — four summary stat cards for the Usage Dashboard.
 *
 * Shows total cost, input tokens, output tokens, and thread count.
 * Uses design tokens exclusively — no hex values.
 */

import React from 'react';

import type { GlobalCostRollupRecord } from '../../types/electron';
import { formatCost, formatTokenCount } from '../AgentMonitor/costCalculator';

// ─── Card primitive ───────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string;
}

function StatCard({ title, value }: StatCardProps): React.ReactElement {
  return (
    <div className="bg-surface-panel border border-border-subtle rounded-lg p-4 flex flex-col gap-1 min-w-0">
      <span className="text-xs text-text-semantic-muted uppercase tracking-wide">
        {title}
      </span>
      <span className="text-2xl font-semibold text-text-semantic-primary truncate">
        {value}
      </span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface UsageSummaryCardsProps {
  rollup: GlobalCostRollupRecord | null;
}

export function UsageSummaryCards({
  rollup,
}: UsageSummaryCardsProps): React.ReactElement {
  const cost = rollup !== null ? formatCost(rollup.totalUsd) : '—';
  const input = rollup !== null ? formatTokenCount(rollup.totalInputTokens) : '—';
  const output = rollup !== null ? formatTokenCount(rollup.totalOutputTokens) : '—';
  const threads = rollup !== null ? String(rollup.threadCount) : '—';

  return (
    <div className="grid grid-cols-4 gap-3">
      <StatCard title="Total Cost" value={cost} />
      <StatCard title="Input Tokens" value={input} />
      <StatCard title="Output Tokens" value={output} />
      <StatCard title="Threads" value={threads} />
    </div>
  );
}
