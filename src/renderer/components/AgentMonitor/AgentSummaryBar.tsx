/**
 * AgentSummaryBar.tsx — Compact summary strip shown above the agent card list.
 *
 * Shows color-coded counts: running (accent), complete (green), errors (red).
 * Pulsing dot animation when any agents are running.
 * "Clear completed" button dismisses all finished / errored sessions.
 */

import React, { memo, useMemo } from 'react';
import type { AgentSession } from './types';
import { formatTokenCount, formatCost, estimateCost } from './costCalculator';

interface AgentSummaryBarProps {
  sessions: AgentSession[];
  onClearCompleted: () => void;
}

export const AgentSummaryBar = memo(function AgentSummaryBar({
  sessions,
  onClearCompleted,
}: AgentSummaryBarProps): React.ReactElement {
  const running = sessions.filter((s) => s.status === 'running').length;
  const complete = sessions.filter((s) => s.status === 'complete').length;
  const errors = sessions.filter((s) => s.status === 'error').length;
  const total = sessions.length;

  const hasFinished = complete > 0 || errors > 0;

  // Cumulative token totals and cost across all sessions
  const tokenTotals = useMemo(() => {
    let inputTokens = 0;
    let outputTokens = 0;
    let totalCost = 0;

    for (const s of sessions) {
      inputTokens += s.inputTokens;
      outputTokens += s.outputTokens;
      const cost = estimateCost(s.inputTokens, s.outputTokens, s.model, s.cacheReadTokens, s.cacheWriteTokens);
      totalCost += cost.totalCost;
    }

    return { inputTokens, outputTokens, totalCost };
  }, [sessions]);

  const hasTokens = tokenTotals.inputTokens > 0 || tokenTotals.outputTokens > 0;

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5"
      style={{ borderBottom: '1px solid var(--border-muted)' }}
    >
      {/* Pulsing dot when running */}
      {running > 0 && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{
            background: 'var(--accent)',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      )}

      {/* Summary text */}
      <span className="flex-1 flex items-center gap-1.5 text-[11px] font-mono flex-wrap">
        <span style={{ color: 'var(--text-muted)' }}>
          {total} agent{total !== 1 ? 's' : ''}
        </span>

        {running > 0 && (
          <>
            <span style={{ color: 'var(--text-faint)' }}>·</span>
            <span style={{ color: 'var(--accent)' }}>
              {running} running
            </span>
          </>
        )}

        {complete > 0 && (
          <>
            <span style={{ color: 'var(--text-faint)' }}>·</span>
            <span style={{ color: 'var(--success)' }}>
              {complete} done
            </span>
          </>
        )}

        {errors > 0 && (
          <>
            <span style={{ color: 'var(--text-faint)' }}>·</span>
            <span style={{ color: 'var(--error)' }}>
              {errors} failed
            </span>
          </>
        )}

        {hasTokens && (
          <>
            <span style={{ color: 'var(--text-faint)' }}>·</span>
            <span
              style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
              title={`Total: ↓${tokenTotals.inputTokens.toLocaleString()} input, ↑${tokenTotals.outputTokens.toLocaleString()} output`}
            >
              {'↓'}{formatTokenCount(tokenTotals.inputTokens)}
              {' ↑'}{formatTokenCount(tokenTotals.outputTokens)}
            </span>
            <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
              ~{formatCost(tokenTotals.totalCost)}
            </span>
          </>
        )}
      </span>

      {/* Clear completed button */}
      {hasFinished && (
        <button
          onClick={onClearCompleted}
          className="shrink-0 text-[10px] px-1.5 py-0.5 rounded transition-colors"
          style={{
            color: 'var(--text-faint)',
            background: 'transparent',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)';
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
          title="Dismiss all completed and failed agents"
        >
          Clear
        </button>
      )}
    </div>
  );
});
