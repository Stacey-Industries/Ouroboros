/**
 * ToolCallTimeline.tsx — Gantt-style horizontal timeline for tool calls.
 */

import React, { useState, useEffect, memo } from 'react';
import type { ToolCallEvent } from './types';
import type { TooltipData } from './TimelineTooltip';
import { formatDurationShort } from './timelineHelpers';
import { TimelineBar } from './TimelineBar';
import { XAxis } from './TimelineXAxis';
import { Legend } from './TimelineLegend';
import { Tooltip } from './TimelineTooltip';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeTotalDuration(
  toolCalls: ToolCallEvent[],
  sessionStartedAt: number,
  nowMs: number,
): number {
  const lastEnd = toolCalls.reduce((max, tc) => {
    const end = tc.duration !== undefined
      ? tc.timestamp + tc.duration
      : tc.status === 'pending' ? nowMs : tc.timestamp;
    return Math.max(max, end);
  }, sessionStartedAt);

  return Math.max(1, lastEnd - sessionStartedAt);
}

const TIMELINE_PULSE_STYLES = `
  @keyframes timeline-pulse {
    0%, 100% { opacity: 0.85; }
    50% { opacity: 0.5; }
  }
`;

function useTimelineClock(sessionRunning: boolean): number {
  const [nowMs, setNowMs] = useState(Date.now);

  useEffect(() => {
    if (!sessionRunning) return;
    const intervalId = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, [sessionRunning]);

  return nowMs;
}

function TimelineRows({
  toolCalls,
  sessionStartedAt,
  totalDurationMs,
  nowMs,
  onHover,
}: {
  toolCalls: ToolCallEvent[];
  sessionStartedAt: number;
  totalDurationMs: number;
  nowMs: number;
  onHover: (data: TooltipData | null) => void;
}): React.ReactElement {
  return (
    <>
      <div className="overflow-y-auto overflow-x-hidden px-3 pt-2 pb-1" style={{ maxHeight: '320px' }}>
        <div className="flex flex-col gap-0.5">
          {toolCalls.map((call) => (
            <TimelineBar
              key={call.id}
              call={call}
              sessionStartMs={sessionStartedAt}
              totalDurationMs={totalDurationMs}
              nowMs={nowMs}
              onHover={onHover}
            />
          ))}
        </div>
        <XAxis totalDurationMs={totalDurationMs} />
      </div>
      <Legend />
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface ToolCallTimelineProps {
  toolCalls: ToolCallEvent[];
  sessionStartedAt: number;
  sessionRunning: boolean;
}

export const ToolCallTimeline = memo(function ToolCallTimeline({
  toolCalls,
  sessionStartedAt,
  sessionRunning,
}: ToolCallTimelineProps): React.ReactElement {
  const nowMs = useTimelineClock(sessionRunning);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const hasTimingData = toolCalls.some(
    (tc) => tc.duration !== undefined || tc.status === 'pending',
  );

  if (toolCalls.length === 0 || !hasTimingData) {
    return (
      <div className="px-3 py-4 text-center text-[11px] italic text-text-semantic-faint">
        No timing data yet.
      </div>
    );
  }

  const totalDurationMs = computeTotalDuration(toolCalls, sessionStartedAt, nowMs);

  return (
    <div className="flex flex-col">
      <style>{TIMELINE_PULSE_STYLES}</style>
      <TimelineHeader count={toolCalls.length} totalMs={totalDurationMs} />
      <TimelineRows
        toolCalls={toolCalls}
        sessionStartedAt={sessionStartedAt}
        totalDurationMs={totalDurationMs}
        nowMs={nowMs}
        onHover={setTooltip}
      />
      {tooltip && <Tooltip data={tooltip} />}
    </div>
  );
});

// ─── Header sub-component ─────────────────────────────────────────────────────

interface TimelineHeaderProps {
  count: number;
  totalMs: number;
}

const TimelineHeader = memo(function TimelineHeader({ count, totalMs }: TimelineHeaderProps): React.ReactElement {
  return (
    <div
      className="flex items-center justify-between px-3 py-1"
      style={{ borderBottom: '1px solid var(--border-muted)' }}
    >
      <span className="text-[10px] font-medium text-text-semantic-faint">
        {count} tool call{count !== 1 ? 's' : ''}
      </span>
      <span className="text-[10px] tabular-nums text-text-semantic-faint">
        {formatDurationShort(totalMs)} total
      </span>
    </div>
  );
});
