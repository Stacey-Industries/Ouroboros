import { useCallback, useEffect, useState } from 'react';

import type { AgentChatContentBlock, AgentChatStreamChunk } from '../../types/electron-agent-chat';
import {
  type AgentChatStreamingState,
  applyChunk,
  INITIAL_STATE,
  replayBufferedChunks,
} from './AgentChatStreamingReducers';
import { useRafBatchedChunks } from './useRafBatchedChunks';

/** @deprecated Use AgentChatContentBlock directly. Kept as alias for backward compatibility. */
export type AssistantTurnBlock = AgentChatContentBlock;

export type { AgentChatStreamingState };

type StreamingApi = {
  onStreamChunk?: (cb: (chunk: AgentChatStreamChunk) => void) => (() => void) | void;
  getBufferedChunks?: (id: string) => Promise<AgentChatStreamChunk[]>;
};

function estimateStreamingStateScore(state: AgentChatStreamingState): number {
  const tokenUsageScore = state.streamingTokenUsage
    ? state.streamingTokenUsage.inputTokens + state.streamingTokenUsage.outputTokens
    : 0;
  return JSON.stringify(state.blocks).length + state.activeTextContent.length + tokenUsageScore;
}

export function mergeReplayState(
  existing: AgentChatStreamingState,
  replayed: AgentChatStreamingState,
): AgentChatStreamingState {
  if (!existing.streamingMessageId) return replayed;
  if (!replayed.streamingMessageId) return existing;
  if (existing.streamingMessageId !== replayed.streamingMessageId) return existing;
  if (!existing.isStreaming && replayed.isStreaming) return existing;
  if (!replayed.isStreaming && existing.isStreaming) return replayed;
  return estimateStreamingStateScore(replayed) >= estimateStreamingStateScore(existing)
    ? replayed
    : existing;
}

function getStreamingApi(): StreamingApi | undefined {
  return (window as unknown as { electronAPI?: { agentChat?: StreamingApi } }).electronAPI
    ?.agentChat;
}

function useStreamChunkListener(handleChunk: (chunk: AgentChatStreamChunk) => void): void {
  useEffect(() => {
    const api = getStreamingApi();
    if (!api?.onStreamChunk) return;
    const cleanup = api.onStreamChunk(handleChunk);
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [handleChunk]);
}

function useReplayBufferedChunks(
  activeThreadId: string | null,
  setStateMap: React.Dispatch<React.SetStateAction<ReadonlyMap<string, AgentChatStreamingState>>>,
): void {
  useEffect(() => {
    if (!activeThreadId) return;
    const api = getStreamingApi();
    if (!api?.getBufferedChunks) return;
    const threadId = activeThreadId;
    void api.getBufferedChunks(threadId).then((chunks: AgentChatStreamChunk[]) => {
      if (!chunks || chunks.length === 0) return;
      const replayed = replayBufferedChunks(chunks);
      setStateMap((prev) => {
        const existing = prev.get(threadId) ?? INITIAL_STATE;
        const merged = mergeReplayState(existing, replayed);
        if (merged === existing) return prev;
        const updated = new Map(prev);
        updated.set(threadId, merged);
        return updated;
      });
    });
  }, [activeThreadId, setStateMap]);
}

function useCleanupCompletedStreams(
  activeThreadId: string | null,
  activeState: AgentChatStreamingState,
  setStateMap: React.Dispatch<React.SetStateAction<ReadonlyMap<string, AgentChatStreamingState>>>,
): void {
  useEffect(() => {
    if (!activeThreadId || activeState.isStreaming || activeState.blocks.length === 0) return;
    const id = activeThreadId;
    const timer = setTimeout(() => {
      setStateMap((prev) => {
        const updated = new Map(prev);
        updated.delete(id);
        return updated;
      });
    }, 5000);
    return () => clearTimeout(timer);
  }, [activeThreadId, activeState.isStreaming, activeState.blocks.length, setStateMap]);
}

type SetStateMap = React.Dispatch<
  React.SetStateAction<ReadonlyMap<string, AgentChatStreamingState>>
>;

function applyOneChunk(
  prev: ReadonlyMap<string, AgentChatStreamingState>,
  chunk: AgentChatStreamChunk,
  updated: Map<string, AgentChatStreamingState> | null,
): Map<string, AgentChatStreamingState> | null {
  const tid = chunk.threadId;
  if (!tid) return updated;
  const threadPrev = (updated ?? prev).get(tid) ?? INITIAL_STATE;
  const next = applyChunk(threadPrev, chunk);
  if (next === null) return updated;
  const map = updated ?? new Map(prev);
  map.set(tid, next);
  return map;
}

function applyTerminalChunk(chunk: AgentChatStreamChunk, setStateMap: SetStateMap): void {
  setStateMap((prev) => {
    const tid = chunk.threadId;
    if (!tid) return prev;
    const threadPrev = prev.get(tid) ?? INITIAL_STATE;
    const next = applyChunk(threadPrev, chunk);
    if (next === null) return prev;
    const updated = new Map(prev);
    updated.set(tid, next);
    return updated;
  });
}

function useBatchedChunkHandler(setStateMap: SetStateMap): (chunk: AgentChatStreamChunk) => void {
  const applyBatch = useCallback(
    (chunks: AgentChatStreamChunk[]) => {
      setStateMap((prev) => {
        let updated: Map<string, AgentChatStreamingState> | null = null;
        for (const chunk of chunks) {
          updated = applyOneChunk(prev, chunk, updated);
        }
        return updated ?? prev;
      });
    },
    [setStateMap],
  );

  const { enqueue, flushNow, cleanup } = useRafBatchedChunks(applyBatch);

  useEffect(() => cleanup, [cleanup]);

  return useCallback(
    (chunk: AgentChatStreamChunk) => {
      if (!chunk.threadId) return;
      if (chunk.type === 'thread_snapshot') {
        if (chunk.thread) {
          window.dispatchEvent(
            new CustomEvent('agent-chat:thread-snapshot', { detail: chunk.thread }),
          );
        }
        return;
      }
      if (chunk.type === 'complete' || chunk.type === 'error') {
        flushNow();
        applyTerminalChunk(chunk, setStateMap);
        return;
      }
      enqueue(chunk);
    },
    [enqueue, flushNow, setStateMap],
  );
}

/**
 * Tracks in-flight assistant streams per-thread in a Map.
 * Delta chunks are rAF-batched: up to 50 chunks per frame collapse to a
 * single setStateMap call.  Terminal chunks (complete / error) flush the
 * pending buffer synchronously before being applied so they never lag.
 */
export function useAgentChatStreaming(activeThreadId: string | null): AgentChatStreamingState {
  const [stateMap, setStateMap] = useState<ReadonlyMap<string, AgentChatStreamingState>>(new Map());
  const handleChunk = useBatchedChunkHandler(setStateMap);

  useStreamChunkListener(handleChunk);
  useReplayBufferedChunks(activeThreadId, setStateMap);
  const activeState = (activeThreadId ? stateMap.get(activeThreadId) : null) ?? INITIAL_STATE;
  useCleanupCompletedStreams(activeThreadId, activeState, setStateMap);

  return activeState;
}
