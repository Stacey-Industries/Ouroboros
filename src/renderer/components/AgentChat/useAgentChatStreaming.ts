import { useCallback, useEffect, useState } from 'react';
import type { ToolActivity } from './AgentChatToolCard';

export interface AgentChatStreamChunk {
  threadId: string;
  messageId: string;
  type: 'text_delta' | 'thinking_delta' | 'tool_activity' | 'complete' | 'error' | 'thread_snapshot';
  textDelta?: string;
  thinkingDelta?: string;
  toolActivity?: {
    name: string;
    status: 'running' | 'complete';
    filePath?: string;
    inputSummary?: string;
    editSummary?: { oldLines: number; newLines: number };
  };
  timestamp: number;
  thread?: unknown;
}

/** A discrete block within a single assistant turn */
export type AssistantTurnBlock =
  | { kind: 'text'; content: string }
  | { kind: 'thinking'; content: string; startedAt: number; duration?: number }
  | { kind: 'tool_use'; tool: ToolActivity; blockId: string };

export interface AgentChatStreamingState {
  isStreaming: boolean;
  streamingMessageId: string | null;
  blocks: AssistantTurnBlock[];
  /** The text content currently being appended to (the last text block, if any) */
  activeTextContent: string;
}

const INITIAL_STATE: AgentChatStreamingState = {
  isStreaming: false,
  streamingMessageId: null,
  blocks: [],
  activeTextContent: '',
};

let blockIdCounter = 0;
function generateBlockId(): string {
  return `block-${++blockIdCounter}`;
}

function sealThinkingBlocks(blocks: AssistantTurnBlock[], now: number): AssistantTurnBlock[] {
  let changed = false;
  const next = blocks.map((b) => {
    if (b.kind === 'thinking' && b.duration === undefined) {
      changed = true;
      return { ...b, duration: Math.round((now - b.startedAt) / 1000) };
    }
    return b;
  });
  return changed ? next : blocks;
}

/**
 * Pure state transition: apply one chunk to a thread's streaming state.
 * Returns the new state, or null if the chunk doesn't affect streaming state
 * (caller handles side-effects like thread_snapshot DOM dispatch separately).
 */
function applyChunk(
  prev: AgentChatStreamingState,
  chunk: AgentChatStreamChunk,
): AgentChatStreamingState | null {
  switch (chunk.type) {
    case 'text_delta': {
      const delta = chunk.textDelta ?? '';
      const sealed = sealThinkingBlocks(prev.blocks, Date.now());
      const blocks = [...sealed];
      const lastBlock = blocks[blocks.length - 1];
      if (lastBlock && lastBlock.kind === 'text') {
        blocks[blocks.length - 1] = { kind: 'text', content: lastBlock.content + delta };
      } else {
        blocks.push({ kind: 'text', content: delta });
      }
      const activeTextContent = (blocks[blocks.length - 1] as { kind: 'text'; content: string }).content;
      return { ...prev, isStreaming: true, streamingMessageId: chunk.messageId, blocks, activeTextContent };
    }

    case 'thinking_delta': {
      const delta = chunk.thinkingDelta ?? '';
      const blocks = [...prev.blocks];
      const lastBlock = blocks[blocks.length - 1];
      if (lastBlock && lastBlock.kind === 'thinking' && lastBlock.duration === undefined) {
        blocks[blocks.length - 1] = { ...lastBlock, content: lastBlock.content + delta };
      } else {
        blocks.push({ kind: 'thinking', content: delta, startedAt: Date.now() });
      }
      return { ...prev, isStreaming: true, streamingMessageId: chunk.messageId, blocks, activeTextContent: prev.activeTextContent };
    }

    case 'tool_activity': {
      if (!chunk.toolActivity) return prev;
      const { name, status, filePath, inputSummary, editSummary } = chunk.toolActivity;
      const sealed = sealThinkingBlocks(prev.blocks, Date.now());
      if (status === 'running') {
        const blocks: AssistantTurnBlock[] = [
          ...sealed,
          { kind: 'tool_use', tool: { name, status, filePath, inputSummary, editSummary }, blockId: generateBlockId() },
        ];
        return { ...prev, isStreaming: true, streamingMessageId: chunk.messageId, blocks, activeTextContent: '' };
      }
      const blocks = [...sealed];
      let found = false;
      for (let i = blocks.length - 1; i >= 0; i--) {
        const block = blocks[i];
        if (block.kind === 'tool_use' && block.tool.name === name && block.tool.status === 'running') {
          // Preserve input data from the 'running' event, merge with completion
          blocks[i] = { ...block, tool: { ...block.tool, name, status, filePath: filePath ?? block.tool.filePath } };
          found = true;
          break;
        }
      }
      if (!found) {
        blocks.push({ kind: 'tool_use', tool: { name, status, filePath, inputSummary, editSummary }, blockId: generateBlockId() });
      }
      return { ...prev, isStreaming: true, streamingMessageId: chunk.messageId, blocks, activeTextContent: prev.activeTextContent };
    }

    case 'complete': {
      // Seal any running tool blocks, mark streaming done — retain blocks briefly
      // so they stay visible until the persisted thread_snapshot replaces them.
      const blocks = prev.blocks.map((b) =>
        b.kind === 'tool_use' && b.tool.status === 'running'
          ? { ...b, tool: { ...b.tool, status: 'complete' as const } }
          : b,
      );
      return { ...prev, isStreaming: false, blocks };
    }

    case 'error':
      return INITIAL_STATE;

    default:
      return null;
  }
}

/**
 * Tracks in-flight assistant streams per-thread in a Map so that switching threads
 * (or collapsing/expanding the sidebar) never drops an active stream. Chunks for
 * ALL threads are buffered; only the active thread's state is returned to the UI.
 */
export function useAgentChatStreaming(activeThreadId: string | null): AgentChatStreamingState {
  // Per-thread streaming states keyed by threadId
  const [stateMap, setStateMap] = useState<ReadonlyMap<string, AgentChatStreamingState>>(new Map());

  const handleChunk = useCallback((chunk: AgentChatStreamChunk) => {
    const { threadId } = chunk;
    if (!threadId) return;

    // thread_snapshot has a DOM side-effect — handle it outside the state updater.
    if (chunk.type === 'thread_snapshot') {
      if (chunk.thread) {
        window.dispatchEvent(new CustomEvent('agent-chat:thread-snapshot', { detail: chunk.thread }));
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

  useEffect(() => {
    const api = (window as any).electronAPI?.agentChat;
    if (!api?.onStreamChunk) return;
    const cleanup = api.onStreamChunk(handleChunk);
    return () => { if (typeof cleanup === 'function') cleanup(); };
  }, [handleChunk]);

  // On mount (or thread switch), replay any buffered chunks from the main process.
  // This restores in-flight streaming state after a renderer refresh (HMR / Ctrl+R)
  // so tool cards, thinking blocks, and streamed text reappear without waiting
  // for new chunks.
  useEffect(() => {
    if (!activeThreadId) return;
    const api = (window as any).electronAPI?.agentChat;
    if (!api?.getBufferedChunks) return;
    void api.getBufferedChunks(activeThreadId).then(
      (chunks: AgentChatStreamChunk[]) => {
        if (!chunks || chunks.length === 0) return;
        for (const chunk of chunks) handleChunk(chunk);
      },
    );
  }, [activeThreadId, handleChunk]);

  const activeState = (activeThreadId ? stateMap.get(activeThreadId) : null) ?? INITIAL_STATE;

  // After streaming completes, clear the retained blocks once the persisted
  // message has arrived in the thread. We detect this by watching whether the
  // conversation component's streamingMessageInThread check will match (the
  // persisted message with the streaming messageId appears in the thread).
  // Use a generous timeout (5s) as a safety net — the thread_snapshot may be
  // delayed by the main process persisting to disk.
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
  }, [activeThreadId, activeState.isStreaming, activeState.blocks.length]);

  return activeState;
}
