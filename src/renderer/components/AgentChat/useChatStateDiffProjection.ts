/**
 * useChatStateDiffProjection.ts — Renderer-side projection hook for the new
 * chat orchestration state path (Wave 86 Phase 4).
 *
 * Subscribes to chatState:snapshot (push on subscribe) and chatState:diff
 * (incremental events) for a given threadId. Tracks the per-thread monotonic
 * seq; if a gap is detected, requests a fresh snapshot from main.
 *
 * Decision 4: renderer owns ephemera only. This hook is a read-only projection
 * of main-owned canonical state — it never mutates state in main.
 * Decision 6: multi-window live mirror — each window that mounts this hook
 * for the same threadId subscribes to the broadcaster independently.
 */

import type { ChatStateDiff, ChatStateSnapshot } from '@shared/types/chatStateDiff';
import { useCallback, useEffect, useState } from 'react';

// ─── Projection state ─────────────────────────────────────────────────────────

export interface ChatStateDiffProjection {
  status: ChatStateSnapshot['status'] | null;
  accumulatedText: string;
  activeTurnId: string | undefined;
  /** Last received seq — used for gap detection. */
  seq: number;
}

export const INITIAL_PROJECTION: ChatStateDiffProjection = {
  status: null,
  accumulatedText: '',
  activeTurnId: undefined,
  seq: -1,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function applySnapshot(snap: ChatStateSnapshot): ChatStateDiffProjection {
  return {
    status: snap.status,
    accumulatedText: snap.accumulatedText,
    activeTurnId: snap.activeTurnId,
    seq: snap.seq,
  };
}

function applyDiff(prev: ChatStateDiffProjection, diff: ChatStateDiff): ChatStateDiffProjection {
  // activeTurnId tracking: most non-status diffs carry a turnId. We adopt it so
  // selectStreamingState can detect the new path owns the active turn even when
  // the renderer subscribed AFTER the state machine activated (snapshot empty).
  switch (diff.type) {
    case 'status_changed':
      return {
        ...prev,
        status: diff.status,
        seq: diff.seq,
        activeTurnId: diff.status === 'idle' ? undefined : diff.activeTurnId,
      };
    case 'text_appended':
      return {
        ...prev,
        accumulatedText: prev.accumulatedText + diff.delta,
        activeTurnId: diff.turnId,
        seq: diff.seq,
      };
    case 'turn_completed':
      return {
        ...prev,
        accumulatedText: diff.finalText,
        activeTurnId: diff.turnId,
        seq: diff.seq,
      };
    case 'turn_failed':
    case 'turn_cancelled':
      return { ...prev, activeTurnId: diff.turnId, seq: diff.seq };
    case 'tool_call_started':
      return { ...prev, activeTurnId: diff.turnId, seq: diff.seq };
    default:
      return { ...prev, seq: diff.seq };
  }
}

function hasGap(prevSeq: number, incomingSeq: number): boolean {
  // prevSeq === -1 means no seq seen yet; no gap to detect
  if (prevSeq < 0) return false;
  return incomingSeq > prevSeq + 1;
}

// ─── API accessor ─────────────────────────────────────────────────────────────

type ChatStateApi = {
  onSnapshot: (threadId: string, cb: (s: ChatStateSnapshot) => void) => () => void;
  onStateDiff: (threadId: string, cb: (d: ChatStateDiff) => void) => () => void;
  requestSnapshot: (threadId: string) => Promise<ChatStateSnapshot>;
};

function getApi(): ChatStateApi | undefined {
  return (
    window as Window & typeof globalThis & { electronAPI?: { chatStateNewPath?: ChatStateApi } }
  ).electronAPI?.chatStateNewPath;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Subscribe to the new-path IPC channels for the given thread and return a
 * live projection of the current state machine state.
 * Returns INITIAL_PROJECTION when threadId is null.
 */
export function useChatStateDiffProjection(threadId: string | null): ChatStateDiffProjection {
  const [state, setState] = useState<ChatStateDiffProjection>(INITIAL_PROJECTION);

  const requestRecovery = useCallback((tid: string) => {
    void getApi()
      ?.requestSnapshot(tid)
      .then((snap) => setState(applySnapshot(snap)))
      .catch(() => {
        /* snapshot failures are non-fatal; keep current state */
      });
  }, []);

  useEffect(() => {
    if (!threadId) {
      setState(INITIAL_PROJECTION);
      return;
    }
    const api = getApi();
    if (!api) return;

    const unsubSnap = api.onSnapshot(threadId, (snap) => {
      setState(applySnapshot(snap));
    });

    const unsubDiff = api.onStateDiff(threadId, (diff) => {
      setState((prev) => {
        if (hasGap(prev.seq, diff.seq)) {
          requestRecovery(threadId);
          return prev;
        }
        return applyDiff(prev, diff);
      });
    });

    return () => {
      unsubSnap();
      unsubDiff();
    };
  }, [threadId, requestRecovery]);

  return state;
}
