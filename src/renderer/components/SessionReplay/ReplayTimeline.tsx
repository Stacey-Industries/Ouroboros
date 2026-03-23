/**
 * ReplayTimeline.tsx — Horizontal scrubber timeline for session replay.
 *
 * Shows tool calls as colored segments on a timeline bar. The playhead
 * position indicates the current step. Click anywhere to jump to that step.
 * Supports keyboard navigation (left/right arrows).
 */

import React, { memo, useCallback, useRef } from 'react';

import type { ReplayStep } from './types';

const TOOL_COLOR: Record<string, string> = {
  Read: 'var(--interactive-accent)',
  Edit: 'var(--status-warning)',
  Write: 'var(--status-warning)',
  Bash: 'var(--status-success)',
  Grep: 'var(--palette-purple)',
  Glob: 'var(--palette-purple)',
  Task: 'var(--palette-purple)',
  Agent: 'var(--palette-purple)',
};

function toolColor(name: string): string {
  return TOOL_COLOR[name] ?? 'var(--text-faint)';
}

const CONTAINER_STYLE: React.CSSProperties = { padding: '4px 8px' };

const TRACK_STYLE: React.CSSProperties = {
  position: 'relative',
  height: '24px',
  borderRadius: '4px',
  cursor: 'pointer',
  overflow: 'hidden',
};

const LABELS_STYLE: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '2px 0',
  fontSize: '0.625rem',
  fontFamily: 'var(--font-mono)',
  userSelect: 'none',
};

const SEGMENT_BASE_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: '4px',
  bottom: '4px',
  borderRadius: '2px',
  transition: 'opacity 0.15s',
  minWidth: '3px',
};

const PLAYHEAD_BASE_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: '2px',
  background: 'var(--interactive-accent)',
  boxShadow: '0 0 6px var(--interactive-accent)',
  transition: 'left 0.15s ease',
  zIndex: 1,
};

interface ReplayTimelineProps {
  steps: ReplayStep[];
  currentStep: number;
  totalDurationMs: number;
  onSeek: (stepIndex: number) => void;
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getPercent(value: number, totalDurationMs: number, min = 0): number {
  if (totalDurationMs <= 0) {
    return min;
  }

  return Math.max(min, (value / totalDurationMs) * 100);
}

function findClosestStepIndex(steps: ReplayStep[], targetMs: number): number {
  let closest = 0;
  let closestDist = Infinity;

  for (let i = 0; i < steps.length; i += 1) {
    const dist = Math.abs(steps[i].elapsedMs - targetMs);
    if (dist < closestDist) {
      closestDist = dist;
      closest = i;
    }
  }

  return closest;
}

function useTimelineSeekHandler(
  trackRef: React.RefObject<HTMLDivElement | null>,
  steps: ReplayStep[],
  totalDurationMs: number,
  onSeek: (stepIndex: number) => void,
): (event: React.MouseEvent) => void {
  return useCallback(
    (event: React.MouseEvent) => {
      const track = trackRef.current;
      if (!track || totalDurationMs <= 0) return;

      const rect = track.getBoundingClientRect();
      const pct = clampPct((event.clientX - rect.left) / rect.width);
      onSeek(findClosestStepIndex(steps, pct * totalDurationMs));
    },
    [onSeek, steps, totalDurationMs, trackRef],
  );
}

function getSegmentStyle(
  startPct: number,
  widthPct: number,
  isActive: boolean,
  color: string,
): React.CSSProperties {
  return {
    ...SEGMENT_BASE_STYLE,
    left: `${startPct}%`,
    width: `${widthPct}%`,
    background: color,
    opacity: isActive ? 1 : 0.5,
    border: isActive ? '1px solid var(--text-primary)' : 'none',
  };
}

function getPlayheadStyle(playheadPct: number): React.CSSProperties {
  return {
    ...PLAYHEAD_BASE_STYLE,
    left: `${playheadPct}%`,
  };
}

function ReplayTimelineSegments({
  steps,
  currentStep,
  totalDurationMs,
  onSeek,
}: ReplayTimelineProps): React.ReactElement {
  return (
    <>
      {steps.map((step, idx) => {
        if (step.type !== 'tool_call' || !step.toolCall) return null;

        const startPct = getPercent(step.elapsedMs, totalDurationMs);
        const widthPct = getPercent(step.toolCall.duration ?? 100, totalDurationMs, 0.5);
        const style = getSegmentStyle(
          startPct,
          widthPct,
          idx === currentStep,
          toolColor(step.toolCall.toolName),
        );

        return (
          <div
            key={step.toolCall.id}
            onClick={(event) => {
              event.stopPropagation();
              onSeek(idx);
            }}
            style={style}
            title={`${step.toolCall.toolName}: ${step.toolCall.input}`}
          />
        );
      })}
    </>
  );
}

function ReplayTimelineTrack({
  trackRef,
  handleClick,
  steps,
  currentStep,
  totalDurationMs,
  onSeek,
  playheadPct,
}: ReplayTimelineProps & {
  trackRef: React.RefObject<HTMLDivElement | null>;
  handleClick: (event: React.MouseEvent) => void;
  playheadPct: number;
}): React.ReactElement {
  return (
    <div ref={trackRef} onClick={handleClick} className="bg-surface-raised" style={TRACK_STYLE}>
      <ReplayTimelineSegments
        steps={steps}
        currentStep={currentStep}
        totalDurationMs={totalDurationMs}
        onSeek={onSeek}
      />
      <div style={getPlayheadStyle(playheadPct)} />
    </div>
  );
}

function ReplayTimelineLabels({
  currentElapsedMs,
  totalDurationMs,
}: {
  currentElapsedMs: number;
  totalDurationMs: number;
}): React.ReactElement {
  return (
    <div className="text-text-semantic-faint" style={LABELS_STYLE}>
      <span>{formatElapsed(currentElapsedMs)}</span>
      <span>{formatElapsed(totalDurationMs)}</span>
    </div>
  );
}

export const ReplayTimeline = memo(function ReplayTimeline({
  steps,
  currentStep,
  totalDurationMs,
  onSeek,
}: ReplayTimelineProps): React.ReactElement {
  const trackRef = useRef<HTMLDivElement>(null);
  const handleClick = useTimelineSeekHandler(trackRef, steps, totalDurationMs, onSeek);
  const currentElapsedMs = steps[currentStep]?.elapsedMs ?? 0;
  const playheadPct = getPercent(currentElapsedMs, totalDurationMs);

  return (
    <div style={CONTAINER_STYLE}>
      <ReplayTimelineTrack
        trackRef={trackRef}
        handleClick={handleClick}
        steps={steps}
        currentStep={currentStep}
        totalDurationMs={totalDurationMs}
        onSeek={onSeek}
        playheadPct={playheadPct}
      />
      <ReplayTimelineLabels currentElapsedMs={currentElapsedMs} totalDurationMs={totalDurationMs} />
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
