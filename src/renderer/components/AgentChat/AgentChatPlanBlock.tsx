import React, { useCallback, useState } from 'react';

/* ---------- Types ---------- */

export interface PlanStep {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  detail?: string;
}

export interface AgentChatPlanBlockProps {
  steps: PlanStep[];
  completedCount: number;
  isStreaming: boolean;
}

/* ---------- Icons ---------- */

function PendingIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" opacity="0.3" />
    </svg>
  );
}

function RunningSpinner(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function CompleteIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="16 10 10.5 15.5 8 13" />
    </svg>
  );
}

function FailedIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="transition-transform duration-150"
      style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/* ---------- Status icon renderer ---------- */

function StatusIcon({ status }: { status: PlanStep['status'] }): React.ReactElement {
  switch (status) {
    case 'pending':
      return <span style={{ color: 'var(--text-muted)' }}><PendingIcon /></span>;
    case 'running':
      return <span style={{ color: 'var(--accent)' }}><RunningSpinner /></span>;
    case 'complete':
      return <span style={{ color: '#3fb950' }}><CompleteIcon /></span>;
    case 'failed':
      return <span style={{ color: '#f85149' }}><FailedIcon /></span>;
  }
}

/* ---------- Progress bar ---------- */

function PlanProgressBar({ total, completed, isStreaming }: { total: number; completed: number; isStreaming: boolean }): React.ReactElement {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg)' }}>
        <div
          className="h-full rounded-full transition-all duration-300 ease-out"
          style={{
            width: `${pct}%`,
            backgroundColor: completed === total && total > 0 ? '#3fb950' : 'var(--accent)',
          }}
        />
      </div>
      <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
        {completed} of {total} steps {isStreaming ? '...' : 'complete'}
      </span>
    </div>
  );
}

/* ---------- Step item ---------- */

function PlanStepItem({ step }: { step: PlanStep }): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = Boolean(step.detail);

  const textClass = (() => {
    switch (step.status) {
      case 'pending': return 'text-[var(--text)]';
      case 'running': return 'text-[var(--text)] font-medium';
      case 'complete': return 'text-[var(--text-muted)] line-through';
      case 'failed': return 'text-[var(--error,#f85149)]';
    }
  })();

  const handleClick = useCallback(() => {
    if (hasDetail) setExpanded((e) => !e);
  }, [hasDetail]);

  return (
    <li>
      <div
        className={`flex items-center gap-2 py-0.5 ${hasDetail ? 'cursor-pointer' : ''}`}
        onClick={handleClick}
      >
        <span className="shrink-0 flex items-center">
          <StatusIcon status={step.status} />
        </span>
        <span className={`flex-1 text-xs ${textClass} transition-all duration-150`}>
          {step.title}
        </span>
        {hasDetail && (
          <span className="shrink-0 text-[var(--text-muted)]">
            <ChevronIcon expanded={expanded} />
          </span>
        )}
      </div>
      {hasDetail && expanded && (
        <div
          className="ml-6 mt-0.5 mb-1 rounded-md px-2.5 py-1.5 text-[11px] leading-relaxed transition-all duration-150"
          style={{
            backgroundColor: step.status === 'failed' ? 'rgba(248, 81, 73, 0.06)' : 'var(--bg)',
            color: step.status === 'failed' ? 'var(--error, #f85149)' : 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {step.detail}
        </div>
      )}
    </li>
  );
}

/* ---------- Main component ---------- */

export function AgentChatPlanBlock({
  steps,
  completedCount,
  isStreaming,
}: AgentChatPlanBlockProps): React.ReactElement {
  const hasFailures = steps.some((s) => s.status === 'failed');
  const allDone = completedCount === steps.length && steps.length > 0 && !isStreaming;

  return (
    <div
      className="my-1.5 rounded-md border text-xs transition-all duration-150"
      style={{
        borderColor: hasFailures
          ? 'rgba(248, 81, 73, 0.3)'
          : allDone
            ? 'rgba(63, 185, 80, 0.3)'
            : 'var(--border)',
        backgroundColor: 'var(--bg-tertiary)',
      }}
    >
      {/* Header */}
      <div className="px-3 pt-2.5 pb-1.5">
        <div className="flex items-center gap-2 mb-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="8" y1="12" x2="16" y2="12" />
            <line x1="8" y1="8" x2="16" y2="8" />
            <line x1="8" y1="16" x2="12" y2="16" />
          </svg>
          <span className="font-medium text-[var(--text)]">Plan</span>
          {allDone && (
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: 'rgba(63, 185, 80, 0.15)', color: '#3fb950' }}>
              Complete
            </span>
          )}
          {hasFailures && (
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: 'rgba(248, 81, 73, 0.15)', color: '#f85149' }}>
              Failed
            </span>
          )}
        </div>
        <PlanProgressBar total={steps.length} completed={completedCount} isStreaming={isStreaming} />
      </div>

      {/* Steps */}
      <div className="border-t px-3 py-2" style={{ borderColor: 'var(--border)' }}>
        <ul className="space-y-0.5">
          {steps.map((step) => (
            <PlanStepItem key={step.id} step={step} />
          ))}
        </ul>
      </div>
    </div>
  );
}
