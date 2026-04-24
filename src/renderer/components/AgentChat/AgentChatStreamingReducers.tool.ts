/**
 * AgentChatStreamingReducers.tool.ts — Tool-activity block helpers.
 *
 * Extracted from AgentChatStreamingReducers.ts to keep that file under the
 * 300-line ESLint limit. Not a public API — import only from the main reducers file.
 *
 * Also owns generateBlockId and ensureBlockCapacity (moved here because they are
 * only used by tool-activity logic).
 */

import type {
  AgentChatContentBlock,
  AgentChatStreamChunk,
  AgentChatSubAgentTranscriptEntry,
  AgentChatSubToolActivity,
} from '../../types/electron-agent-chat';

// ── Block helpers ─────────────────────────────────────────────────────────────

/**
 * Generate a stable block ID.
 * Falls back to getRandomValues when randomUUID is unavailable (HTTP non-localhost).
 */
export function generateBlockId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `block-${crypto.randomUUID()}`;
  }
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  return `block-${hex}`;
}

/** Grow the array with empty text blocks until it has at least blockIndex+1 entries. */
export function ensureBlockCapacity(blocks: AgentChatContentBlock[], blockIndex: number): void {
  while (blocks.length <= blockIndex) {
    blocks.push({ kind: 'text', content: '' });
  }
}

// ── Sub-tool delta ────────────────────────────────────────────────────────────

export function applySubToolDelta(
  blocks: AgentChatContentBlock[],
  blockIndex: number,
  subTool: AgentChatSubToolActivity,
): AgentChatContentBlock[] {
  const next = [...blocks];
  const parent = next[blockIndex];
  if (!parent || parent.kind !== 'tool_use') return next;
  const existing = parent.subTools ?? [];
  if (subTool.status === 'running') {
    next[blockIndex] = { ...parent, subTools: [...existing, subTool] };
  } else {
    const updated = existing.map((s) =>
      s.subToolId === subTool.subToolId ? { ...s, ...subTool } : s,
    );
    next[blockIndex] = { ...parent, subTools: updated };
  }
  return next;
}

type SubAgentMessage = {
  entryId: string;
  subAgentId: string;
  label?: string;
  kind: 'text' | 'thinking';
  textDelta: string;
};

function buildSubAgentTranscript(
  existing: AgentChatSubAgentTranscriptEntry[],
  message: SubAgentMessage,
): AgentChatSubAgentTranscriptEntry[] {
  const matchIndex = existing.findIndex((entry) => entry.entryId === message.entryId);
  if (matchIndex === -1) {
    return [
      ...existing,
      {
        entryId: message.entryId,
        subAgentId: message.subAgentId,
        label: message.label,
        kind: message.kind,
        content: message.textDelta,
      },
    ];
  }
  return existing.map((entry, index) =>
    index === matchIndex
      ? {
          ...entry,
          label: message.label ?? entry.label,
          content: entry.content + message.textDelta,
        }
      : entry,
  );
}

export function applySubAgentMessageDelta(
  blocks: AgentChatContentBlock[],
  blockIndex: number,
  message: SubAgentMessage,
): AgentChatContentBlock[] {
  const next = [...blocks];
  const parent = next[blockIndex];
  if (!parent || parent.kind !== 'tool_use') return next;
  const transcript = buildSubAgentTranscript(parent.subAgentTranscript ?? [], message);
  next[blockIndex] = { ...parent, subAgentTranscript: transcript };
  return next;
}

// ── Structured tool activity (blockIndex present) ─────────────────────────────

function applyToolBlockUpdate(
  blocks: AgentChatContentBlock[],
  idx: number,
  chunk: AgentChatStreamChunk,
): void {
  const { name, status, filePath, inputSummary, editSummary: rawEditSummary } = chunk.toolActivity!;
  const editSummary = typeof rawEditSummary === 'object' ? rawEditSummary : undefined;
  if (status === 'running') {
    blocks[idx] = { kind: 'tool_use', tool: name, status, filePath, inputSummary, editSummary, blockId: generateBlockId() };
  } else {
    const existing = blocks[idx];
    if (existing.kind === 'tool_use') {
      blocks[idx] = { ...existing, status, filePath: filePath ?? existing.filePath, output: chunk.toolActivity!.output ?? existing.output };
    }
  }
}

export function applyToolActivityStructured(
  sealed: AgentChatContentBlock[],
  chunk: AgentChatStreamChunk,
): AgentChatContentBlock[] {
  if (chunk.toolActivity!.subAgentMessage) {
    return applySubAgentMessageDelta(sealed, chunk.blockIndex!, chunk.toolActivity!.subAgentMessage);
  }
  if (chunk.toolActivity!.subTool) {
    return applySubToolDelta(sealed, chunk.blockIndex!, chunk.toolActivity!.subTool);
  }
  const blocks = [...sealed];
  ensureBlockCapacity(blocks, chunk.blockIndex!);
  applyToolBlockUpdate(blocks, chunk.blockIndex!, chunk);
  return blocks;
}

// ── Legacy tool activity (no blockIndex) ─────────────────────────────────────

export function applyToolActivityLegacy(
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
      blocks[i] = {
        ...block,
        status,
        filePath: filePath ?? block.filePath,
        output: chunk.toolActivity!.output,
      };
      break;
    }
  }
  return { blocks, textContent: '' };
}
