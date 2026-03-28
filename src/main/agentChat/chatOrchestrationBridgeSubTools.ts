/**
 * chatOrchestrationBridgeSubTools.ts — Sub-tool accumulation and stream chunk
 * helpers for nested subagent tool calls flowing through the orchestration bridge.
 */

import type { ActiveStreamContext } from './chatOrchestrationBridgeTypes';
import type { AgentChatStreamChunk, AgentChatSubToolActivity } from './types';

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
