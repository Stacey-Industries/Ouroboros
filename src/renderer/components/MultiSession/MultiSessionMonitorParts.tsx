import React, { memo, useEffect, useRef, useState } from 'react';
import type { AgentSession, ToolCallEvent } from '../AgentMonitor/types';
import { formatCost, formatTokenCount } from '../AgentMonitor/costCalculator';
import type { BatchStats, GridLayout } from './multiSessionMonitorModel';
import { estimateSessionCost } from './multiSessionMonitorModel';

const STATUS_CONFIG = {
  idle: { label: 'Idle', dotColor: 'var(--text-faint)', bgTint: 'transparent' },
  running: { label: 'Running', dotColor: 'var(--accent)', bgTint: 'color-mix(in srgb, var(--accent) 5%, transparent)' },
  complete: { label: 'Done', dotColor: 'var(--success)', bgTint: 'color-mix(in srgb, var(--success) 5%, transparent)' },
  error: { label: 'Error', dotColor: 'var(--error)', bgTint: 'color-mix(in srgb, var(--error) 5%, transparent)' },
} as const;

function getToolCallColor(status: ToolCallEvent['status']): string {
  if (status === 'pending') return 'var(--accent)';
  return status === 'success' ? 'var(--success)' : 'var(--error)';
}

function updateCloseButtonColor(button: HTMLButtonElement, hover: boolean): void {
  button.style.color = hover ? 'var(--text)' : 'var(--text-faint)';
}

function updateBorderButtonColors(button: HTMLButtonElement, hover: boolean): void {
  button.style.borderColor = hover ? 'var(--accent)' : 'var(--border)';
  button.style.color = hover ? 'var(--accent)' : 'var(--text-faint)';
}

const CompactToolCall = memo(function CompactToolCall({ call }: { call: ToolCallEvent }): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5 truncate px-2 py-0.5" style={{ fontSize: '10px' }}>
      <span className="h-1 w-1 shrink-0 rounded-full" style={{ background: getToolCallColor(call.status) }} />
      <span className="shrink-0 font-medium text-text-semantic-muted">{call.toolName}</span>
      <span className="truncate text-text-semantic-faint">{call.status === 'pending' ? '... ' : ''}{call.input}</span>
    </div>
  );
});

function useElapsedLabel(startedAt: number, running: boolean): string {
  const [seconds, setSeconds] = useState(() => Math.floor((Date.now() - startedAt) / 1000));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!running) {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
      return;
    }
    intervalRef.current = setInterval(() => { setSeconds(Math.floor((Date.now() - startedAt) / 1000)); }, 1000);
    return () => { if (intervalRef.current !== null) clearInterval(intervalRef.current); };
  }, [startedAt, running]);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s` : `${remainingSeconds}s`;
}

function PanelGridIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="text-interactive-accent" style={{ flexShrink: 0 }}>
      <rect x="1" y="1" width="5" height="6" rx="1" />
      <rect x="10" y="1" width="5" height="6" rx="1" />
      <rect x="1" y="9" width="5" height="6" rx="1" />
      <rect x="10" y="9" width="5" height="6" rx="1" />
    </svg>
  );
}

function CloseIcon(): React.ReactElement {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}

function EmptySessionCell({ label }: { label: string }): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded bg-surface-panel border border-border-semantic">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true" className="text-text-semantic-faint" style={{ marginBottom: '6px' }}>
        <circle cx="10" cy="10" r="8" strokeDasharray="4 3" />
      </svg>
      <span className="text-[10px] italic text-text-semantic-faint">{label}: waiting for session...</span>
    </div>
  );
}

function SessionHeader({ elapsed, isRunning, session }: { elapsed: string; isRunning: boolean; session: AgentSession }): React.ReactElement {
  const status = STATUS_CONFIG[session.status];
  return (
    <div className="flex flex-shrink-0 items-center gap-2 px-2.5 py-1.5 border-b border-border-semantic">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: status.dotColor, animation: isRunning ? 'pulse 1.5s ease-in-out infinite' : undefined }} />
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-text-semantic-primary" title={session.taskLabel}>{session.taskLabel}</span>
      <span className="shrink-0 text-[10px] font-medium" style={{ color: status.dotColor }}>{status.label}</span>
      <span className="shrink-0 text-[10px] tabular-nums text-text-semantic-faint">{elapsed}</span>
    </div>
  );
}

function ToolCallFeed({ isRunning, latestCalls }: { isRunning: boolean; latestCalls: ToolCallEvent[] }): React.ReactElement {
  if (latestCalls.length === 0) {
    return <div className="flex h-full items-center justify-center text-[10px] italic text-text-semantic-faint">{isRunning ? 'Waiting for tool calls...' : 'No tool calls'}</div>;
  }
  return <div className="py-1">{latestCalls.map((call) => <CompactToolCall key={call.id} call={call} />)}</div>;
}

function TokenSummary({ inputTokens, outputTokens }: { inputTokens: number; outputTokens: number }): React.ReactElement {
  return (
    <span className="flex items-center gap-1 font-mono text-[10px] text-text-semantic-faint">
      <span className="text-text-semantic-muted">{'↓'}{formatTokenCount(inputTokens)}</span>
      <span className="text-text-semantic-muted">{'↑'}{formatTokenCount(outputTokens)}</span>
    </span>
  );
}

function ViewFullButton({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className="rounded px-1.5 py-0.5 text-[10px] transition-colors text-text-semantic-faint border border-border-semantic"
      style={{ background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
      onMouseEnter={(event) => updateBorderButtonColors(event.currentTarget, true)}
      onMouseLeave={(event) => updateBorderButtonColors(event.currentTarget, false)}
      title="View this session in the full agent monitor"
    >
      View Full
    </button>
  );
}

function SessionFooter({ onViewFull, session }: { onViewFull: () => void; session: AgentSession }): React.ReactElement {
  return (
    <div className="flex flex-shrink-0 items-center gap-2 px-2.5 py-1 border-t border-border-semantic">
      <TokenSummary inputTokens={session.inputTokens} outputTokens={session.outputTokens} />
      <span className="font-mono text-[10px] text-interactive-accent">~{formatCost(estimateSessionCost(session))}</span>
      <span className="flex-1" />
      <ViewFullButton onClick={onViewFull} />
    </div>
  );
}

const SessionCell = memo(function SessionCell({ label, onViewFull, session }: { label: string; onViewFull: () => void; session: AgentSession | null }): React.ReactElement {
  const isRunning = session?.status === 'running';
  const elapsed = useElapsedLabel(session?.startedAt ?? Date.now(), isRunning ?? false);
  if (!session) return <EmptySessionCell label={label} />;
  const status = STATUS_CONFIG[session.status];
  return (
    <div className="flex h-full flex-col overflow-hidden rounded" style={{ background: status.bgTint, border: `1px solid ${session.status === 'error' ? 'var(--error)' : 'var(--border)'}` }}>
      <SessionHeader elapsed={elapsed} isRunning={isRunning ?? false} session={session} />
      <div className="min-h-0 flex-1 overflow-hidden"><ToolCallFeed isRunning={isRunning ?? false} latestCalls={session.toolCalls.slice(-3)} /></div>
      <SessionFooter onViewFull={onViewFull} session={session} />
    </div>
  );
});

function HeaderCloseButton({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className="shrink-0 rounded p-1 transition-colors text-text-semantic-faint"
      style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
      onMouseEnter={(event) => updateCloseButtonColor(event.currentTarget, true)}
      onMouseLeave={(event) => updateCloseButtonColor(event.currentTarget, false)}
      title="Exit multi-session view"
      aria-label="Exit multi-session view"
    >
      <CloseIcon />
    </button>
  );
}

export function MonitorHeader({ completed, onClose, total }: { completed: number; onClose: () => void; total: number }): React.ReactElement {
  return (
    <div className="flex flex-shrink-0 items-center gap-2 px-3 py-2 border-b border-border-semantic">
      <PanelGridIcon />
      <span className="flex-1 text-xs font-semibold text-text-semantic-primary">Multi-Session Monitor</span>
      <span className="text-[10px] tabular-nums text-text-semantic-faint">{completed}/{total} complete</span>
      <HeaderCloseButton onClick={onClose} />
    </div>
  );
}

export function SessionGrid({ batchLabels, batchSessions, gridLayout, onViewFull }: { batchLabels: string[]; batchSessions: Array<AgentSession | null>; gridLayout: GridLayout; onViewFull: () => void; }): React.ReactElement {
  return (
    <div className="min-h-0 flex-1 p-2" style={{ display: 'grid', gridTemplateColumns: `repeat(${gridLayout.columns}, 1fr)`, gridTemplateRows: `repeat(${gridLayout.rows}, 1fr)`, gap: '6px' }}>
      {batchLabels.map((label, index) => <SessionCell key={`${label}-${index}`} label={label} onViewFull={onViewFull} session={batchSessions[index]} />)}
    </div>
  );
}

function FooterMetric({ label, value, valueColor }: { label: string; value: React.ReactNode; valueColor: string }): React.ReactElement {
  return <div className="flex items-center gap-1"><span className="text-[10px] text-text-semantic-faint">{label}</span><span className="text-[11px]" style={{ color: valueColor }}>{value}</span></div>;
}

function TokenMetric({ stats }: { stats: BatchStats }): React.ReactElement {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-text-semantic-faint">Tokens:</span>
      <span className="font-mono text-[11px] tabular-nums text-text-semantic-muted">{formatTokenCount(stats.totalInputTokens + stats.totalOutputTokens)}</span>
      <span className="text-[10px] text-text-semantic-faint">({formatTokenCount(stats.totalInputTokens)} in / {formatTokenCount(stats.totalOutputTokens)} out)</span>
    </div>
  );
}

export function MonitorFooter({ stats }: { stats: BatchStats }): React.ReactElement {
  return (
    <div className="flex flex-shrink-0 items-center gap-4 px-3 py-2 border-t border-border-semantic bg-surface-panel">
      <FooterMetric label="Total cost:" value={`~${formatCost(stats.totalCost)}`} valueColor="var(--accent)" />
      <FooterMetric label="Sessions:" value={`${stats.completed}/${stats.total}`} valueColor={stats.completed === stats.total ? 'var(--success)' : 'var(--text-muted)'} />
      <TokenMetric stats={stats} />
    </div>
  );
}
