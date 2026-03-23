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

/** Find the content of the last text block. */
function findLastTextContent(blocks: AgentChatContentBlock[]): string {
  for (let idx = blocks.length - 1; idx >= 0; idx--) {
    if (blocks[idx].kind === 'text') {
      return (blocks[idx] as { kind: 'text'; content: string }).content;
    }
  }
  return '';
}

/** Build streaming state result with common fields. */
function buildStreamingResult(
  prev: AgentChatStreamingState,
  chunk: AgentChatStreamChunk,
  blocks: AgentChatContentBlock[],
  activeTextContent: string,
): AgentChatStreamingState {
  return {
    ...prev,
    isStreaming: true,
    streamingMessageId: chunk.messageId,
    blocks,
    activeTextContent,
    ...(chunk.tokenUsage ? { streamingTokenUsage: chunk.tokenUsage } : {}),
  };
}

/** Apply text at a specific block index or append to last text block. */
function applyTextDelta(blocks: AgentChatContentBlock[], delta: string, blockIndex: number | undefined): void {
  if (blockIndex !== undefined) {
    ensureBlockCapacity(blocks, blockIndex);
    const existing = blocks[blockIndex];
    blocks[blockIndex] = existing.kind === 'text'
      ? { kind: 'text', content: existing.content + delta }
      : { kind: 'text', content: delta };
  } else {
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock && lastBlock.kind === 'text') {
      blocks[blocks.length - 1] = { kind: 'text', content: lastBlock.content + delta };
    } else {
      blocks.push({ kind: 'text', content: delta });
    }
  }
}

/** Apply thinking delta at a specific block index or append. */
function applyThinkingDelta(blocks: AgentChatContentBlock[], delta: string, blockIndex: number | undefined): void {
  if (blockIndex !== undefined) {
    ensureBlockCapacity(blocks, blockIndex);
    const existing = blocks[blockIndex];
    if (existing.kind === 'thinking' && existing.duration === undefined) {
      blocks[blockIndex] = { ...existing, content: existing.content + delta };
    } else {
      blocks[blockIndex] = { kind: 'thinking', content: delta, startedAt: Date.now() };
    }
  } else {
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock && lastBlock.kind === 'thinking' && lastBlock.duration === undefined) {
      blocks[blocks.length - 1] = { ...lastBlock, content: lastBlock.content + delta };
    } else {
      blocks.push({ kind: 'thinking', content: delta, startedAt: Date.now() });
    }
  }
}

function applyTextChunk(prev: AgentChatStreamingState, chunk: AgentChatStreamChunk): AgentChatStreamingState {
  const delta = chunk.textDelta ?? '';
  const sealed = sealThinkingBlocks(prev.blocks, Date.now());
  const blocks = [...sealed];
  applyTextDelta(blocks, delta, chunk.blockIndex);
  return buildStreamingResult(prev, chunk, blocks, findLastTextContent(blocks));
}

function applyThinkingChunk(prev: AgentChatStreamingState, chunk: AgentChatStreamChunk): AgentChatStreamingState {
  const delta = chunk.thinkingDelta ?? '';
  const blocks = [...prev.blocks];
  applyThinkingDelta(blocks, delta, chunk.blockIndex);
  return buildStreamingResult(prev, chunk, blocks, prev.activeTextContent);
}

function applyToolActivityStructured(sealed: AgentChatContentBlock[], chunk: AgentChatStreamChunk): AgentChatContentBlock[] {
  const { name, status, filePath, inputSummary, editSummary } = chunk.toolActivity!;
  const blocks = [...sealed];
  ensureBlockCapacity(blocks, chunk.blockIndex!);
  if (status === 'running') {
    blocks[chunk.blockIndex!] = { kind: 'tool_use', tool: name, status, filePath, inputSummary, editSummary, blockId: generateBlockId() };
  } else {
    const existing = blocks[chunk.blockIndex!];
    if (existing.kind === 'tool_use') {
      blocks[chunk.blockIndex!] = { ...existing, status, filePath: filePath ?? existing.filePath };
    }
  }
  return blocks;
}

function applyToolActivityLegacy(sealed: AgentChatContentBlock[], chunk: AgentChatStreamChunk): { blocks: AgentChatContentBlock[]; textContent: string } {
  const { name, status, filePath, inputSummary, editSummary } = chunk.toolActivity!;
  if (status === 'running') {
    return {
      blocks: [...sealed, { kind: 'tool_use', tool: name, status, filePath, inputSummary, editSummary, blockId: generateBlockId() }],
      textContent: '',
    };
  }
  const blocks = [...sealed];
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    if (block.kind === 'tool_use' && block.tool === name && block.status === 'running') {
      blocks[i] = { ...block, status, filePath: filePath ?? block.filePath };
      break;
    }
  }
  return { blocks, textContent: '' };
}

function applyToolChunk(prev: AgentChatStreamingState, chunk: AgentChatStreamChunk): AgentChatStreamingState | null {
  if (!chunk.toolActivity) return prev;
  const sealed = sealThinkingBlocks(prev.blocks, Date.now());
  if (chunk.blockIndex !== undefined) {
    const blocks = applyToolActivityStructured(sealed, chunk);
    return buildStreamingResult(prev, chunk, blocks, prev.activeTextContent);
  }
  const { blocks } = applyToolActivityLegacy(sealed, chunk);
  return buildStreamingResult(prev, chunk, blocks, prev.activeTextContent);
}

/**
 * Pure state transition: apply one chunk to a thread's streaming state.
 */
function applyChunk(
  prev: AgentChatStreamingState,
  chunk: AgentChatStreamChunk,
): AgentChatStreamingState | null {
  switch (chunk.type) {
    case 'text_delta':
      return applyTextChunk(prev, chunk);
    case 'thinking_delta':
      return applyThinkingChunk(prev, chunk);
    case 'tool_activity':
      return applyToolChunk(prev, chunk);
    case 'complete': {
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

type StreamingApi = {
  onStreamChunk?: (cb: (chunk: AgentChatStreamChunk) => void) => (() => void) | void;
  getBufferedChunks?: (id: string) => Promise<AgentChatStreamChunk[]>;
};

function getStreamingApi(): StreamingApi | undefined {
  return (window as unknown as { electronAPI?: { agentChat?: StreamingApi } }).electronAPI?.agentChat;
}

function replayBufferedChunks(chunks: AgentChatStreamChunk[]): AgentChatStreamingState {
  let rebuilt: AgentChatStreamingState = INITIAL_STATE;
  for (const chunk of chunks) {
    const next = applyChunk(rebuilt, chunk);
    if (next) rebuilt = next;
  }
  return rebuilt;
}

function useStreamChunkListener(handleChunk: (chunk: AgentChatStreamChunk) => void): void {
  useEffect(() => {
    const api = getStreamingApi();
    if (!api?.onStreamChunk) return;
    const cleanup = api.onStreamChunk(handleChunk);
    return () => { if (typeof cleanup === 'function') cleanup(); };
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
      setStateMap((prev) => { const updated = new Map(prev); updated.delete(id); return updated; });
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

  useStreamChunkListener(handleChunk);
  useReplayBufferedChunks(activeThreadId, setStateMap);
  const activeState = (activeThreadId ? stateMap.get(activeThreadId) : null) ?? INITIAL_STATE;
  useCleanupCompletedStreams(activeThreadId, activeState, setStateMap);

  return activeState;
}
