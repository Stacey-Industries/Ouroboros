/**
 * AgentCard.tsx — Card for a single agent session.
 *
 * Shows:
 * - Task label, truncated session ID, status badge (dot + label), elapsed time
 * - Collapsible: collapsed → latest tool call inline; expanded → ToolCallFeed
 * - "Log" toggle to show AgentEventLog when fully expanded
 * - Dismiss button (X) for completed/errored sessions
 * - Error agents: red left-border accent
 * - Completed agents: slightly dimmed opacity
 */

import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import type { AgentSession } from './types';
import { ToolCallFeed } from './ToolCallFeed';
import { ToolCallTimeline } from './ToolCallTimeline';
import { AgentEventLog } from './AgentEventLog';
import { formatTokenCount, formatCost, estimateCost } from './costCalculator';
import { useToastContext } from '../../contexts/ToastContext';

// ─── Elapsed time hook ────────────────────────────────────────────────────────

function useElapsedMs(startedAt: number, running: boolean): number {
  const [elapsed, setElapsed] = useState(() => Date.now() - startedAt);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!running) {
      setElapsed(Date.now() - startedAt);
      return;
    }

    let active = true;
    function tick(): void {
      if (!active) return;
      setElapsed(Date.now() - startedAt);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [startedAt, running]);

  return elapsed;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  idle: { label: 'Idle', dotColor: 'var(--text-faint)', pulse: false },
  running: { label: 'Running', dotColor: 'var(--accent)', pulse: true },
  complete: { label: 'Done', dotColor: 'var(--success)', pulse: false },
  error: { label: 'Error', dotColor: 'var(--error)', pulse: false },
} as const;

interface StatusBadgeProps {
  status: AgentSession['status'];
}

const StatusBadge = memo(function StatusBadge({ status }: StatusBadgeProps): React.ReactElement {
  const cfg = STATUS_CONFIG[status];

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{
          background: cfg.dotColor,
          animation: cfg.pulse ? 'pulse 1.5s ease-in-out infinite' : undefined,
        }}
      />
      <span
        className="text-[10px] font-medium"
        style={{ color: cfg.dotColor }}
      >
        {cfg.label}
      </span>
    </span>
  );
});

// ─── Running progress strip ───────────────────────────────────────────────────

/**
 * Shows next to the status badge when the session is running:
 * - Pulsing animated spinner
 * - Elapsed time counter (updates every second via setInterval)
 * - Completed tool call count
 */

interface RunningProgressProps {
  startedAt: number;
  completedToolCallCount: number;
}

const RunningProgress = memo(function RunningProgress({
  startedAt,
  completedToolCallCount,
}: RunningProgressProps): React.ReactElement {
  const [elapsedSec, setElapsedSec] = useState(() => Math.floor((Date.now() - startedAt) / 1000));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [startedAt]);

  const minutes = Math.floor(elapsedSec / 60);
  const seconds = elapsedSec % 60;
  const elapsedLabel = minutes > 0
    ? `${minutes}m ${seconds.toString().padStart(2, '0')}s`
    : `${seconds}s`;

  return (
    <span
      className="inline-flex items-center gap-1 shrink-0"
      aria-label={`Running for ${elapsedLabel}, ${completedToolCallCount} tool calls completed`}
    >
      {/* Inject spinner keyframe once — harmless if already present */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Spinner */}
      <svg
        width="11"
        height="11"
        viewBox="0 0 11 11"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ animation: 'spin 0.9s linear infinite', flexShrink: 0 }}
      >
        <circle
          cx="5.5"
          cy="5.5"
          r="4"
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeDasharray="12 8"
          strokeLinecap="round"
        />
      </svg>

      {/* Elapsed time */}
      <span
        className="text-[10px] tabular-nums"
        style={{ color: 'var(--accent)', opacity: 0.85 }}
      >
        {elapsedLabel}
      </span>

      {/* Tool call count */}
      {completedToolCallCount > 0 && (
        <span
          className="text-[10px] tabular-nums"
          style={{ color: 'var(--text-faint)' }}
        >
          · {completedToolCallCount} call{completedToolCallCount !== 1 ? 's' : ''}
        </span>
      )}
    </span>
  );
});

// ─── View toggle (Feed / Timeline) ───────────────────────────────────────────

type CardView = 'feed' | 'timeline';

interface ViewToggleProps {
  view: CardView;
  onChange: (v: CardView) => void;
}

const ViewToggle = memo(function ViewToggle({ view, onChange }: ViewToggleProps): React.ReactElement {
  return (
    <div
      className="inline-flex items-center rounded overflow-hidden shrink-0"
      style={{ border: '1px solid var(--border-muted)' }}
    >
      {(['feed', 'timeline'] as const).map((v) => {
        const active = view === v;
        return (
          <button
            key={v}
            onClick={(e) => {
              e.stopPropagation();
              onChange(v);
            }}
            className="px-2 py-0.5 text-[10px] font-medium transition-colors"
            style={{
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--bg)' : 'var(--text-faint)',
              border: 'none',
              cursor: 'pointer',
              lineHeight: '1.4',
            }}
            title={v === 'feed' ? 'Tool call feed' : 'Gantt timeline'}
          >
            {v === 'feed' ? 'Feed' : 'Timeline'}
          </button>
        );
      })}
    </div>
  );
});

// ─── Chevron icon ─────────────────────────────────────────────────────────────

const ChevronIcon = memo(function ChevronIcon({
  open,
}: {
  open: boolean;
}): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 150ms ease' }}
    >
      <path
        d="M4 2.5L7.5 6L4 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});

// ─── Dismiss button ───────────────────────────────────────────────────────────

const DismissButton = memo(function DismissButton({
  onDismiss,
}: {
  onDismiss: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onDismiss();
      }}
      title="Dismiss"
      className="shrink-0 p-0.5 rounded transition-colors"
      style={{ color: 'var(--text-faint)' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)'; }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
});

// ─── Export dropdown ──────────────────────────────────────────────────────────

interface ExportButtonProps {
  session: AgentSession;
}

const ExportButton = memo(function ExportButton({ session }: ExportButtonProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { toast } = useToastContext();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleExport = useCallback(async (format: 'json' | 'markdown') => {
    setOpen(false);
    if (!window.electronAPI?.sessions?.export) {
      toast('Export not available', 'error');
      return;
    }
    try {
      const result = await window.electronAPI.sessions.export(session, format);
      if (!result.success) {
        toast(`Export failed: ${result.error ?? 'unknown error'}`, 'error');
      } else if (!result.cancelled) {
        toast(`Session exported as ${format === 'json' ? 'JSON' : 'Markdown'}`, 'success');
      }
    } catch {
      toast('Export failed', 'error');
    }
  }, [session, toast]);

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title="Export session"
        className="p-0.5 rounded transition-colors"
        style={{ color: 'var(--text-faint)' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)'; }}
      >
        {/* Download / export icon */}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path d="M5 1v5M2.5 4L5 6.5 7.5 4M1.5 8.5h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 rounded shadow-lg py-0.5"
          style={{
            top: '100%',
            marginTop: '2px',
            minWidth: '130px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
          }}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-[11px] transition-colors"
            style={{ color: 'var(--text)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            onClick={() => handleExport('json')}
          >
            Export as JSON
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-[11px] transition-colors"
            style={{ color: 'var(--text)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            onClick={() => handleExport('markdown')}
          >
            Export as Markdown
          </button>
        </div>
      )}
    </div>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

export interface AgentCardProps {
  session: AgentSession;
  onDismiss: (id: string) => void;
  onUpdateNotes?: (id: string, notes: string, bookmarked?: boolean) => void;
  onReviewChanges?: (sessionId: string) => void;
  onReplay?: (sessionId: string) => void;
}

export const AgentCard = memo(function AgentCard({
  session,
  onDismiss,
  onUpdateNotes,
  onReviewChanges,
  onReplay,
}: AgentCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(session.status === 'running');
  const [showLog, setShowLog] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(session.notes ?? '');
  const [cardView, setCardView] = useState<CardView>('feed');

  const isRunning = session.status === 'running';
  const isDone = session.status === 'complete' || session.status === 'error';

  const totalDuration = session.completedAt !== undefined
    ? session.completedAt - session.startedAt
    : undefined;

  const elapsedMs = useElapsedMs(session.startedAt, isRunning);
  const displayDuration = isRunning ? elapsedMs : (totalDuration ?? elapsedMs);

  const latestCall = session.toolCalls[session.toolCalls.length - 1];

  // Count completed (non-pending) tool calls for the progress indicator
  const completedCallCount = session.toolCalls.filter((tc) => tc.status !== 'pending').length;

  const handleToggle = useCallback(() => setExpanded((v) => !v), []);
  const handleDismiss = useCallback(() => onDismiss(session.id), [onDismiss, session.id]);

  return (
    <div
      className="border-b"
      style={{
        borderColor: 'var(--border-muted)',
        borderLeft: session.status === 'error'
          ? '3px solid var(--error)'
          : '3px solid transparent',
        opacity: session.status === 'complete' ? 0.7 : 1,
        transition: 'opacity 200ms ease',
      }}
    >
      {/* Card header */}
      <button
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left transition-colors"
        style={{ background: 'transparent' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        onClick={handleToggle}
        aria-expanded={expanded}
      >
        <ChevronIcon open={expanded} />

        {/* Task label */}
        <span
          className="flex-1 min-w-0 text-xs font-medium truncate"
          style={{ color: 'var(--text)' }}
          title={session.taskLabel}
        >
          {session.taskLabel}
        </span>

        {/* Status badge */}
        <StatusBadge status={session.status} />

        {/* Running progress: animated spinner + elapsed counter + call count */}
        {isRunning && (
          <RunningProgress
            startedAt={session.startedAt}
            completedToolCallCount={completedCallCount}
          />
        )}

        {/* Elapsed / total duration (shown only when not running — running uses RunningProgress) */}
        {!isRunning && (
          <span
            className="shrink-0 text-[10px] tabular-nums"
            style={{ color: 'var(--text-faint)' }}
          >
            {formatDuration(displayDuration)}
          </span>
        )}

        {/* Bookmark toggle */}
        {onUpdateNotes && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUpdateNotes(session.id, session.notes ?? '', !session.bookmarked);
            }}
            className="shrink-0 p-0.5 rounded transition-colors"
            style={{
              color: session.bookmarked ? 'var(--accent)' : 'var(--text-faint)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
            title={session.bookmarked ? 'Remove bookmark' : 'Bookmark this session'}
            aria-label={session.bookmarked ? 'Remove bookmark' : 'Bookmark session'}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill={session.bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.2">
              <path d="M2 1h6v8L5 7 2 9V1z" />
            </svg>
          </button>
        )}

        {/* Notes toggle */}
        {onUpdateNotes && (isDone || session.restored) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowNotes((v) => !v);
            }}
            className="shrink-0 p-0.5 rounded transition-colors"
            style={{
              color: session.notes ? 'var(--accent)' : 'var(--text-faint)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
            title="Add/edit notes"
            aria-label="Toggle notes"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M1 2h8M1 5h5M1 8h6" strokeLinecap="round" />
            </svg>
          </button>
        )}

        {/* Replay button — for completed sessions with tool calls */}
        {isDone && session.toolCalls.length > 0 && onReplay && (
          <button
            onClick={(e) => { e.stopPropagation(); onReplay(session.id); }}
            className="shrink-0 p-0.5 rounded transition-colors"
            style={{
              color: 'var(--text-faint)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)'; }}
            title="Replay this session step by step"
            aria-label="Replay session"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <path d="M2 1.5l6.5 3.5-6.5 3.5z" />
            </svg>
          </button>
        )}

        {/* Review Changes button — for completed sessions with a snapshot */}
        {isDone && session.snapshotHash && onReviewChanges && (
          <button
            onClick={(e) => { e.stopPropagation(); onReviewChanges(session.id); }}
            className="shrink-0 p-0.5 rounded transition-colors"
            style={{
              color: 'var(--text-faint)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)'; }}
            title="Review changes made by this agent"
            aria-label="Review changes"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M1 3h8M1 5h4M6 5l2 2-2 2M1 7h3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {/* Export button — always available for done sessions or historical sessions */}
        {(isDone || session.restored) && <ExportButton session={session} />}

        {/* Dismiss button for finished sessions */}
        {isDone && <DismissButton onDismiss={handleDismiss} />}
      </button>

      {/* Session ID + token usage (always visible, small) */}
      <div className="px-6 pb-1 flex items-center gap-2">
        <span
          className="text-[10px] font-mono"
          style={{ color: 'var(--text-faint)' }}
          title={session.id}
        >
          {session.id.slice(0, 12)}
        </span>

        {/* Restored badge for historical sessions */}
        {session.restored && (
          <span
            className="text-[9px] px-1 py-0.5 rounded"
            style={{
              color: 'var(--text-faint)',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-muted)',
              letterSpacing: '0.02em',
            }}
          >
            restored
          </span>
        )}

        {/* Token usage and cost */}
        {(session.inputTokens > 0 || session.outputTokens > 0) && (
          <span
            className="text-[10px] font-mono flex items-center gap-1.5"
            style={{ color: 'var(--text-faint)' }}
            title={`Input: ${session.inputTokens.toLocaleString()} tokens | Output: ${session.outputTokens.toLocaleString()} tokens${session.cacheReadTokens ? ` | Cache read: ${session.cacheReadTokens.toLocaleString()}` : ''}${session.cacheWriteTokens ? ` | Cache write: ${session.cacheWriteTokens.toLocaleString()}` : ''}`}
          >
            <span style={{ color: 'var(--text-muted)' }}>
              {'↓'}{formatTokenCount(session.inputTokens)}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>
              {'↑'}{formatTokenCount(session.outputTokens)}
            </span>
            <span style={{ color: 'var(--text-faint)' }}>tokens</span>
            <span style={{ color: 'var(--text-faint)' }}>·</span>
            <span style={{ color: 'var(--accent)' }}>
              ~{formatCost(estimateCost(session.inputTokens, session.outputTokens, session.model, session.cacheReadTokens, session.cacheWriteTokens).totalCost)}
            </span>
          </span>
        )}
      </div>

      {/* Error message */}
      {session.status === 'error' && session.error && (
        <div
          className="mx-2.5 mb-2 px-2 py-1.5 rounded text-[11px] selectable"
          style={{
            background: 'color-mix(in srgb, var(--error) 10%, transparent)',
            color: 'var(--error)',
            border: '1px solid color-mix(in srgb, var(--error) 20%, transparent)',
          }}
        >
          {session.error}
        </div>
      )}

      {/* Notes editor */}
      {showNotes && onUpdateNotes && (
        <div
          className="mx-2.5 mb-2 p-2 rounded"
          style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
          }}
        >
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={() => onUpdateNotes(session.id, notesDraft, session.bookmarked)}
            placeholder="Add notes about this session..."
            rows={2}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: 'var(--text)',
              fontSize: '11px',
              fontFamily: 'var(--font-ui)',
              outline: 'none',
              resize: 'vertical',
              minHeight: '36px',
              lineHeight: 1.5,
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      {/* Inline note display (when notes exist but editor is closed) */}
      {!showNotes && session.notes && (
        <div
          className="mx-6 mb-1.5 text-[10px] italic truncate"
          style={{ color: 'var(--text-muted)' }}
          title={session.notes}
        >
          {session.notes}
        </div>
      )}

      {/* Collapsed preview: show latest tool call inline */}
      {!expanded && latestCall && (
        <div
          className="px-6 pb-2 text-[10px] truncate"
          style={{ color: 'var(--text-faint)' }}
          title={`${latestCall.toolName}: ${latestCall.input}`}
        >
          <span style={{ color: 'var(--text-muted)' }}>{latestCall.toolName}</span>
          {' '}
          {latestCall.input}
        </div>
      )}

      {/* Expanded: view toggle + feed or timeline */}
      {expanded && (
        <div>
          {/* View toggle row — shown only when there are tool calls */}
          {session.toolCalls.length > 0 && (
            <div
              className="flex items-center justify-end px-3 py-1 gap-2"
              style={{ borderBottom: '1px solid var(--border-muted)' }}
            >
              <ViewToggle view={cardView} onChange={setCardView} />
            </div>
          )}

          {/* Feed or Timeline */}
          {cardView === 'feed' ? (
            <ToolCallFeed toolCalls={session.toolCalls} />
          ) : (
            <ToolCallTimeline
              toolCalls={session.toolCalls}
              sessionStartedAt={session.startedAt}
              sessionRunning={isRunning}
            />
          )}

          {/* Log toggle */}
          {session.toolCalls.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border-muted)' }}>
              <button
                onClick={() => setShowLog((v) => !v)}
                className="w-full px-3 py-1 text-[10px] text-left transition-colors"
                style={{ color: 'var(--text-faint)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)'; }}
              >
                {showLog ? '▲ Hide log' : '▼ Show event log'}
              </button>

              {showLog && (
                <AgentEventLog
                  toolCalls={session.toolCalls}
                  sessionId={session.id}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
