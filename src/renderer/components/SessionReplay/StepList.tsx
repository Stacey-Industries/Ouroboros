/**
 * StepList.tsx — Sidebar list of all steps in a session replay.
 *
 * Shows each step as a row with tool badge, label, and duration.
 * The current step is highlighted. Click to jump.
 */

import React, { useEffect, useRef, memo } from 'react';
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

function formatDurationShort(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface StepListProps {
  steps: ReplayStep[];
  currentStep: number;
  onSelect: (index: number) => void;
}

export const StepList = memo(function StepList({
  steps,
  currentStep,
  onSelect,
}: StepListProps): React.ReactElement {
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active step
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentStep]);

  return (
    <div
      ref={listRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'auto',
        borderRight: '1px solid var(--border)',
        backgroundColor: 'var(--bg-secondary)',
        minWidth: '180px',
        maxWidth: '240px',
      }}
    >
      <div
        style={{
          padding: '6px 8px',
          fontSize: '0.6875rem',
          fontWeight: 600,
          color: 'var(--text-faint)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          borderBottom: '1px solid var(--border)',
          userSelect: 'none',
        }}
      >
        Steps ({steps.length})
      </div>

      {steps.map((step, idx) => {
        const isActive = idx === currentStep;
        const tc = step.toolCall;

        return (
          <div
            key={idx}
            ref={isActive ? activeRef : undefined}
            onClick={() => onSelect(idx)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 8px',
              cursor: 'pointer',
              backgroundColor: isActive ? 'rgba(88, 166, 255, 0.1)' : 'transparent',
              borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              borderBottom: '1px solid var(--border-muted)',
              transition: 'background-color 0.1s',
              fontSize: '0.6875rem',
              fontFamily: 'var(--font-mono)',
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)';
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            {/* Step number */}
            <span style={{ color: 'var(--text-faint)', fontSize: '0.5625rem', width: '16px', textAlign: 'right', flexShrink: 0 }}>
              {idx}
            </span>

            {/* Tool badge or session icon */}
            {step.type === 'session_start' ? (
              <span style={{ color: 'var(--accent)', fontSize: '0.625rem', flexShrink: 0 }}>
                START
              </span>
            ) : tc ? (
              <span
                style={{
                  color: toolColor(tc.toolName),
                  fontSize: '0.625rem',
                  fontWeight: 600,
                  flexShrink: 0,
                  width: '32px',
                }}
              >
                {tc.toolName.slice(0, 4)}
              </span>
            ) : null}

            {/* Label */}
            <span
              style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: 'var(--text-muted)',
                fontSize: '0.625rem',
              }}
              title={step.label}
            >
              {step.label}
            </span>

            {/* Duration */}
            {tc?.duration !== undefined && (
              <span style={{ color: 'var(--text-faint)', fontSize: '0.5625rem', flexShrink: 0 }}>
                {formatDurationShort(tc.duration)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
});
