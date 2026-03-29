/**
 * AgentSummaryBar.tsx - Compact summary strip shown above the agent card list.
 *
 * Shows color-coded counts: running (accent), complete (green), errors (red).
 * Pulsing dot animation when any agents are running.
 * "Clear completed" button dismisses all finished / errored sessions.
 */

import React, { memo, useMemo, useState } from 'react';

import { estimateCost, formatCost, formatTokenCount } from './costCalculator';
import type { AgentSession } from './types';

interface AgentSummaryBarProps {
  sessions: AgentSession[];
  onClearCompleted: () => void;
}

interface TokenTotals {
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
}

interface AgentSessionSummary {
  running: number;
  complete: number;
  errors: number;
  total: number;
  hasFinished: boolean;
  hasTokens: boolean;
  tokenTotals: TokenTotals;
}

interface SessionCostDebug {
  sessionId: string;
  model: string | undefined;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

function logCostDebug(sessions: AgentSession[], perSession: SessionCostDebug[], totalCost: number): void {
  console.warn(
    '[cost-debug] AgentSummaryBar recompute',
    'numSessions:', sessions.length,
    'perSession:', perSession,
    'totalCost:', totalCost,
  );
}

function useAgentSummary(sessions: AgentSession[]): AgentSessionSummary {
  return useMemo(() => {
    let running = 0;
    let complete = 0;
    let errors = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let totalCost = 0;

    const perSession = sessions.map((session) => {
      running += Number(session.status === 'running');
      complete += Number(session.status === 'complete');
      errors += Number(session.status === 'error');
      inputTokens += session.inputTokens;
      outputTokens += session.outputTokens;
      const sessionCost = session.costUsd ?? estimateCost(session).totalCost;
      totalCost += sessionCost;
      return { sessionId: session.id, model: session.model,
        inputTokens: session.inputTokens, outputTokens: session.outputTokens,
        estimatedCost: sessionCost };
    });

    logCostDebug(sessions, perSession, totalCost);

    return {
      running, complete, errors,
      total: sessions.length,
      hasFinished: complete > 0 || errors > 0,
      hasTokens: inputTokens > 0 || outputTokens > 0,
      tokenTotals: { inputTokens, outputTokens, totalCost },
    };
  }, [sessions]);
}

function SummarySeparator(): React.ReactElement<any> {
  return <span className="text-text-semantic-faint">·</span>;
}

function SummaryCounts({ summary }: { summary: AgentSessionSummary }): React.ReactElement<any> {
  const items = [
    { count: summary.running, color: 'var(--interactive-accent)', label: 'running' },
    { count: summary.complete, color: 'var(--status-success)', label: 'done' },
    { count: summary.errors, color: 'var(--status-error)', label: 'failed' },
  ].filter((item) => item.count > 0);

  return (
    <>
      <span className="text-text-semantic-muted">
        {summary.total} agent{summary.total !== 1 ? 's' : ''}
      </span>
      {items.map((item) => (
        <React.Fragment key={item.label}>
          <SummarySeparator />
          <span style={{ color: item.color }}>
            {item.count} {item.label}
          </span>
        </React.Fragment>
      ))}
    </>
  );
}

function SummaryTokens({ tokenTotals }: { tokenTotals: TokenTotals }): React.ReactElement<any> {
  return (
    <>
      <SummarySeparator />
      <span
        className="text-text-semantic-muted"
        style={{ fontFamily: 'var(--font-mono)' }}
        title={`Total: ↓${tokenTotals.inputTokens.toLocaleString()} input, ↑${tokenTotals.outputTokens.toLocaleString()} output`}
      >
        {'↓'}
        {formatTokenCount(tokenTotals.inputTokens)}
        {' ↑'}
        {formatTokenCount(tokenTotals.outputTokens)}
      </span>
      <span className="text-interactive-accent" style={{ fontFamily: 'var(--font-mono)' }}>
        ~{formatCost(tokenTotals.totalCost)}
      </span>
    </>
  );
}

function ClearCompletedButton({ onClick }: { onClick: () => void }): React.ReactElement<any> {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      className="shrink-0 text-[10px] px-1.5 py-0.5 rounded transition-colors"
      style={{
        color: hovered ? 'var(--text-muted)' : 'var(--text-faint)',
        background: hovered ? 'var(--surface-raised)' : 'transparent',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Dismiss all completed and failed agents"
    >
      Clear
    </button>
  );
}

function RunningDot(): React.ReactElement<any> {
  return (
    <span
      className="w-1.5 h-1.5 rounded-full shrink-0"
      style={{
        background: 'var(--interactive-accent)',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
    />
  );
}

export const AgentSummaryBar = memo(function AgentSummaryBar({
  sessions,
  onClearCompleted,
}: AgentSummaryBarProps): React.ReactElement<any> {
  const summary = useAgentSummary(sessions);

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
    >
      {summary.running > 0 && <RunningDot />}
      <span className="flex-1 flex items-center gap-1.5 text-[11px] font-mono flex-wrap">
        <SummaryCounts summary={summary} />
        {summary.hasTokens && <SummaryTokens tokenTotals={summary.tokenTotals} />}
      </span>
      {summary.hasFinished && <ClearCompletedButton onClick={onClearCompleted} />}
    </div>
  );
});
