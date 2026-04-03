/**
 * TimelineXAxis.tsx — X-axis tick labels for the timeline.
 */

import React, { memo } from 'react';

import { formatDurationShort } from './timelineHelpers';

interface XAxisProps {
  totalDurationMs: number;
}

function getTickInterval(totalMs: number): number {
  if (totalMs <= 5_000) return 1_000;
  if (totalMs <= 30_000) return 5_000;
  if (totalMs <= 120_000) return 20_000;
  if (totalMs <= 300_000) return 60_000;
  return 120_000;
}

function buildTicks(totalMs: number): number[] {
  const interval = getTickInterval(totalMs);
  const ticks: number[] = [];
  for (let t = 0; t <= totalMs; t += interval) {
    ticks.push(t);
  }
  if (ticks[ticks.length - 1] !== totalMs) {
    ticks.push(totalMs);
  }
  return ticks;
}

function tickTransform(pct: number): string {
  if (pct > 90) return 'translateX(-100%)';
  if (pct > 5) return 'translateX(-50%)';
  return 'none';
}

export const XAxis = memo(function XAxis({ totalDurationMs }: XAxisProps): React.ReactElement<unknown> {
  const ticks = buildTicks(totalDurationMs);

  return (
    <div style={{ position: 'relative', height: '16px', marginTop: '2px' }}>
      {ticks.map((t) => {
        const pct = totalDurationMs > 0 ? (t / totalDurationMs) * 100 : 0;
        return (
          <span
            key={t}
            className="text-text-semantic-faint"
            style={{
              position: 'absolute',
              left: `${pct}%`,
              transform: tickTransform(pct),
              fontSize: '9px',
              fontFamily: 'var(--font-mono)',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            {formatDurationShort(t)}
          </span>
        );
      })}
    </div>
  );
});
