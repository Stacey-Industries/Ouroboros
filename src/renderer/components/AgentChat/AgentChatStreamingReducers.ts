/**
 * AgentChatStreamingReducers.ts — Pure chunk reducer logic for useAgentChatStreaming.
 * Extracted to keep useAgentChatStreaming.ts under the 300-line limit.
 *
 * Tool-activity helpers live in AgentChatStreamingReducers.tool.ts.
 * Dedup helpers live in AgentChatStreamingReducers.dedup.ts.
 */
import type {
  AgentChatContentBlock,
  AgentChatStreamChunk,
} from '../../types/electron-agent-chat';
import { clearSeenChunkIds, isDuplicateChunk } from './AgentChatStreamingReducers.dedup';
import {
  applyToolActivityLegacy,
  applyToolActivityStructured,
  ensureBlockCapacity,
} from './AgentChatStreamingReducers.tool';

export interface AgentChatStreamingState {
  isStreaming: boolean;
  streamingMessageId: string | null;
  blocks: AgentChatContentBlock[];
  /** The text content currently being appended to (the last text block, if any) */
  activeTextContent: string;
  /** Real-time token usage during streaming */
  streamingTokenUsage?: { inputTokens: number; outputTokens: number };
  /**
   * Tracks seen chunk IDs per messageId to deduplicate replayed / re-delivered chunks.
   * Not serialized — internal reducer state only.
   */
  _seenChunkIds?: Map<string, Set<string>>;
}

export const INITIAL_STATE: AgentChatStreamingState = {
  isStreaming: false,
  streamingMessageId: null,
  blocks: [],
  activeTextContent: '',
};

/** Re-exported for callers that need to generate a block ID without importing tool.ts directly. */
export { generateBlockId } from './AgentChatStreamingReducers.tool';

// ── Private helpers ───────────────────────────────────────────────────────────

function sealThinkingBlocks(
  blocks: AgentChatContentBlock[],
  now: number,
): AgentChatContentBlock[] {
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

function findLastTextContent(blocks: AgentChatContentBlock[]): string {
  for (let idx = blocks.length - 1; idx >= 0; idx--) {
    if (blocks[idx].kind === 'text') {
      return (blocks[idx] as { kind: 'text'; content: string }).content;
    }
  }
  return '';
}

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

function applyTextDelta(
  blocks: AgentChatContentBlock[],
  delta: string,
  blockIndex: number | undefined,
): void {
  if (blockIndex !== undefined) {
    ensureBlockCapacity(blocks, blockIndex);
    const existing = blocks[blockIndex];
    blocks[blockIndex] =
      existing.kind === 'text'
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

function applyThinkingDelta(
  blocks: AgentChatContentBlock[],
  delta: string,
  blockIndex: number | undefined,
): void {
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

function applyTextChunk(
  prev: AgentChatStreamingState,
  chunk: AgentChatStreamChunk,
): AgentChatStreamingState {
  const delta = chunk.textDelta ?? '';
  const sealed = sealThinkingBlocks(prev.blocks, Date.now());
  const blocks = [...sealed];
  applyTextDelta(blocks, delta, chunk.blockIndex);
  return buildStreamingResult(prev, chunk, blocks, findLastTextContent(blocks));
}

function applyThinkingChunk(
  prev: AgentChatStreamingState,
  chunk: AgentChatStreamChunk,
): AgentChatStreamingState {
  const delta = chunk.thinkingDelta ?? '';
  const blocks = [...prev.blocks];
  applyThinkingDelta(blocks, delta, chunk.blockIndex);
  return buildStreamingResult(prev, chunk, blocks, prev.activeTextContent);
}

function applyToolChunk(
  prev: AgentChatStreamingState,
  chunk: AgentChatStreamChunk,
): AgentChatStreamingState | null {
  if (!chunk.toolActivity) return prev;
  const sealed = sealThinkingBlocks(prev.blocks, Date.now());
  if (chunk.blockIndex !== undefined) {
    const blocks = applyToolActivityStructured(sealed, chunk);
    return buildStreamingResult(prev, chunk, blocks, prev.activeTextContent);
  }
  const { blocks } = applyToolActivityLegacy(sealed, chunk);
  return buildStreamingResult(prev, chunk, blocks, prev.activeTextContent);
}

// ── Public API helpers ────────────────────────────────────────────────────────

function sealRunningBlocks(blocks: AgentChatContentBlock[]): AgentChatContentBlock[] {
  return blocks
    .map((b) =>
      b.kind === 'tool_use' && b.status === 'running' ? { ...b, status: 'complete' as const } : b,
    )
    .map((b) =>
      b.kind === 'tool_use' && b.subTools
        ? {
            ...b,
            subTools: b.subTools.map((s) =>
              s.status === 'running' ? { ...s, status: 'complete' as const } : s,
            ),
          }
        : b,
    );
}

function applyDeltaChunk(
  prev: AgentChatStreamingState,
  chunk: AgentChatStreamChunk,
  seenIds: Map<string, Set<string>>,
): AgentChatStreamingState | null {
  if (chunk.timestamp !== undefined) {
    const chunkId = `${chunk.type}:${chunk.timestamp}:${chunk.blockIndex ?? ''}`;
    if (isDuplicateChunk(seenIds, chunk.messageId, chunkId)) {
      return { ...prev, _seenChunkIds: seenIds };
    }
  }
  if (chunk.type === 'text_delta') return { ...applyTextChunk(prev, chunk), _seenChunkIds: seenIds };
  if (chunk.type === 'thinking_delta') return { ...applyThinkingChunk(prev, chunk), _seenChunkIds: seenIds };
  const result = applyToolChunk(prev, chunk);
  return result ? { ...result, _seenChunkIds: seenIds } : null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Pure state transition: apply one chunk to a thread's streaming state.
 * Dedup key: `${type}:${timestamp}:${blockIndex}` for delta chunks.
 * complete/error are never deduped (idempotent + must not be skipped).
 */
export function applyChunk(
  prev: AgentChatStreamingState,
  chunk: AgentChatStreamChunk,
): AgentChatStreamingState | null {
  const seenIds = prev._seenChunkIds ?? new Map<string, Set<string>>();
  switch (chunk.type) {
    case 'text_delta':
    case 'thinking_delta':
    case 'tool_activity':
      return applyDeltaChunk(prev, chunk, seenIds);
    case 'complete': {
      clearSeenChunkIds(seenIds, chunk.messageId);
      return {
        ...prev,
        isStreaming: false,
        blocks: sealRunningBlocks(prev.blocks),
        streamingTokenUsage: chunk.tokenUsage ?? undefined,
        _seenChunkIds: seenIds,
      };
    }
    case 'error':
      clearSeenChunkIds(seenIds, chunk.messageId);
      return { ...INITIAL_STATE, streamingTokenUsage: undefined, _seenChunkIds: seenIds };
    default:
      return null;
  }
}

export function replayBufferedChunks(chunks: AgentChatStreamChunk[]): AgentChatStreamingState {
  let rebuilt: AgentChatStreamingState = INITIAL_STATE;
  for (const chunk of chunks) {
    const next = applyChunk(rebuilt, chunk);
    if (next) rebuilt = next;
  }
  return rebuilt;
}
