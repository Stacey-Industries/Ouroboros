/**
 * StepList.tsx — Sidebar list of all steps in a session replay.
 *
 * Shows each step as a row with tool badge, label, and duration.
 * The current step is highlighted. Click to jump.
 */

import React, { memo,useEffect, useRef } from 'react';

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

const LIST_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'auto',
  minWidth: '180px',
  maxWidth: '240px',
};

const HEADER_STYLE: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: '0.6875rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid var(--border)',
  userSelect: 'none',
};

const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 8px',
  cursor: 'pointer',
  borderBottom: '1px solid var(--border-muted)',
  transition: 'background-color 0.1s',
  fontSize: '0.6875rem',
  fontFamily: 'var(--font-mono)',
};

const STEP_INDEX_STYLE: React.CSSProperties = {
  fontSize: '0.5625rem',
  width: '16px',
  textAlign: 'right',
  flexShrink: 0,
};

const STEP_LABEL_STYLE: React.CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '0.625rem',
};

const STEP_DURATION_STYLE: React.CSSProperties = {
  fontSize: '0.5625rem',
  flexShrink: 0,
};

const START_BADGE_STYLE: React.CSSProperties = {
  fontSize: '0.625rem',
  flexShrink: 0,
};

const TOOL_BADGE_STYLE: React.CSSProperties = {
  fontSize: '0.625rem',
  fontWeight: 600,
  flexShrink: 0,
  width: '32px',
};

function getRowStyle(isActive: boolean): React.CSSProperties {
  return {
    ...ROW_STYLE,
    backgroundColor: isActive ? 'rgba(88, 166, 255, 0.1)' : 'transparent',
    borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
  };
}

function updateRowHover(
  target: HTMLDivElement,
  isActive: boolean,
  entering: boolean,
): void {
  if (!isActive) {
    target.style.backgroundColor = entering ? 'rgba(255,255,255,0.03)' : 'transparent';
  }
}

interface StepListProps {
  steps: ReplayStep[];
  currentStep: number;
  onSelect: (index: number) => void;
}

interface StepRowProps {
  step: ReplayStep;
  index: number;
  isActive: boolean;
  onSelect: (index: number) => void;
  rowRef?: React.Ref<HTMLDivElement>;
}

export const StepList = memo(function StepList({
  steps,
  currentStep,
  onSelect,
}: StepListProps): React.ReactElement {
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeRef.current !== null) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentStep]);

  return (
    <div className="bg-surface-panel border-r border-border-semantic" style={LIST_STYLE}>
      <StepListHeader count={steps.length} />
      {steps.map((step, idx) => (
        <StepRow
          key={idx}
          step={step}
          index={idx}
          isActive={idx === currentStep}
          onSelect={onSelect}
          rowRef={idx === currentStep ? activeRef : undefined}
        />
      ))}
    </div>
  );
});

function StepListHeader({ count }: { count: number }): React.ReactElement {
  return <div className="text-text-semantic-faint" style={HEADER_STYLE}>Steps ({count})</div>;
}

function StepRow({
  step,
  index,
  isActive,
  onSelect,
  rowRef,
}: StepRowProps): React.ReactElement {
  const duration = step.toolCall?.duration;

  return (
    <div
      ref={rowRef}
      onClick={() => onSelect(index)}
      style={getRowStyle(isActive)}
      onMouseEnter={(event) => updateRowHover(event.currentTarget, isActive, true)}
      onMouseLeave={(event) => updateRowHover(event.currentTarget, isActive, false)}
    >
      <StepIndex index={index} />
      <StepToolBadge step={step} />
      <StepLabel label={step.label} />
      {duration === undefined ? null : <StepDuration duration={duration} />}
    </div>
  );
}

function StepIndex({ index }: { index: number }): React.ReactElement {
  return <span className="text-text-semantic-faint" style={STEP_INDEX_STYLE}>{index}</span>;
}

function StepToolBadge({ step }: { step: ReplayStep }): React.ReactElement | null {
  if (step.type === 'session_start') {
    return <span className="text-interactive-accent" style={START_BADGE_STYLE}>START</span>;
  }

  if (step.toolCall === undefined) {
    return null;
  }

  return (
    <span style={{ ...TOOL_BADGE_STYLE, color: toolColor(step.toolCall.toolName) }}>
      {step.toolCall.toolName.slice(0, 4)}
    </span>
  );
}

function StepLabel({ label }: { label: string }): React.ReactElement {
  return (
    <span className="text-text-semantic-muted" style={STEP_LABEL_STYLE} title={label}>
      {label}
    </span>
  );
}

function StepDuration({ duration }: { duration: number }): React.ReactElement {
  return <span className="text-text-semantic-faint" style={STEP_DURATION_STYLE}>{formatDurationShort(duration)}</span>;
}
