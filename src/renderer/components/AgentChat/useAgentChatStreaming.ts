import { useCallback, useEffect, useState } from 'react';

import type { AgentChatContentBlock, AgentChatStreamChunk } from '../../types/electron-agent-chat';
import {
  type AgentChatStreamingState,
  applyChunk,
  INITIAL_STATE,
  replayBufferedChunks,
} from './AgentChatStreamingReducers';

/** @deprecated Use AgentChatContentBlock directly. Kept as alias for backward compatibility. */
export type AssistantTurnBlock = AgentChatContentBlock;

export type { AgentChatStreamingState };

type StreamingApi = {
  onStreamChunk?: (cb: (chunk: AgentChatStreamChunk) => void) => (() => void) | void;
  getBufferedChunks?: (id: string) => Promise<AgentChatStreamChunk[]>;
};

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
      setStateMap((prev) => {
        if (prev.has(threadId)) return prev;
        const updated = new Map(prev);
        updated.set(threadId, replayBufferedChunks(chunks));
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

/**
 * Tracks in-flight assistant streams per-thread in a Map.
 */
export function useAgentChatStreaming(activeThreadId: string | null): AgentChatStreamingState {
  const [stateMap, setStateMap] = useState<ReadonlyMap<string, AgentChatStreamingState>>(new Map());

  const handleChunk = useCallback((chunk: AgentChatStreamChunk) => {
    const { threadId } = chunk;
    if (!threadId) return;
    if (chunk.type === 'thread_snapshot') {
      if (chunk.thread) {
        window.dispatchEvent(
          new CustomEvent('agent-chat:thread-snapshot', { detail: chunk.thread }),
        );
      }
      return;
    }
    setStateMap((prev) => {
      const threadPrev = prev.get(threadId) ?? INITIAL_STATE;
      const next = applyChunk(threadPrev, chunk);
      if (next === null) return prev;
      const updated = new Map(prev);
      updated.set(threadId, next);
      return updated;
    });
  }, []);

  useStreamChunkListener(handleChunk);
  useReplayBufferedChunks(activeThreadId, setStateMap);
  const activeState = (activeThreadId ? stateMap.get(activeThreadId) : null) ?? INITIAL_STATE;
  useCleanupCompletedStreams(activeThreadId, activeState, setStateMap);

  return activeState;
}
