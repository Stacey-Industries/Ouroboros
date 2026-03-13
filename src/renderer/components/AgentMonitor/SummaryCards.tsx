/**
 * SummaryCards.tsx — Cost summary cards (today/week/month/all-time).
 */

import React, { memo, useMemo } from 'react';
import type { CostEntry } from '../../types/electron';
import { formatCost } from './costCalculator';
import { todayStr, daysAgo } from './costHelpers';

interface SummaryCardsProps {
  entries: CostEntry[];
}

function computeStats(entries: CostEntry[]) {
  const today = todayStr();
  const weekAgo = daysAgo(7);
  const monthAgo = daysAgo(30);

  let todayCost = 0, weekCost = 0, monthCost = 0, allTimeCost = 0;
  for (const e of entries) {
    allTimeCost += e.estimatedCost;
    if (e.date === today) todayCost += e.estimatedCost;
    if (e.timestamp >= weekAgo) weekCost += e.estimatedCost;
    if (e.timestamp >= monthAgo) monthCost += e.estimatedCost;
  }
  return { todayCost, weekCost, monthCost, allTimeCost };
}

const CARD_DEFS = [
  { label: 'Today', key: 'todayCost' as const },
  { label: '7 Days', key: 'weekCost' as const },
  { label: '30 Days', key: 'monthCost' as const },
  { label: 'All Time', key: 'allTimeCost' as const },
];

export const SummaryCards = memo(function SummaryCards({ entries }: SummaryCardsProps): React.ReactElement {
  const stats = useMemo(() => computeStats(entries), [entries]);

  return (
    <div
      className="grid grid-cols-4 gap-2 px-3 py-2"
      style={{ borderBottom: '1px solid var(--border-muted)' }}
    >
      {CARD_DEFS.map((card) => (
        <div key={card.label} className="flex flex-col items-center rounded px-2 py-1.5" style={{ background: 'var(--bg-tertiary)' }}>
          <span className="text-[9px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
            {card.label}
          </span>
          <span className="text-[14px] font-bold tabular-nums" style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
            {formatCost(stats[card.key])}
          </span>
        </div>
      ))}
    </div>
  );
});
