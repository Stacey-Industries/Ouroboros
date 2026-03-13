/**
 * MultiSessionMonitor.tsx — Side-by-side monitoring view for parallel Claude Code sessions.
 *
 * Activated after launching a multi-session batch. Shows a grid layout:
 * - 2x1 for 2 sessions, 2x2 for 3-4 sessions
 * - Each cell: compact session card with status, live tool calls, token/cost
 * - Bottom bar: aggregate cost, sessions completed/total, total tokens
 * - "View Full" button per session navigates to the main agent monitor
 */

import React, { memo, useMemo, useCallback, useState, useEffect, useRef } from 'react';
import type { AgentSession, ToolCallEvent } from '../AgentMonitor/types';
import { useAgentEventsContext } from '../../contexts/AgentEventsContext';
import { estimateCost, formatCost, formatTokenCount } from '../AgentMonitor/costCalculator';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  idle: { label: 'Idle', dotColor: 'var(--text-faint)', bgTint: 'transparent' },
  running: { label: 'Running', dotColor: 'var(--accent)', bgTint: 'color-mix(in srgb, var(--accent) 5%, transparent)' },
  complete: { label: 'Done', dotColor: 'var(--success)', bgTint: 'color-mix(in srgb, var(--success) 5%, transparent)' },
  error: { label: 'Error', dotColor: 'var(--error)', bgTint: 'color-mix(in srgb, var(--error) 5%, transparent)' },
} as const;

// ─── Compact tool call display ────────────────────────────────────────────────

interface CompactToolCallProps {
  call: ToolCallEvent;
}

const CompactToolCall = memo(function CompactToolCall({ call }: CompactToolCallProps): React.ReactElement {
  const statusIcon = call.status === 'pending' ? '...' : call.status === 'success' ? '' : '';

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-0.5 truncate"
      style={{ fontSize: '10px' }}
    >
      <span
        className="shrink-0 w-1 h-1 rounded-full"
        style={{
          background: call.status === 'pending'
            ? 'var(--accent)'
            : call.status === 'success'
              ? 'var(--success)'
              : 'var(--error)',
        }}
      />
      <span
        className="shrink-0 font-medium"
        style={{ color: 'var(--text-muted)' }}
      >
        {call.toolName}
      </span>
      <span
        className="truncate"
        style={{ color: 'var(--text-faint)' }}
      >
        {statusIcon} {call.input}
      </span>
    </div>
  );
});

// ─── Elapsed time hook ────────────────────────────────────────────────────────

function useElapsedLabel(startedAt: number, running: boolean): string {
  const [seconds, setSeconds] = useState(() => Math.floor((Date.now() - startedAt) / 1000));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
      return;
    }
    intervalRef.current = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [startedAt, running]);

  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

// ─── Session cell ─────────────────────────────────────────────────────────────

interface SessionCellProps {
  session: AgentSession | null;
  label: string;
  onViewFull: (sessionId: string) => void;
}

const SessionCell = memo(function SessionCell({
  session,
  label,
  onViewFull,
}: SessionCellProps): React.ReactElement {
  const isRunning = session?.status === 'running';
  const elapsed = useElapsedLabel(session?.startedAt ?? Date.now(), isRunning ?? false);

  if (!session) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full rounded"
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          aria-hidden="true"
          style={{ color: 'var(--text-faint)', marginBottom: '6px' }}
        >
          <circle cx="10" cy="10" r="8" strokeDasharray="4 3" />
        </svg>
        <span
          className="text-[10px] italic"
          style={{ color: 'var(--text-faint)' }}
        >
          {label}: waiting for session...
        </span>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[session.status];
  const latestCalls = session.toolCalls.slice(-3);
  const cost = estimateCost({
    inputTokens: session.inputTokens,
    outputTokens: session.outputTokens,
    model: session.model,
    cacheReadTokens: session.cacheReadTokens,
    cacheWriteTokens: session.cacheWriteTokens,
  });

  return (
    <div
      className="flex flex-col h-full rounded overflow-hidden"
      style={{
        background: statusCfg.bgTint,
        border: `1px solid ${session.status === 'error' ? 'var(--error)' : 'var(--border)'}`,
      }}
    >
      {/* Cell header */}
      <div
        className="flex items-center gap-2 px-2.5 py-1.5 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-muted)' }}
      >
        {/* Status dot */}
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{
            background: statusCfg.dotColor,
            animation: isRunning ? 'pulse 1.5s ease-in-out infinite' : undefined,
          }}
        />

        {/* Task label */}
        <span
          className="flex-1 min-w-0 text-[11px] font-medium truncate"
          style={{ color: 'var(--text)' }}
          title={session.taskLabel}
        >
          {session.taskLabel}
        </span>

        {/* Status label */}
        <span
          className="text-[10px] font-medium shrink-0"
          style={{ color: statusCfg.dotColor }}
        >
          {statusCfg.label}
        </span>

        {/* Elapsed time */}
        <span
          className="text-[10px] tabular-nums shrink-0"
          style={{ color: 'var(--text-faint)' }}
        >
          {elapsed}
        </span>
      </div>

      {/* Tool call feed (latest 3) */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {latestCalls.length > 0 ? (
          <div className="py-1">
            {latestCalls.map((tc) => (
              <CompactToolCall key={tc.id} call={tc} />
            ))}
          </div>
        ) : (
          <div
            className="flex items-center justify-center h-full text-[10px] italic"
            style={{ color: 'var(--text-faint)' }}
          >
            {isRunning ? 'Waiting for tool calls...' : 'No tool calls'}
          </div>
        )}
      </div>

      {/* Cell footer: tokens + cost + view full */}
      <div
        className="flex items-center gap-2 px-2.5 py-1 flex-shrink-0"
        style={{ borderTop: '1px solid var(--border-muted)' }}
      >
        {/* Token counts */}
        <span
          className="text-[10px] font-mono flex items-center gap-1"
          style={{ color: 'var(--text-faint)' }}
        >
          <span style={{ color: 'var(--text-muted)' }}>
            {'↓'}{formatTokenCount(session.inputTokens)}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>
            {'↑'}{formatTokenCount(session.outputTokens)}
          </span>
        </span>

        {/* Cost */}
        <span
          className="text-[10px] font-mono"
          style={{ color: 'var(--accent)' }}
        >
          ~{formatCost(cost.totalCost)}
        </span>

        <span className="flex-1" />

        {/* View Full button */}
        <button
          onClick={() => onViewFull(session.id)}
          className="text-[10px] px-1.5 py-0.5 rounded transition-colors"
          style={{
            color: 'var(--text-faint)',
            background: 'transparent',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)';
          }}
          title="View this session in the full agent monitor"
        >
          View Full
        </button>
      </div>
    </div>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

export interface MultiSessionMonitorProps {
  /** Labels of sessions to match (used to identify which agent sessions belong to this batch). */
  batchLabels: string[];
  onClose: () => void;
}

export const MultiSessionMonitor = memo(function MultiSessionMonitor({
  batchLabels,
  onClose,
}: MultiSessionMonitorProps): React.ReactElement {
  const { agents } = useAgentEventsContext();

  // Track batch session IDs — match by task label on most recent sessions.
  // We build the mapping once and update it as new sessions appear.
  const [batchSessionIds, setBatchSessionIds] = useState<string[]>([]);

  useEffect(() => {
    // Match labels to the most recent agent sessions.
    // Sort agents by startedAt descending, then greedily match each label.
    const sorted = [...agents].sort((a, b) => b.startedAt - a.startedAt);
    const usedIds = new Set<string>();
    const matched: string[] = [];

    for (const label of batchLabels) {
      const match = sorted.find(
        (s) => s.taskLabel === label && !usedIds.has(s.id),
      );
      if (match) {
        usedIds.add(match.id);
        matched.push(match.id);
      }
    }

    // Only update if the matched set changed
    setBatchSessionIds((prev) => {
      const newSet = new Set(matched);
      if (prev.length === matched.length && prev.every((id) => newSet.has(id))) {
        return prev;
      }
      return matched;
    });
  }, [agents, batchLabels]);

  // Resolve sessions for each slot
  const batchSessions = useMemo(() => {
    return batchLabels.map((label, i) => {
      const id = batchSessionIds[i];
      return id ? agents.find((s) => s.id === id) ?? null : null;
    });
  }, [batchLabels, batchSessionIds, agents]);

  // Aggregate stats
  const stats = useMemo(() => {
    const resolved = batchSessions.filter((s): s is AgentSession => s !== null);
    const completed = resolved.filter((s) => s.status === 'complete' || s.status === 'error').length;
    const totalInputTokens = resolved.reduce((sum, s) => sum + s.inputTokens, 0);
    const totalOutputTokens = resolved.reduce((sum, s) => sum + s.outputTokens, 0);

    let totalCost = 0;
    for (const s of resolved) {
      totalCost += estimateCost({
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
        model: s.model,
        cacheReadTokens: s.cacheReadTokens,
        cacheWriteTokens: s.cacheWriteTokens,
      }).totalCost;
    }

    return {
      completed,
      total: batchLabels.length,
      totalInputTokens,
      totalOutputTokens,
      totalCost,
    };
  }, [batchSessions, batchLabels.length]);

  const handleViewFull = useCallback(() => {
    // Exit multi-session view — the main agent monitor will show all sessions
    onClose();
  }, [onClose]);

  // Grid layout: 2 columns, 1 row for 2 sessions, 2 rows for 3-4
  const sessionCount = batchLabels.length;
  const gridCols = sessionCount <= 2 ? sessionCount : 2;
  const gridRows = sessionCount <= 2 ? 1 : 2;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
          style={{ color: 'var(--accent)', flexShrink: 0 }}
        >
          <rect x="1" y="1" width="5" height="6" rx="1" />
          <rect x="10" y="1" width="5" height="6" rx="1" />
          <rect x="1" y="9" width="5" height="6" rx="1" />
          <rect x="10" y="9" width="5" height="6" rx="1" />
        </svg>
        <span
          className="text-xs font-semibold flex-1"
          style={{ color: 'var(--text)' }}
        >
          Multi-Session Monitor
        </span>
        <span
          className="text-[10px] tabular-nums"
          style={{ color: 'var(--text-faint)' }}
        >
          {stats.completed}/{stats.total} complete
        </span>
        <button
          onClick={onClose}
          className="shrink-0 p-1 rounded transition-colors"
          style={{
            color: 'var(--text-faint)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)'; }}
          title="Exit multi-session view"
          aria-label="Exit multi-session view"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Session grid */}
      <div
        className="flex-1 min-h-0 p-2"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
          gridTemplateRows: `repeat(${gridRows}, 1fr)`,
          gap: '6px',
        }}
      >
        {batchLabels.map((label, i) => (
          <SessionCell
            key={`${label}-${i}`}
            session={batchSessions[i]}
            label={label}
            onViewFull={handleViewFull}
          />
        ))}
      </div>

      {/* Aggregate stats bar */}
      <div
        className="flex items-center gap-4 px-3 py-2 flex-shrink-0"
        style={{
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
        }}
      >
        {/* Total cost */}
        <div className="flex items-center gap-1">
          <span
            className="text-[10px]"
            style={{ color: 'var(--text-faint)' }}
          >
            Total cost:
          </span>
          <span
            className="text-[11px] font-semibold font-mono"
            style={{ color: 'var(--accent)' }}
          >
            ~{formatCost(stats.totalCost)}
          </span>
        </div>

        {/* Sessions progress */}
        <div className="flex items-center gap-1">
          <span
            className="text-[10px]"
            style={{ color: 'var(--text-faint)' }}
          >
            Sessions:
          </span>
          <span
            className="text-[11px] font-semibold tabular-nums"
            style={{
              color: stats.completed === stats.total ? 'var(--success)' : 'var(--text-muted)',
            }}
          >
            {stats.completed}/{stats.total}
          </span>
        </div>

        {/* Total tokens */}
        <div className="flex items-center gap-1">
          <span
            className="text-[10px]"
            style={{ color: 'var(--text-faint)' }}
          >
            Tokens:
          </span>
          <span
            className="text-[11px] font-mono tabular-nums"
            style={{ color: 'var(--text-muted)' }}
          >
            {formatTokenCount(stats.totalInputTokens + stats.totalOutputTokens)}
          </span>
          <span
            className="text-[10px]"
            style={{ color: 'var(--text-faint)' }}
          >
            ({formatTokenCount(stats.totalInputTokens)} in / {formatTokenCount(stats.totalOutputTokens)} out)
          </span>
        </div>
      </div>
    </div>
  );
});
