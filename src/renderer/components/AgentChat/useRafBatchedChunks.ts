/**
 * useRafBatchedChunks — coalesces streaming chunks so onFlush is called at
 * most once per requestAnimationFrame tick instead of once per chunk.
 *
 * On a fast model, 20–50 chunks arrive within a single frame.  Without
 * batching each chunk triggers a separate setStateMap call → 20–50 React
 * re-renders per frame.  With batching we get exactly one.
 *
 * API:
 *   enqueue(chunk)  — buffer a chunk; schedule a rAF flush if none pending
 *   flushNow()      — cancel pending rAF, drain buffer synchronously
 *   cleanup()       — cancel pending rAF on unmount (does NOT call onFlush)
 *
 * Implementation note: the mutable state lives in a plain closure so the
 * logic can be unit-tested without renderHook — just call makeBatcher()
 * directly.  The React hook wraps it in a ref so the identity is stable
 * across re-renders.
 */
import { useRef } from 'react';

import type { AgentChatStreamChunk } from '../../types/electron-agent-chat';

export type RafBatchedChunks = {
  enqueue: (chunk: AgentChatStreamChunk) => void;
  flushNow: () => void;
  cleanup: () => void;
};

// ─── Pure factory (testable without React) ───────────────────────────────────

export function makeBatcher(
  onFlush: (chunks: AgentChatStreamChunk[]) => void,
): RafBatchedChunks {
  let pending: AgentChatStreamChunk[] = [];
  let rafId: number | null = null;

  function drain(): AgentChatStreamChunk[] {
    const drained = pending;
    pending = [];
    return drained;
  }

  function flush(): void {
    rafId = null;
    const chunks = drain();
    if (chunks.length > 0) onFlush(chunks);
  }

  function enqueue(chunk: AgentChatStreamChunk): void {
    pending.push(chunk);
    if (rafId === null) {
      rafId = requestAnimationFrame(flush);
    }
  }

  function flushNow(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    const chunks = drain();
    if (chunks.length > 0) onFlush(chunks);
  }

  function cleanup(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    pending = [];
  }

  return { enqueue, flushNow, cleanup };
}

// ─── React hook (stable identity via useRef) ─────────────────────────────────

/**
 * React hook wrapping makeBatcher.  The batcher instance is created once per
 * mount and held in a ref so enqueue/flushNow/cleanup are stable across
 * re-renders even if the onFlush reference changes.
 *
 * IMPORTANT: onFlush is captured at mount time — callers must pass a stable
 * (useCallback) reference or accept that the captured version is used.
 * In useAgentChatStreaming, applyBatch is built from setStateMap which is
 * guaranteed stable by React, so this is safe.
 */
export function useRafBatchedChunks(
  onFlush: (chunks: AgentChatStreamChunk[]) => void,
): RafBatchedChunks {
  const batcherRef = useRef<RafBatchedChunks | null>(null);
  if (batcherRef.current === null) {
    batcherRef.current = makeBatcher(onFlush);
  }
  return batcherRef.current;
}
