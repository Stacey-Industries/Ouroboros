/**
 * ToolCallTimeline.tsx — Gantt-style horizontal timeline for tool calls.
 *
 * Renders each tool call as a colored horizontal bar scaled to the session's
 * total elapsed time. Bars stack vertically, one per tool call.
 *
 * Bar colors by tool type:
 *   Read              → blue  (var(--accent))
 *   Write / Edit      → orange (var(--warning))
 *   Bash              → green (var(--success))
 *   Agent / Task      → purple (var(--purple))
 *   Other             → grey  (var(--text-faint))
 *
 * Hover shows a tooltip: tool name, duration, status.
 * Falls back to "No timing data yet" when no calls have timing information.
 */

import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import type { ToolCallEvent } from './types';

// ─── Color mapping (must stay in sync with ToolCallFeed) ─────────────────────

const TOOL_TIMELINE_COLOR: Record<string, string> = {
  Read:    'var(--accent)',
  Edit:    'var(--warning)',
  Write:   'var(--warning)',
  Bash:    'var(--success)',
  Grep:    'var(--purple)',
  Glob:    'var(--purple)',
  Task:    'var(--purple)',
  Agent:   'var(--purple)',
  Subagent:'var(--purple)',
  task:    'var(--purple)',
  agent:   'var(--purple)',
  subagent:'var(--purple)',
};

function timelineColor(toolName: string): string {
  return TOOL_TIMELINE_COLOR[toolName] ?? 'var(--text-faint)';
}

function formatDurationShort(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

interface TooltipData {
  toolName: string;
  status: ToolCallEvent['status'];
  duration?: number;
  startOffsetMs: number;
  x: number;
  y: number;
}

const Tooltip = memo(function Tooltip({ data }: { data: TooltipData }): React.ReactElement {
  const statusLabel =
    data.status === 'pending' ? 'In progress' :
    data.status === 'success' ? 'Success' :
    'Error';

  const statusColor =
    data.status === 'pending' ? 'var(--accent)' :
    data.status === 'success' ? 'var(--success)' :
    'var(--error)';

  return (
    <div
      style={{
        position: 'fixed',
        left: data.x + 8,
        top: data.y - 8,
        zIndex: 9999,
        pointerEvents: 'none',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '4px',
        padding: '5px 8px',
        fontSize: '11px',
        color: 'var(--text)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        maxWidth: '200px',
        whiteSpace: 'nowrap',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '2px' }}>{data.toolName}</div>
      <div style={{ color: 'var(--text-faint)' }}>
        Start: +{formatDurationShort(data.startOffsetMs)}
      </div>
      {data.duration !== undefined && (
        <div style={{ color: 'var(--text-faint)' }}>
          Duration: {formatDurationShort(data.duration)}
        </div>
      )}
      <div style={{ color: statusColor, marginTop: '2px' }}>{statusLabel}</div>
    </div>
  );
});

// ─── Timeline bar row ────────────────────────────────────────────────────────

interface TimelineBarProps {
  call: ToolCallEvent;
  sessionStartMs: number;
  totalDurationMs: number;
  nowMs: number;
  onHover: (data: TooltipData | null) => void;
}

const TimelineBar = memo(function TimelineBar({
  call,
  sessionStartMs,
  totalDurationMs,
  nowMs,
  onHover,
}: TimelineBarProps): React.ReactElement {
  const color = timelineColor(call.toolName);

  const startOffsetMs = call.timestamp - sessionStartMs;
  const endMs = call.duration !== undefined
    ? call.timestamp + call.duration
    : call.status === 'pending'
      ? nowMs
      : call.timestamp + 100; // fallback for completed calls with no duration

  const durationMs = endMs - call.timestamp;

  // Clamp to 0–totalDurationMs
  const leftPct = totalDurationMs > 0
    ? Math.max(0, Math.min(100, (startOffsetMs / totalDurationMs) * 100))
    : 0;
  const widthPct = totalDurationMs > 0
    ? Math.max(0.5, Math.min(100 - leftPct, (durationMs / totalDurationMs) * 100))
    : 0.5;

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    onHover({
      toolName: call.toolName,
      status: call.status,
      duration: call.duration,
      startOffsetMs,
      x: e.clientX,
      y: e.clientY,
    });
  }, [onHover, call.toolName, call.status, call.duration, startOffsetMs]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    onHover({
      toolName: call.toolName,
      status: call.status,
      duration: call.duration,
      startOffsetMs,
      x: e.clientX,
      y: e.clientY,
    });
  }, [onHover, call.toolName, call.status, call.duration, startOffsetMs]);

  const handleMouseLeave = useCallback(() => {
    onHover(null);
  }, [onHover]);

  return (
    <div
      style={{
        position: 'relative',
        height: '14px',
        flexShrink: 0,
      }}
    >
      {/* Track background */}
      <div
        style={{
          position: 'absolute',
          inset: '4px 0',
          background: 'var(--bg-tertiary)',
          borderRadius: '2px',
        }}
      />
      {/* Colored bar */}
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
          boxShadow: call.status === 'error'
            ? `0 0 0 1px var(--error)`
            : undefined,
        }}
      />
    </div>
  );
});

// ─── X-axis tick labels ───────────────────────────────────────────────────────

interface XAxisProps {
  totalDurationMs: number;
}

const XAxis = memo(function XAxis({ totalDurationMs }: XAxisProps): React.ReactElement {
  // Choose sensible tick spacing based on total duration
  const tickIntervalMs = (() => {
    if (totalDurationMs <= 5_000) return 1_000;
    if (totalDurationMs <= 30_000) return 5_000;
    if (totalDurationMs <= 120_000) return 20_000;
    if (totalDurationMs <= 300_000) return 60_000;
    return 120_000;
  })();

  const ticks: number[] = [];
  for (let t = 0; t <= totalDurationMs; t += tickIntervalMs) {
    ticks.push(t);
  }
  // Always include the end
  if (ticks[ticks.length - 1] !== totalDurationMs) {
    ticks.push(totalDurationMs);
  }

  return (
    <div style={{ position: 'relative', height: '16px', marginTop: '2px' }}>
      {ticks.map((t) => {
        const pct = totalDurationMs > 0 ? (t / totalDurationMs) * 100 : 0;
        return (
          <span
            key={t}
            style={{
              position: 'absolute',
              left: `${pct}%`,
              transform: pct > 90 ? 'translateX(-100%)' : pct > 5 ? 'translateX(-50%)' : 'none',
              fontSize: '9px',
              color: 'var(--text-faint)',
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

// ─── Legend ───────────────────────────────────────────────────────────────────

const LEGEND_ITEMS = [
  { label: 'Read', color: 'var(--accent)' },
  { label: 'Write/Edit', color: 'var(--warning)' },
  { label: 'Bash', color: 'var(--success)' },
  { label: 'Agent/Task', color: 'var(--purple)' },
  { label: 'Other', color: 'var(--text-faint)' },
] as const;

const Legend = memo(function Legend(): React.ReactElement {
  return (
    <div
      className="flex items-center flex-wrap gap-x-3 gap-y-1 px-3 py-1.5"
      style={{ borderTop: '1px solid var(--border-muted)' }}
    >
      {LEGEND_ITEMS.map(({ label, color }) => (
        <span key={label} className="flex items-center gap-1">
          <span
            style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '1px',
              background: color,
              opacity: 0.8,
            }}
          />
          <span style={{ fontSize: '9px', color: 'var(--text-faint)' }}>{label}</span>
        </span>
      ))}
    </div>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

export interface ToolCallTimelineProps {
  toolCalls: ToolCallEvent[];
  sessionStartedAt: number;
  /** If session is still running, pass the session start ms so the live end is tracked. */
  sessionRunning: boolean;
}

export const ToolCallTimeline = memo(function ToolCallTimeline({
  toolCalls,
  sessionStartedAt,
  sessionRunning,
}: ToolCallTimelineProps): React.ReactElement {
  const [nowMs, setNowMs] = useState(Date.now);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  // Update "now" once per second while session is running so pending bars extend
  useEffect(() => {
    if (!sessionRunning) return;
    intervalRef.current = setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [sessionRunning]);

  // Check if any calls have meaningful timing data
  const hasTimingData = toolCalls.some(
    (tc) => tc.duration !== undefined || tc.status === 'pending',
  );

  if (toolCalls.length === 0 || !hasTimingData) {
    return (
      <div
        className="px-3 py-4 text-center text-[11px] italic"
        style={{ color: 'var(--text-faint)' }}
      >
        No timing data yet.
      </div>
    );
  }

  // Total duration: latest known end, or nowMs if session is running
  const lastEnd = toolCalls.reduce((max, tc) => {
    const end = tc.duration !== undefined
      ? tc.timestamp + tc.duration
      : tc.status === 'pending'
        ? nowMs
        : tc.timestamp;
    return Math.max(max, end);
  }, sessionStartedAt);

  const totalDurationMs = Math.max(1, lastEnd - sessionStartedAt);

  return (
    <div className="flex flex-col">
      {/* Keyframes for pending bar pulse animation */}
      <style>{`
        @keyframes timeline-pulse {
          0%, 100% { opacity: 0.85; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-1"
        style={{ borderBottom: '1px solid var(--border-muted)' }}
      >
        <span className="text-[10px] font-medium" style={{ color: 'var(--text-faint)' }}>
          {toolCalls.length} tool call{toolCalls.length !== 1 ? 's' : ''}
        </span>
        <span
          className="text-[10px] tabular-nums"
          style={{ color: 'var(--text-faint)' }}
        >
          {formatDurationShort(totalDurationMs)} total
        </span>
      </div>

      {/* Timeline rows */}
      <div
        className="overflow-y-auto overflow-x-hidden px-3 pt-2 pb-1"
        style={{ maxHeight: '320px' }}
      >
        <div className="flex flex-col gap-0.5">
          {toolCalls.map((call) => (
            <TimelineBar
              key={call.id}
              call={call}
              sessionStartMs={sessionStartedAt}
              totalDurationMs={totalDurationMs}
              nowMs={nowMs}
              onHover={setTooltip}
            />
          ))}
        </div>

        {/* X-axis */}
        <XAxis totalDurationMs={totalDurationMs} />
      </div>

      {/* Legend */}
      <Legend />

      {/* Tooltip (portal-style, rendered outside flow) */}
      {tooltip && <Tooltip data={tooltip} />}
    </div>
  );
});
