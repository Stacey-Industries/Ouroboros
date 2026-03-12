/**
 * ReplayTimeline.tsx — Horizontal scrubber timeline for session replay.
 *
 * Shows tool calls as colored segments on a timeline bar. The playhead
 * position indicates the current step. Click anywhere to jump to that step.
 * Supports keyboard navigation (left/right arrows).
 */

import React, { useCallback, useRef, memo } from 'react';
import type { ReplayStep } from './types';

const TOOL_COLOR: Record<string, string> = {
  Read:     'var(--accent)',
  Edit:     'var(--warning)',
  Write:    'var(--warning)',
  Bash:     'var(--success)',
  Grep:     'var(--purple, #a371f7)',
  Glob:     'var(--purple, #a371f7)',
  Task:     'var(--purple, #a371f7)',
  Agent:    'var(--purple, #a371f7)',
};

function toolColor(name: string): string {
  return TOOL_COLOR[name] ?? 'var(--text-faint)';
}

interface ReplayTimelineProps {
  steps: ReplayStep[];
  currentStep: number;
  totalDurationMs: number;
  onSeek: (stepIndex: number) => void;
}

export const ReplayTimeline = memo(function ReplayTimeline({
  steps,
  currentStep,
  totalDurationMs,
  onSeek,
}: ReplayTimelineProps): React.ReactElement {
  const trackRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const track = trackRef.current;
    if (!track || totalDurationMs <= 0) return;

    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetMs = pct * totalDurationMs;

    // Find the closest step to the clicked time
    let closest = 0;
    let closestDist = Infinity;
    for (let i = 0; i < steps.length; i++) {
      const dist = Math.abs(steps[i].elapsedMs - targetMs);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    }
    onSeek(closest);
  }, [steps, totalDurationMs, onSeek]);

  // Playhead position
  const playheadPct = totalDurationMs > 0 && steps[currentStep]
    ? (steps[currentStep].elapsedMs / totalDurationMs) * 100
    : 0;

  return (
    <div style={{ padding: '4px 8px' }}>
      {/* Track */}
      <div
        ref={trackRef}
        onClick={handleClick}
        style={{
          position: 'relative',
          height: '24px',
          background: 'var(--bg-tertiary)',
          borderRadius: '4px',
          cursor: 'pointer',
          overflow: 'hidden',
        }}
      >
        {/* Tool call segments */}
        {steps.map((step, idx) => {
          if (step.type !== 'tool_call' || !step.toolCall) return null;
          const startPct = totalDurationMs > 0
            ? (step.elapsedMs / totalDurationMs) * 100
            : 0;
          const durMs = step.toolCall.duration ?? 100;
          const widthPct = totalDurationMs > 0
            ? Math.max(0.5, (durMs / totalDurationMs) * 100)
            : 0.5;

          const isActive = idx === currentStep;
          const color = toolColor(step.toolCall.toolName);

          return (
            <div
              key={step.toolCall.id}
              onClick={(e) => { e.stopPropagation(); onSeek(idx); }}
              style={{
                position: 'absolute',
                top: '4px',
                bottom: '4px',
                left: `${startPct}%`,
                width: `${widthPct}%`,
                background: color,
                borderRadius: '2px',
                opacity: isActive ? 1 : 0.5,
                border: isActive ? '1px solid var(--text)' : 'none',
                transition: 'opacity 0.15s',
                minWidth: '3px',
              }}
              title={`${step.toolCall.toolName}: ${step.toolCall.input}`}
            />
          );
        })}

        {/* Playhead */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${playheadPct}%`,
            width: '2px',
            background: 'var(--accent)',
            boxShadow: '0 0 6px var(--accent)',
            transition: 'left 0.15s ease',
            zIndex: 1,
          }}
        />
      </div>

      {/* Time labels */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '2px 0',
          fontSize: '0.625rem',
          color: 'var(--text-faint)',
          fontFamily: 'var(--font-mono)',
          userSelect: 'none',
        }}
      >
        <span>{formatElapsed(steps[currentStep]?.elapsedMs ?? 0)}</span>
        <span>{formatElapsed(totalDurationMs)}</span>
      </div>
    </div>
  );
});

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
