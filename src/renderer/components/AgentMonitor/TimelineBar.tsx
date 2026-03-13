/**
 * TimelineBar.tsx — Single bar in the Gantt timeline.
 */

import React, { memo, useCallback, useMemo } from 'react';
import type { ToolCallEvent } from './types';
import type { TooltipData } from './TimelineTooltip';
import { timelineColor } from './timelineHelpers';

interface TimelineBarProps {
  call: ToolCallEvent;
  sessionStartMs: number;
  totalDurationMs: number;
  nowMs: number;
  onHover: (data: TooltipData | null) => void;
}

function computeBarLayout(
  call: ToolCallEvent,
  sessionStartMs: number,
  totalDurationMs: number,
  nowMs: number,
): { leftPct: number; widthPct: number } {
  const startOffsetMs = call.timestamp - sessionStartMs;
  const endMs = call.duration !== undefined
    ? call.timestamp + call.duration
    : call.status === 'pending' ? nowMs : call.timestamp + 100;
  const durationMs = endMs - call.timestamp;

  const leftPct = totalDurationMs > 0
    ? Math.max(0, Math.min(100, (startOffsetMs / totalDurationMs) * 100))
    : 0;
  const widthPct = totalDurationMs > 0
    ? Math.max(0.5, Math.min(100 - leftPct, (durationMs / totalDurationMs) * 100))
    : 0.5;

  return { leftPct, widthPct };
}

export const TimelineBar = memo(function TimelineBar({
  call,
  sessionStartMs,
  totalDurationMs,
  nowMs,
  onHover,
}: TimelineBarProps): React.ReactElement {
  const color = timelineColor(call.toolName);
  const startOffsetMs = call.timestamp - sessionStartMs;
  const { leftPct, widthPct } = computeBarLayout(call, sessionStartMs, totalDurationMs, nowMs);

  const tooltipBase = useMemo(
    () => ({ toolName: call.toolName, status: call.status, duration: call.duration, startOffsetMs }),
    [call.toolName, call.status, call.duration, startOffsetMs],
  );

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    onHover({ ...tooltipBase, x: e.clientX, y: e.clientY });
  }, [onHover, tooltipBase]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    onHover({ ...tooltipBase, x: e.clientX, y: e.clientY });
  }, [onHover, tooltipBase]);

  const handleMouseLeave = useCallback(() => onHover(null), [onHover]);

  return (
    <div style={{ position: 'relative', height: '14px', flexShrink: 0 }}>
      <div
        style={{ position: 'absolute', inset: '4px 0', background: 'var(--bg-tertiary)', borderRadius: '2px' }}
      />
      <div
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          position: 'absolute',
          top: '2px',
          bottom: '2px',
          left: `${leftPct}%`,
          width: `${widthPct}%`,
          background: color,
          borderRadius: '2px',
          opacity: call.status === 'pending' ? 0.85 : 0.7,
          cursor: 'default',
          animation: call.status === 'pending' ? 'timeline-pulse 1.5s ease-in-out infinite' : undefined,
          transition: call.status === 'pending' ? 'width 200ms linear' : undefined,
          boxShadow: call.status === 'error' ? '0 0 0 1px var(--error)' : undefined,
        }}
      />
    </div>
  );
});
