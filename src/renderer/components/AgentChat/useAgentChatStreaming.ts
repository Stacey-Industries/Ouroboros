import { useCallback, useEffect, useState } from 'react';

import type { AgentChatContentBlock, AgentChatStreamChunk } from '../../types/electron-agent-chat';

/** @deprecated Use AgentChatContentBlock directly. Kept as alias for backward compatibility. */
export type AssistantTurnBlock = AgentChatContentBlock;

export interface AgentChatStreamingState {
  isStreaming: boolean;
  streamingMessageId: string | null;
  blocks: AgentChatContentBlock[];
  /** The text content currently being appended to (the last text block, if any) */
  activeTextContent: string;
  /** Real-time token usage during streaming */
  streamingTokenUsage?: { inputTokens: number; outputTokens: number };
}

const INITIAL_STATE: AgentChatStreamingState = {
  isStreaming: false,
  streamingMessageId: null,
  blocks: [],
  activeTextContent: '',
};

function generateBlockId(): string {
  // crypto.randomUUID() is unavailable in insecure contexts (HTTP on non-localhost).
  // Fall back to a timestamp + random suffix for web remote access over Tailscale/LAN.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `block-${crypto.randomUUID()}`;
  }
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)),
    b => b.toString(16).padStart(2, '0')).join('');
  return `block-${hex}`;
}

/**
 * Seal any open thinking blocks (set duration) when a non-thinking delta arrives.
 * Thinking blocks without a duration are "actively streaming"; once sealed they
 * auto-collapse in the UI.
 */
function sealThinkingBlocks(blocks: AgentChatContentBlock[], now: number): AgentChatContentBlock[] {
  let changed = false;
  const next = blocks.map((b) => {
    if (b.kind === 'thinking' && b.startedAt !== undefined && b.duration === undefined) {
      changed = true;
      return { ...b, duration: Math.round((now - b.startedAt) / 1000) };
    }
    return b;
  });
  return changed ? next : blocks;
}

/**
 * Ensure the blocks array is large enough for the given blockIndex.
 * Fills gaps with empty text placeholders (harmless, overwritten by actual deltas).
 */
function ensureBlockCapacity(blocks: AgentChatContentBlock[], blockIndex: number): void {
  while (blocks.length <= blockIndex) {
    blocks.push({ kind: 'text', content: '' });
  }
}

/**
 * Pure state transition: apply one chunk to a thread's streaming state.
 *
 * With structured content blocks, each chunk carries a `blockIndex` that maps
 * directly to a position in the blocks array — no heuristic merging needed.
 * This matches the industry-standard approach used by Cursor, Windsurf, and
 * VS Code Copilot: the renderer is a direct projection of the API's block structure.
 */
function applyChunk(
  prev: AgentChatStreamingState,
  chunk: AgentChatStreamChunk,
): AgentChatStreamingState | null {
  switch (chunk.type) {
    case 'text_delta': {
      const delta = chunk.textDelta ?? '';
      const blockIndex = chunk.blockIndex;
      // Seal any open thinking blocks — text arriving means thinking is done
      const sealed = sealThinkingBlocks(prev.blocks, Date.now());
      const blocks = [...sealed];

      if (blockIndex !== undefined) {
        // Structured path: place at exact block position
        ensureBlockCapacity(blocks, blockIndex);
        const existing = blocks[blockIndex];
        if (existing.kind === 'text') {
          blocks[blockIndex] = { kind: 'text', content: existing.content + delta };
        } else {
          // Block type mismatch (gap placeholder was wrong type) — overwrite
          blocks[blockIndex] = { kind: 'text', content: delta };
        }
      } else {
        // Legacy fallback (no blockIndex): append to last text block or create new
        const lastBlock = blocks[blocks.length - 1];
        if (lastBlock && lastBlock.kind === 'text') {
          blocks[blocks.length - 1] = { kind: 'text', content: lastBlock.content + delta };
        } else {
          blocks.push({ kind: 'text', content: delta });
        }
      }

      // Find the last text block for activeTextContent
      let activeTextContent = '';
      for (let idx = blocks.length - 1; idx >= 0; idx--) {
        if (blocks[idx].kind === 'text') {
          activeTextContent = (blocks[idx] as { kind: 'text'; content: string }).content;
          break;
        }
      }
      return {
        ...prev,
        isStreaming: true,
        streamingMessageId: chunk.messageId,
        blocks,
        activeTextContent,
        ...(chunk.tokenUsage ? { streamingTokenUsage: chunk.tokenUsage } : {}),
      };
    }

    case 'thinking_delta': {
      const delta = chunk.thinkingDelta ?? '';
      const blockIndex = chunk.blockIndex;
      const blocks = [...prev.blocks];

      if (blockIndex !== undefined) {
        // Structured path: place at exact block position
        ensureBlockCapacity(blocks, blockIndex);
        const existing = blocks[blockIndex];
        if (existing.kind === 'thinking' && existing.duration === undefined) {
          blocks[blockIndex] = { ...existing, content: existing.content + delta };
        } else {
          blocks[blockIndex] = { kind: 'thinking', content: delta, startedAt: Date.now() };
        }
      } else {
        // Legacy fallback
        const lastBlock = blocks[blocks.length - 1];
        if (lastBlock && lastBlock.kind === 'thinking' && lastBlock.duration === undefined) {
          blocks[blocks.length - 1] = { ...lastBlock, content: lastBlock.content + delta };
        } else {
          blocks.push({ kind: 'thinking', content: delta, startedAt: Date.now() });
        }
      }
      return { ...prev, isStreaming: true, streamingMessageId: chunk.messageId, blocks, activeTextContent: prev.activeTextContent };
    }

    case 'tool_activity': {
      if (!chunk.toolActivity) return prev;
      const { name, status, filePath, inputSummary, editSummary } = chunk.toolActivity;
      const blockIndex = chunk.blockIndex;
      const sealed = sealThinkingBlocks(prev.blocks, Date.now());

      if (blockIndex !== undefined) {
        // Structured path: place at exact block position
        const blocks = [...sealed];
        ensureBlockCapacity(blocks, blockIndex);

        if (status === 'running') {
          blocks[blockIndex] = {
            kind: 'tool_use', tool: name, status, filePath, inputSummary, editSummary,
            blockId: generateBlockId(),
          };
        } else {
          // Complete: update the existing tool block in place
          const existing = blocks[blockIndex];
          if (existing.kind === 'tool_use') {
            blocks[blockIndex] = { ...existing, status, filePath: filePath ?? existing.filePath };
          }
        }
        return { ...prev, isStreaming: true, streamingMessageId: chunk.messageId, blocks, activeTextContent: prev.activeTextContent };
      }

      // Legacy fallback (no blockIndex)
      if (status === 'running') {
        const blocks: AgentChatContentBlock[] = [
          ...sealed,
          { kind: 'tool_use', tool: name, status, filePath, inputSummary, editSummary, blockId: generateBlockId() },
        ];
        return { ...prev, isStreaming: true, streamingMessageId: chunk.messageId, blocks, activeTextContent: '' };
      }
      const blocks = [...sealed];
      for (let i = blocks.length - 1; i >= 0; i--) {
        const block = blocks[i];
        if (block.kind === 'tool_use' && block.tool === name && block.status === 'running') {
          blocks[i] = { ...block, status, filePath: filePath ?? block.filePath };
          break;
        }
      }
      return { ...prev, isStreaming: true, streamingMessageId: chunk.messageId, blocks, activeTextContent: prev.activeTextContent };
    }

    case 'complete': {
      // Seal any running tool blocks, mark streaming done — retain blocks briefly
      // so they stay visible until the persisted thread_snapshot replaces them.
      const blocks = prev.blocks.map((b) =>
        b.kind === 'tool_use' && b.status === 'running'
          ? { ...b, status: 'complete' as const }
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
    const api = (window as unknown as { electronAPI?: { agentChat?: { onStreamChunk?: (cb: (chunk: AgentChatStreamChunk) => void) => (() => void) | void; getBufferedChunks?: (id: string) => Promise<AgentChatStreamChunk[]> } } }).electronAPI?.agentChat;
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
    const api = (window as unknown as { electronAPI?: { agentChat?: { onStreamChunk?: (cb: (chunk: AgentChatStreamChunk) => void) => (() => void) | void; getBufferedChunks?: (id: string) => Promise<AgentChatStreamChunk[]> } } }).electronAPI?.agentChat;
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
  // message has arrived in the thread.
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
