/**
 * AgentChatStreamingReducers.ts — Pure chunk reducer logic for useAgentChatStreaming.
 * Extracted to keep useAgentChatStreaming.ts under the 300-line limit.
 */
import type { AgentChatContentBlock, AgentChatStreamChunk } from '../../types/electron-agent-chat';

export interface AgentChatStreamingState {
  isStreaming: boolean;
  streamingMessageId: string | null;
  blocks: AgentChatContentBlock[];
  /** The text content currently being appended to (the last text block, if any) */
  activeTextContent: string;
  /** Real-time token usage during streaming */
  streamingTokenUsage?: { inputTokens: number; outputTokens: number };
}

export const INITIAL_STATE: AgentChatStreamingState = {
  isStreaming: false,
  streamingMessageId: null,
  blocks: [],
  activeTextContent: '',
};

export function generateBlockId(): string {
  // crypto.randomUUID() is unavailable in insecure contexts (HTTP on non-localhost).
  // Fall back to a timestamp + random suffix for web remote access over Tailscale/LAN.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `block-${crypto.randomUUID()}`;
  }
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  return `block-${hex}`;
}

/**
 * Seal any open thinking blocks (set duration) when a non-thinking delta arrives.
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
 */
function ensureBlockCapacity(blocks: AgentChatContentBlock[], blockIndex: number): void {
  while (blocks.length <= blockIndex) {
    blocks.push({ kind: 'text', content: '' });
  }
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

function applyToolActivityStructured(
  sealed: AgentChatContentBlock[],
  chunk: AgentChatStreamChunk,
): AgentChatContentBlock[] {
  const { name, status, filePath, inputSummary, editSummary: rawEditSummary } = chunk.toolActivity!;
  const editSummary = typeof rawEditSummary === 'object' ? rawEditSummary : undefined;
  const blocks = [...sealed];
  ensureBlockCapacity(blocks, chunk.blockIndex!);
  if (status === 'running') {
    blocks[chunk.blockIndex!] = {
      kind: 'tool_use',
      tool: name,
      status,
      filePath,
      inputSummary,
      editSummary,
      blockId: generateBlockId(),
    };
  } else {
    const existing = blocks[chunk.blockIndex!];
    if (existing.kind === 'tool_use') {
      blocks[chunk.blockIndex!] = { ...existing, status, filePath: filePath ?? existing.filePath };
    }
  }
  return blocks;
}

function applyToolActivityLegacy(
  sealed: AgentChatContentBlock[],
  chunk: AgentChatStreamChunk,
): { blocks: AgentChatContentBlock[]; textContent: string } {
  const { name, status, filePath, inputSummary, editSummary: rawEditSummary } = chunk.toolActivity!;
  const editSummary = typeof rawEditSummary === 'object' ? rawEditSummary : undefined;
  if (status === 'running') {
    return {
      blocks: [
        ...sealed,
        {
          kind: 'tool_use',
          tool: name,
          status,
          filePath,
          inputSummary,
          editSummary,
          blockId: generateBlockId(),
        },
      ],
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

/**
 * Pure state transition: apply one chunk to a thread's streaming state.
 */
export function applyChunk(
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
        b.kind === 'tool_use' && b.status === 'running' ? { ...b, status: 'complete' as const } : b,
      );
      return { ...prev, isStreaming: false, blocks, streamingTokenUsage: undefined };
    }
    case 'error':
      return { ...INITIAL_STATE, streamingTokenUsage: undefined };
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
