import React, { memo } from 'react';

import type { RouterStatsResult } from '../../types/electron-workspace';

/* ── Subcomponents ───────────────────────────────────────────────────── */

interface TierBarProps {
  label: string;
  counts: { HAIKU: number; SONNET: number; OPUS: number };
}

const TierBar = memo(function TierBar({ label, counts }: TierBarProps): React.ReactElement {
  const total = counts.HAIKU + counts.SONNET + counts.OPUS;
  if (total === 0) return <div className="text-text-semantic-muted text-xs">{label}: no data</div>;

  return (
    <div className="mb-2">
      <div className="text-xs text-text-semantic-secondary mb-1">
        {label} ({total})
      </div>
      <div className="flex h-4 rounded overflow-hidden gap-px">
        {counts.HAIKU > 0 && (
          <TierSegment tier="Haiku" count={counts.HAIKU} total={total} color="var(--status-info)" />
        )}
        {counts.SONNET > 0 && (
          <TierSegment
            tier="Sonnet"
            count={counts.SONNET}
            total={total}
            color="var(--interactive-accent)"
          />
        )}
        {counts.OPUS > 0 && (
          <TierSegment
            tier="Opus"
            count={counts.OPUS}
            total={total}
            color="var(--status-warning)"
          />
        )}
      </div>
    </div>
  );
});

interface TierSegmentProps {
  tier: string;
  count: number;
  total: number;
  color: string;
}

const TierSegment = memo(function TierSegment({
  tier,
  count,
  total,
  color,
}: TierSegmentProps): React.ReactElement {
  const pct = Math.round((count / total) * 100);
  return (
    <div
      className="flex items-center justify-center text-[10px] font-medium text-text-semantic-on-accent"
      style={{ width: `${pct}%`, backgroundColor: color, minWidth: pct > 0 ? '24px' : '0' }}
      title={`${tier}: ${count} (${pct}%)`}
    >
      {pct >= 15 ? `${tier} ${pct}%` : ''}
    </div>
  );
});

interface StatCardProps {
  label: string;
  value: string | number;
}

const StatCard = memo(function StatCard({ label, value }: StatCardProps): React.ReactElement {
  return (
    <div className="bg-surface-raised rounded px-3 py-2">
      <div className="text-[10px] text-text-semantic-muted uppercase tracking-wider">{label}</div>
      <div className="text-lg font-semibold text-text-semantic-primary">{value}</div>
    </div>
  );
});

/* ── Helpers ──────────────────────────────────────────────────────────── */

function computeLayerPcts(d: RouterStatsResult['layerDistribution']): {
  rules: number;
  classifier: number;
} {
  const total = d.rule + d.classifier + d.llm + d.default_;
  if (total === 0) return { rules: 0, classifier: 0 };
  return {
    rules: Math.round((d.rule / total) * 100),
    classifier: Math.round((d.classifier / total) * 100),
  };
}

/* ── Main panel ──────────────────────────────────────────────────────── */

interface RouterAnalyticsPanelProps {
  stats: RouterStatsResult | null;
}

export const RouterAnalyticsPanel = memo(function RouterAnalyticsPanel({
  stats,
}: RouterAnalyticsPanelProps): React.ReactElement | null {
  if (!stats || stats.totalDecisions === 0) {
    return (
      <div className="px-4 py-3">
        <h3 className="text-sm font-semibold text-text-semantic-secondary mb-1">Model Router</h3>
        <p className="text-xs text-text-semantic-muted">No routing decisions recorded yet.</p>
      </div>
    );
  }

  const overridePct = Math.round(stats.overrideRate * 100);
  const { rules: rulesPct, classifier: classifierPct } = computeLayerPcts(stats.layerDistribution);

  return (
    <div className="px-4 py-3 border-t border-border-semantic">
      <h3 className="text-sm font-semibold text-text-semantic-secondary mb-3">Model Router</h3>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <StatCard label="Decisions" value={stats.totalDecisions} />
        <StatCard label="Override" value={`${overridePct}%`} />
        <StatCard label="Signals" value={countSignals(stats)} />
      </div>
      <TierBar label="All" counts={stats.tierDistribution} />
      <TierBar label="Chat" counts={stats.bySurface.chat} />
      <TierBar label="Terminal" counts={stats.bySurface.terminal_shadow} />
      <div className="mt-3 text-xs text-text-semantic-muted">
        Layer split: Rules {rulesPct}% · Classifier {classifierPct}% · Other{' '}
        {100 - rulesPct - classifierPct}%
      </div>
    </div>
  );
});

function countSignals(stats: RouterStatsResult): number {
  return Object.values(stats.signalCounts).reduce((sum, n) => sum + n, 0);
}
