import { useEffect, useState } from 'react';

import type { AgentChatThreadRecord } from '../../../types/electron';

export type CompletionState = 'none' | 'unseen' | 'seen';

const THREAD_COMPLETION_SEEN_KEY = 'agent-chat:thread-completion-seen';
const COMPLETED_STATUSES = new Set(['complete', 'cancelled', 'failed', 'needs_review']);

function isCompletedThread(status: AgentChatThreadRecord['status']): boolean {
  return COMPLETED_STATUSES.has(status);
}

function loadSeenCompletions(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(THREAD_COMPLETION_SEEN_KEY) ?? 'null') ?? {};
  } catch {
    return {};
  }
}

function persistSeenCompletions(value: Record<string, number>): void {
  try {
    localStorage.setItem(THREAD_COMPLETION_SEEN_KEY, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function useCompletionIndicators(
  threads: AgentChatThreadRecord[],
  activeThreadId: string | null,
): Record<string, CompletionState> {
  const [seenCompletions, setSeenCompletions] = useState<Record<string, number>>(() =>
    loadSeenCompletions(),
  );

  useEffect(() => {
    persistSeenCompletions(seenCompletions);
  }, [seenCompletions]);

  useEffect(() => {
    if (!activeThreadId) return;
    const activeThread = threads.find((thread) => thread.id === activeThreadId);
    if (!activeThread || !isCompletedThread(activeThread.status)) return;
    setSeenCompletions((prev) => {
      if ((prev[activeThread.id] ?? 0) >= activeThread.updatedAt) return prev;
      return { ...prev, [activeThread.id]: activeThread.updatedAt };
    });
  }, [activeThreadId, threads]);

  return threads.reduce<Record<string, CompletionState>>((acc, thread) => {
    if (!isCompletedThread(thread.status)) {
      acc[thread.id] = 'none';
      return acc;
    }
    acc[thread.id] = (seenCompletions[thread.id] ?? 0) >= thread.updatedAt ? 'seen' : 'unseen';
    return acc;
  }, {});
}
