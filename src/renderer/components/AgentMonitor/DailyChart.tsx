/**
 * DailyChart.tsx — Bar chart of daily costs.
 */

import React, { memo, useMemo } from 'react';

import type { CostEntry } from '../../types/electron';
import { formatCost } from './costCalculator';
import { daysAgo, formatDateShort, toDateStr } from './costHelpers';

interface DailyChartProps {
  entries: CostEntry[];
  days: number;
}

function buildChartData(entries: CostEntry[], days: number) {
  const result: { date: string; cost: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    result.push({ date: toDateStr(daysAgo(i)), cost: 0 });
  }
  const dateMap = new Map(result.map((r) => [r.date, 0]));
  for (const e of entries) {
    const cur = dateMap.get(e.date);
    if (cur !== undefined) dateMap.set(e.date, cur + e.estimatedCost);
  }
  for (const r of result) r.cost = dateMap.get(r.date) ?? 0;
  return result;
}

function DailyBar({
  day,
  maxCost,
}: {
  day: { date: string; cost: number };
  maxCost: number;
}): React.ReactElement<any> {
  const barHeight = maxCost > 0 ? Math.max((day.cost / maxCost) * 100, day.cost > 0 ? 3 : 0) : 0;
  return (
    <div
      className="flex-1 flex flex-col items-center justify-end"
      style={{ height: '100%' }}
      title={`${day.date}: ${formatCost(day.cost)}`}
    >
      <div
        className="w-full rounded-t"
        style={{
          height: `${barHeight}%`,
          background: 'var(--interactive-accent)',
          opacity: day.cost > 0 ? 0.8 : 0.15,
          minHeight: day.cost > 0 ? '2px' : '1px',
          transition: 'height 300ms ease',
        }}
      />
    </div>
  );
}

function ChartHeader({ days, maxCost }: { days: number; maxCost: number }): React.ReactElement<any> {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[10px] font-medium uppercase tracking-wider text-text-semantic-faint">
        Daily Cost (Last {days} days)
      </span>
      <span
        className="text-[10px] tabular-nums ml-auto text-text-semantic-faint"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        max {formatCost(maxCost)}
      </span>
    </div>
  );
}

function ChartLabels({
  chartData,
  labelInterval,
}: {
  chartData: { date: string; cost: number }[];
  labelInterval: number;
}): React.ReactElement<any> {
  return (
    <div className="flex gap-[2px] mt-0.5">
      {chartData.map((day, i) => (
        <div key={day.date} className="flex-1 text-center">
          {i % labelInterval === 0 ? (
            <span
              className="text-[8px] tabular-nums text-text-semantic-faint"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {formatDateShort(day.date)}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export const DailyChart = memo(function DailyChart({
  entries,
  days,
}: DailyChartProps): React.ReactElement<any> {
  const chartData = useMemo(() => buildChartData(entries, days), [entries, days]);
  const maxCost = useMemo(() => Math.max(...chartData.map((d) => d.cost), 0.01), [chartData]);
  const labelInterval = Math.ceil(days / 7);

  return (
    <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <ChartHeader days={days} maxCost={maxCost} />
      <div className="flex items-end gap-[2px]" style={{ height: '60px' }}>
        {chartData.map((day) => (
          <DailyBar key={day.date} day={day} maxCost={maxCost} />
        ))}
      </div>
      <ChartLabels chartData={chartData} labelInterval={labelInterval} />
    </div>
  );
});
