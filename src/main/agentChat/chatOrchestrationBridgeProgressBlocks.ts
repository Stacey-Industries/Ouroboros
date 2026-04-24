/**
 * chatOrchestrationBridgeProgressBlocks.ts — Block-level progress event helpers.
 *
 * Extracted from chatOrchestrationBridgeProgress.ts to keep file line counts
 * under the ESLint limit. Handles text, thinking, and tool_use content blocks.
 */

import type { ProviderProgressEvent } from '../orchestration/types';
import {
  emitMonitorSubTool,
  emitMonitorToolEnd,
  emitMonitorToolStart,
  emitStreamChunk,
} from './chatOrchestrationBridgeMonitor';
import {
  emitToolActivityChunk,
  logFirstChunk,
  type ProgressToolActivity,
} from './chatOrchestrationBridgeProgressHelpers';
import {
  applySubAgentMessageToAccumulatedBlock,
  applySubToolToAccumulatedBlock,
  buildSubAgentMessageStreamChunk,
  buildSubToolStreamChunk,
} from './chatOrchestrationBridgeSubTools';
import type { ActiveStreamContext, AgentChatBridgeRuntime } from './chatOrchestrationBridgeTypes';
import { tapTextDeltaForFactClaims } from './factClaimTap';
import type {
  AgentChatContentBlock,
  AgentChatSubAgentTranscriptEntry,
  AgentChatSubToolActivity,
} from './types';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

export interface BlockHandlerArgs {
  ctx: ActiveStreamContext;
  listeners: AgentChatBridgeRuntime['streamChunkListeners'];
  blockIndex: number;
  now: number;
}

// ---------------------------------------------------------------------------
// Block capacity
// ---------------------------------------------------------------------------

export function ensureBlockCapacity(ctx: ActiveStreamContext, blockIndex: number): void {
  while (ctx.accumulatedBlocks.length <= blockIndex) {
    ctx.accumulatedBlocks.push({ kind: 'text', content: '' });
  }
}

// ---------------------------------------------------------------------------
// Text / thinking block handlers
// ---------------------------------------------------------------------------

export function handleTextBlock(args: BlockHandlerArgs, textDelta: string): void {
  const { ctx, listeners, blockIndex, now } = args;
  ctx.accumulatedText += textDelta;
  // eslint-disable-next-line security/detect-object-injection -- numeric index into a local array
  const existing = ctx.accumulatedBlocks[blockIndex];
  if (existing.kind === 'text') {
    (existing as { kind: 'text'; content: string }).content += textDelta;
  } else {
    // eslint-disable-next-line security/detect-object-injection -- numeric index into a local array
    ctx.accumulatedBlocks[blockIndex] = { kind: 'text', content: textDelta };
  }
  emitStreamChunk(
    listeners,
    {
      threadId: ctx.threadId,
      messageId: ctx.assistantMessageId,
      type: 'text_delta',
      blockIndex,
      textDelta,
      timestamp: now,
      tokenUsage: ctx.tokenUsage,
    },
    ctx,
  );
  // Wave 30 Phase F: tap text deltas through the fact-claim detector.
  // Fire-and-forget — the provider event callback is synchronous; the 800ms
  // latency budget is honoured inside maybePauseForFactClaim but does not
  // block the current chunk from being emitted to listeners above.
  void tapTextDeltaForFactClaims(ctx, listeners, textDelta, now);
}

export function handleThinkingBlock(args: BlockHandlerArgs, textDelta: string): void {
  const { ctx, listeners, blockIndex, now } = args;
  // eslint-disable-next-line security/detect-object-injection -- numeric index into a local array
  const existing = ctx.accumulatedBlocks[blockIndex];
  if (existing.kind === 'thinking') {
    (existing as { kind: 'thinking'; content: string }).content += textDelta;
  } else {
    // eslint-disable-next-line security/detect-object-injection -- numeric index into a local array
    ctx.accumulatedBlocks[blockIndex] = { kind: 'thinking', content: textDelta };
  }
  emitStreamChunk(
    listeners,
    {
      threadId: ctx.threadId,
      messageId: ctx.assistantMessageId,
      type: 'thinking_delta',
      blockIndex,
      thinkingDelta: textDelta,
      timestamp: now,
      tokenUsage: ctx.tokenUsage,
    },
    ctx,
  );
}

// ---------------------------------------------------------------------------
// Tool block handlers
// ---------------------------------------------------------------------------

function applyToolStart(
  ctx: ActiveStreamContext,
  blockIndex: number,
  toolActivity: ProgressToolActivity,
  now: number,
): void {
  // eslint-disable-next-line security/detect-object-injection -- numeric index into a local array
  const existing = ctx.accumulatedBlocks[blockIndex];
  const isRepeatedStart =
    existing?.kind === 'tool_use' &&
    existing.status === 'running' &&
    existing.tool === toolActivity.name;
  // eslint-disable-next-line security/detect-object-injection -- numeric index into a local array
  ctx.accumulatedBlocks[blockIndex] = {
    kind: 'tool_use',
    tool: toolActivity.name,
    status: 'running',
    filePath: toolActivity.filePath,
    inputSummary: toolActivity.inputSummary,
    editSummary: toolActivity.editSummary,
    blockId: `tool-${blockIndex}`,
  };
  if (!isRepeatedStart) {
    ctx.toolsUsed.push({ name: toolActivity.name, filePath: toolActivity.filePath });
    emitMonitorToolStart(ctx, blockIndex, toolActivity, now);
  }
}

function applyToolComplete(
  ctx: ActiveStreamContext,
  blockIndex: number,
  toolActivity: ProgressToolActivity,
  now: number,
): void {
  // eslint-disable-next-line security/detect-object-injection -- numeric index into a local array
  const block = ctx.accumulatedBlocks[blockIndex];
  if (block.kind === 'tool_use')
    // eslint-disable-next-line security/detect-object-injection -- numeric index into a local array
    ctx.accumulatedBlocks[blockIndex] = {
      ...block,
      status: 'complete',
      output: toolActivity.output,
    } as AgentChatContentBlock;
  emitMonitorToolEnd(ctx, blockIndex, {
    toolName: toolActivity.name,
    now,
    output: toolActivity.output,
  });
}

export function handleToolBlock(args: BlockHandlerArgs, toolActivity: ProgressToolActivity): void {
  const { ctx, listeners, blockIndex, now } = args;
  if (toolActivity.subToolActivity) {
    const subTool: AgentChatSubToolActivity = {
      ...toolActivity.subToolActivity,
      status: toolActivity.subToolActivity.status === 'complete' ? 'complete' : 'running',
    };
    applySubToolToAccumulatedBlock(ctx, blockIndex, subTool);
    const subChunk = buildSubToolStreamChunk(ctx, blockIndex, subTool, now);
    emitStreamChunk(listeners, subChunk, ctx);
    emitMonitorSubTool(ctx, blockIndex, toolActivity.subToolActivity, now);
    return;
  }
  if (toolActivity.subAgentMessage) {
    const message: Omit<AgentChatSubAgentTranscriptEntry, 'content'> & { textDelta: string } = {
      ...toolActivity.subAgentMessage,
    };
    applySubAgentMessageToAccumulatedBlock(ctx, blockIndex, message);
    const transcriptChunk = buildSubAgentMessageStreamChunk(ctx, blockIndex, message, now);
    emitStreamChunk(listeners, transcriptChunk, ctx);
    return;
  }
  if (toolActivity.status === 'running') applyToolStart(ctx, blockIndex, toolActivity, now);
  else if (toolActivity.status === 'complete')
    applyToolComplete(ctx, blockIndex, toolActivity, now);
  emitToolActivityChunk({ listeners, ctx, blockIndex, toolActivity, now });
}

// ---------------------------------------------------------------------------
// Content block dispatcher
// ---------------------------------------------------------------------------

export function handleContentBlock(
  ctx: ActiveStreamContext,
  listeners: AgentChatBridgeRuntime['streamChunkListeners'],
  block: NonNullable<ProviderProgressEvent['contentBlock']>,
  now: number,
): void {
  const { blockIndex, blockType, textDelta, toolActivity } = block;
  ensureBlockCapacity(ctx, blockIndex);
  const handlerArgs: BlockHandlerArgs = { ctx, listeners, blockIndex, now };
  if (blockType === 'text' && textDelta) {
    handleTextBlock(handlerArgs, textDelta);
  } else if (blockType === 'thinking' && textDelta) {
    handleThinkingBlock(handlerArgs, textDelta);
  } else if (blockType === 'tool_use' && toolActivity) {
    handleToolBlock(handlerArgs, toolActivity);
  }
  logFirstChunk(ctx);
  ctx.firstChunkEmitted = true;
}
