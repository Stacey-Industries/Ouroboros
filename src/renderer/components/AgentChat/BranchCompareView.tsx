/**
 * BranchCompareView.tsx — Wave 23 Phase E
 *
 * Side-by-side comparison of two branch threads.
 * Fetches both threads via loadThread and renders their messages
 * in two scrollable columns.
 */
import React, { useEffect, useState } from 'react';

import type { AgentChatMessageRecord, AgentChatThreadRecord } from '../../types/electron';
import { MessageMarkdown } from './MessageMarkdown';

// ── Types ────────────────────────────────────────────────────────────────────

export interface BranchCompareViewProps {
  leftThreadId: string;
  rightThreadId: string;
  onClose: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

function getThreadLabel(thread: AgentChatThreadRecord | null, threadId: string): string {
  if (!thread) return threadId.slice(0, 8);
  return thread.branchName ?? thread.title ?? threadId.slice(0, 8);
}

// ── Thread loading ────────────────────────────────────────────────────────────

interface ThreadLoadState {
  thread: AgentChatThreadRecord | null;
  loading: boolean;
  error: string | null;
}

function useThreadLoad(threadId: string): ThreadLoadState {
  const [thread, setThread] = useState<AgentChatThreadRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    if (!hasElectronAPI()) {
      setLoading(false);
      setError('electronAPI not available');
      return;
    }
    window.electronAPI.agentChat
      .loadThread(threadId)
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.thread) {
          setThread(result.thread);
        } else {
          setError(result.error ?? 'Failed to load thread');
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load thread');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  return { thread, loading, error };
}

// ── Message column ────────────────────────────────────────────────────────────

interface MessageColumnProps {
  messages: AgentChatMessageRecord[];
  label: string;
}

function MessageBubble({ message }: { message: AgentChatMessageRecord }): React.ReactElement {
  const isUser = message.role === 'user';
  return (
    <div
      className={[
        'rounded-md px-3 py-2 text-xs',
        isUser
          ? 'bg-interactive-accent-subtle text-text-semantic-primary self-end'
          : 'bg-surface-raised text-text-semantic-primary',
      ].join(' ')}
    >
      <div className="mb-0.5 text-[10px] font-medium text-text-semantic-muted">
        {isUser ? 'You' : 'Claude'}
      </div>
      <MessageMarkdown content={message.content} />
    </div>
  );
}

function MessageColumn({ messages, label }: MessageColumnProps): React.ReactElement {
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-r border-border-semantic last:border-r-0">
      <div className="shrink-0 border-b border-border-semantic bg-surface-panel px-3 py-2 text-xs font-medium text-text-semantic-primary">
        {label}
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="text-xs text-text-semantic-muted">No messages</div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

interface CompareHeaderProps {
  leftLabel: string;
  rightLabel: string;
  onClose: () => void;
}

function CompareHeader({ leftLabel, rightLabel, onClose }: CompareHeaderProps): React.ReactElement {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border-semantic bg-surface-panel px-4 py-2">
      <span className="flex-1 truncate text-sm font-medium text-text-semantic-primary">
        {leftLabel}
      </span>
      <span className="shrink-0 text-text-semantic-muted" aria-hidden="true">
        &#x21C4;
      </span>
      <span className="flex-1 truncate text-right text-sm font-medium text-text-semantic-primary">
        {rightLabel}
      </span>
      <button
        className="ml-2 shrink-0 rounded p-1 text-text-semantic-muted hover:bg-surface-raised hover:text-text-semantic-primary"
        onClick={onClose}
        aria-label="Close comparison"
        title="Close"
      >
        &#x2715;
      </button>
    </div>
  );
}

// ── Loading / error states ────────────────────────────────────────────────────

function LoadingPane(): React.ReactElement {
  return (
    <div className="flex flex-1 items-center justify-center text-xs text-text-semantic-muted" aria-busy="true">
      Loading…
    </div>
  );
}

function ErrorPane({ message }: { message: string }): React.ReactElement {
  return (
    <div className="flex flex-1 items-center justify-center text-xs text-status-error" role="alert">
      {message}
    </div>
  );
}

// ── Body content ─────────────────────────────────────────────────────────────

interface CompareBodyProps {
  left: ThreadLoadState;
  right: ThreadLoadState;
  leftLabel: string;
  rightLabel: string;
}

function CompareBody({ left, right, leftLabel, rightLabel }: CompareBodyProps): React.ReactElement {
  if (left.loading || right.loading) return <LoadingPane />;
  const errorMessage = left.error ?? right.error ?? null;
  if (errorMessage) return <ErrorPane message={errorMessage} />;
  return (
    <>
      <MessageColumn messages={left.thread?.messages ?? []} label={leftLabel} />
      <MessageColumn messages={right.thread?.messages ?? []} label={rightLabel} />
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function BranchCompareView({
  leftThreadId,
  rightThreadId,
  onClose,
}: BranchCompareViewProps): React.ReactElement {
  const left = useThreadLoad(leftThreadId);
  const right = useThreadLoad(rightThreadId);

  const leftLabel = getThreadLabel(left.thread, leftThreadId);
  const rightLabel = getThreadLabel(right.thread, rightThreadId);

  return (
    <div
      className="flex h-full flex-col overflow-hidden bg-surface-panel"
      role="dialog"
      aria-label="Branch comparison"
      aria-modal="true"
    >
      <CompareHeader leftLabel={leftLabel} rightLabel={rightLabel} onClose={onClose} />
      <div className="flex min-h-0 flex-1">
        <CompareBody left={left} right={right} leftLabel={leftLabel} rightLabel={rightLabel} />
      </div>
    </div>
  );
}
