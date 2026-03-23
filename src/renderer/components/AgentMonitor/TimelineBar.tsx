/**
 * TimelineBar.tsx — Single bar in the Gantt timeline.
 */

import React, { memo, useCallback, useMemo } from 'react';

import { timelineColor } from './timelineHelpers';
import type { TooltipData } from './TimelineTooltip';
import type { ToolCallEvent } from './types';

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

const TRACK_STYLE: React.CSSProperties = {
  position: 'absolute',
  inset: '4px 0',
  borderRadius: '2px',
};

function buildBarStyle(
  leftPct: number,
  widthPct: number,
  status: ToolCallEvent['status'],
  color: string,
): React.CSSProperties {
  return {
    position: 'absolute',
    top: '2px',
    bottom: '2px',
    left: `${leftPct}%`,
    width: `${widthPct}%`,
    background: color,
    borderRadius: '2px',
    opacity: status === 'pending' ? 0.85 : 0.7,
    cursor: 'default',
    animation: status === 'pending' ? 'timeline-pulse 1.5s ease-in-out infinite' : undefined,
    transition: status === 'pending' ? 'width 200ms linear' : undefined,
    boxShadow: status === 'error' ? '0 0 0 1px var(--error)' : undefined,
  };
}

function useTimelineBarHover(
  tooltipBase: Omit<TooltipData, 'x' | 'y'>,
  onHover: (data: TooltipData | null) => void,
): {
  handleHover: (event: React.MouseEvent) => void;
  handleLeave: () => void;
} {
  const handleHover = useCallback((event: React.MouseEvent) => {
    onHover({ ...tooltipBase, x: event.clientX, y: event.clientY });
  }, [onHover, tooltipBase]);

  const handleLeave = useCallback(() => onHover(null), [onHover]);

  return { handleHover, handleLeave };
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
  const { handleHover, handleLeave } = useTimelineBarHover(tooltipBase, onHover);

  return (
    <div style={{ position: 'relative', height: '14px', flexShrink: 0 }}>
      <div className="bg-surface-raised" style={TRACK_STYLE} />
      <div
        onMouseEnter={handleHover}
        onMouseMove={handleHover}
        onMouseLeave={handleLeave}
        style={buildBarStyle(leftPct, widthPct, call.status, color)}
      />
    </div>
  );
});
