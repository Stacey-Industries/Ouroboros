import React, { useCallback, useState } from 'react';

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

function PendingIcon(): React.ReactElement {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" opacity="0.3" /></svg>;
}

function RunningSpinner(): React.ReactElement {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>;
}

function CompleteIcon(): React.ReactElement {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="16 10 10.5 15.5 8 13" /></svg>;
}

function FailedIcon(): React.ReactElement {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>;
}

function ChevronIcon({ expanded }: { expanded: boolean }): React.ReactElement {
  return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-150" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}><polyline points="9 18 15 12 9 6" /></svg>;
}

function StatusIcon({ status }: { status: PlanStep['status'] }): React.ReactElement {
  if (status === 'pending') return <span className="text-text-semantic-muted"><PendingIcon /></span>;
  if (status === 'running') return <span className="text-interactive-accent"><RunningSpinner /></span>;
  if (status === 'complete') return <span style={{ color: '#3fb950' }}><CompleteIcon /></span>;
  return <span style={{ color: '#f85149' }}><FailedIcon /></span>;
}

function PlanProgressBar({ total, completed, isStreaming }: { total: number; completed: number; isStreaming: boolean }): React.ReactElement {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-base">
        <div className="h-full rounded-full transition-all duration-300 ease-out" style={{ width: `${pct}%`, backgroundColor: completed === total && total > 0 ? '#3fb950' : 'var(--accent)' }} />
      </div>
      <span className="shrink-0 text-[10px] text-text-semantic-muted">{completed} of {total} steps {isStreaming ? '...' : 'complete'}</span>
    </div>
  );
}

function getStepTextClass(status: PlanStep['status']): string {
  if (status === 'pending') return 'text-text-semantic-primary';
  if (status === 'running') return 'text-text-semantic-primary font-medium';
  if (status === 'complete') return 'text-text-semantic-muted line-through';
  return 'text-status-error';
}

function getStepDetailStyle(status: PlanStep['status']): React.CSSProperties | undefined {
  return status === 'failed'
    ? { backgroundColor: 'rgba(248, 81, 73, 0.06)', fontFamily: 'var(--font-mono)' }
    : { fontFamily: 'var(--font-mono)' };
}

function PlanStepItem({ step }: { step: PlanStep }): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = Boolean(step.detail);
  const toggle = useCallback(() => { if (hasDetail) setExpanded((value) => !value); }, [hasDetail]);

  return (
    <li>
      <div
        className={`flex items-center gap-2 py-0.5 ${hasDetail ? 'cursor-pointer' : ''}`}
        onClick={toggle}
        role={hasDetail ? 'button' : undefined}
        tabIndex={hasDetail ? 0 : undefined}
        onKeyDown={hasDetail ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } } : undefined}
      >
        <span className="flex shrink-0 items-center"><StatusIcon status={step.status} /></span>
        <span className={`flex-1 text-xs transition-all duration-150 ${getStepTextClass(step.status)}`}>{step.title}</span>
        {hasDetail && <span className="shrink-0 text-text-semantic-muted"><ChevronIcon expanded={expanded} /></span>}
      </div>
      {hasDetail && expanded && (
        <div className={`mb-1 ml-6 mt-0.5 rounded-md px-2.5 py-1.5 text-[11px] leading-relaxed transition-all duration-150 ${step.status === 'failed' ? 'text-status-error' : 'text-text-semantic-muted bg-surface-base'}`} style={getStepDetailStyle(step.status)}>
          {step.detail}
        </div>
      )}
    </li>
  );
}

export function AgentChatPlanBlock({ steps, completedCount, isStreaming }: AgentChatPlanBlockProps): React.ReactElement {
  const hasFailures = steps.some((step) => step.status === 'failed');
  const allDone = completedCount === steps.length && steps.length > 0 && !isStreaming;
  const borderColor = hasFailures ? 'rgba(248, 81, 73, 0.3)' : allDone ? 'rgba(63, 185, 80, 0.3)' : undefined;

  return (
    <div className={`my-1.5 rounded-md border text-xs transition-all duration-150 bg-surface-raised ${hasFailures || allDone ? '' : 'border-border-semantic'}`} style={{ borderColor }}>
      <div className="px-3 pb-1.5 pt-2.5">
        <div className="mb-2 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-semantic-muted"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="16" x2="12" y2="16" /></svg>
          <span className="font-medium text-text-semantic-primary">Plan</span>
          {allDone && <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: 'rgba(63, 185, 80, 0.15)', color: '#3fb950' }}>Complete</span>}
          {hasFailures && <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: 'rgba(248, 81, 73, 0.15)', color: '#f85149' }}>Failed</span>}
        </div>
        <PlanProgressBar total={steps.length} completed={completedCount} isStreaming={isStreaming} />
      </div>
      <div className="border-t border-border-semantic px-3 py-2">
        <ul className="space-y-0.5">{steps.map((step) => <PlanStepItem key={step.id} step={step} />)}</ul>
      </div>
    </div>
  );
}
