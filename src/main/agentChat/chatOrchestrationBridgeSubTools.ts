/**
 * chatOrchestrationBridgeSubTools.ts — Sub-tool accumulation and stream chunk
 * helpers for nested subagent tool calls flowing through the orchestration bridge.
 */

import type { ActiveStreamContext } from './chatOrchestrationBridgeTypes';
import type {
  AgentChatStreamChunk,
  AgentChatSubAgentTranscriptEntry,
  AgentChatSubToolActivity,
} from './types';

/**
 * Append or update a sub-tool entry on the parent tool_use block at `blockIndex`.
 *
 * - `running` status: appends a new sub-tool entry.
 * - `complete` / `error` status: finds the existing entry by `subToolId` and merges.
 */
export function applySubToolToAccumulatedBlock(
  ctx: ActiveStreamContext,
  blockIndex: number,
  subTool: AgentChatSubToolActivity,
): void {
  // eslint-disable-next-line security/detect-object-injection -- numeric index into a local array
  const parent = ctx.accumulatedBlocks[blockIndex];
  if (!parent || parent.kind !== 'tool_use') return;

  const existing = parent.subTools ?? [];

  if (subTool.status === 'running') {
    // eslint-disable-next-line security/detect-object-injection -- numeric index into a local array
    ctx.accumulatedBlocks[blockIndex] = { ...parent, subTools: [...existing, subTool] };
    return;
  }

  // complete or error — find by subToolId and merge
  const updated = existing.map((s) =>
    s.subToolId === subTool.subToolId ? { ...s, ...subTool } : s,
  );
  // eslint-disable-next-line security/detect-object-injection -- numeric index into a local array
  ctx.accumulatedBlocks[blockIndex] = { ...parent, subTools: updated };
}

export function applySubAgentMessageToAccumulatedBlock(
  ctx: ActiveStreamContext,
  blockIndex: number,
  message: {
    entryId: string;
    subAgentId: string;
    label?: string;
    kind: 'text' | 'thinking';
    textDelta: string;
  },
): void {
  // eslint-disable-next-line security/detect-object-injection -- numeric index into a local array
  const parent = ctx.accumulatedBlocks[blockIndex];
  if (!parent || parent.kind !== 'tool_use') return;

  const existing = parent.subAgentTranscript ?? [];
  const matchIndex = existing.findIndex((entry) => entry.entryId === message.entryId);
  let nextTranscript: AgentChatSubAgentTranscriptEntry[];

  if (matchIndex === -1) {
    nextTranscript = [
      ...existing,
      {
        entryId: message.entryId,
        subAgentId: message.subAgentId,
        label: message.label,
        kind: message.kind,
        content: message.textDelta,
      },
    ];
  } else {
    nextTranscript = existing.map((entry, index) =>
      index === matchIndex
        ? {
            ...entry,
            label: message.label ?? entry.label,
            content: entry.content + message.textDelta,
          }
        : entry,
    );
  }

  // eslint-disable-next-line security/detect-object-injection -- numeric index into a local array
  ctx.accumulatedBlocks[blockIndex] = { ...parent, subAgentTranscript: nextTranscript };
}

/**
 * Build a `tool_activity` stream chunk that carries the sub-tool payload
 * so the renderer can update its block state.
 */
export function buildSubToolStreamChunk(
  ctx: ActiveStreamContext,
  blockIndex: number,
  subTool: AgentChatSubToolActivity,
  now: number,
): AgentChatStreamChunk {
  // eslint-disable-next-line security/detect-object-injection -- numeric index into a local array
  const parent = ctx.accumulatedBlocks[blockIndex];
  const parentName = parent?.kind === 'tool_use' ? parent.tool : 'Agent';

  return {
    type: 'tool_activity',
    threadId: ctx.threadId,
    messageId: ctx.assistantMessageId,
    blockIndex,
    toolActivity: {
      name: parentName,
      status: 'running',
      subTool,
    },
    timestamp: now,
  };
}

export function buildSubAgentMessageStreamChunk(
  ctx: ActiveStreamContext,
  blockIndex: number,
  message: {
    entryId: string;
    subAgentId: string;
    label?: string;
    kind: 'text' | 'thinking';
    textDelta: string;
  },
  now: number,
): AgentChatStreamChunk {
  // eslint-disable-next-line security/detect-object-injection -- numeric index into a local array
  const parent = ctx.accumulatedBlocks[blockIndex];
  const parentName = parent?.kind === 'tool_use' ? parent.tool : 'Agent';

  return {
    type: 'tool_activity',
    threadId: ctx.threadId,
    messageId: ctx.assistantMessageId,
    blockIndex,
    toolActivity: {
      name: parentName,
      status: 'running',
      subAgentMessage: message,
    },
    timestamp: now,
  };
}
