/**
 * chatOrchestrationBridgeProgress.ts — Provider progress event handlers for the orchestration bridge.
 *
 * Extracted from chatOrchestrationBridge.ts to keep file line counts under the ESLint limit.
 * Handles streaming, completion, cancellation, and failure progress events.
 */

import type { ProviderProgressEvent } from '../orchestration/types';
import {
  emitMonitorSessionEnd,
  emitMonitorToolEnd,
  emitMonitorToolStart,
  emitStreamChunk,
  stopIncrementalFlush,
} from './chatOrchestrationBridgeMonitor';
import {
  persistCancelledTurn,
  persistCompletedTurn,
  persistFailedTurnNoContent,
  persistFailedTurnWithContent,
} from './chatOrchestrationBridgePersist';
import type { ActiveStreamContext, AgentChatBridgeRuntime } from './chatOrchestrationBridgeTypes';
import { tokenCalibrationStore } from './tokenCalibration';
import type { AgentChatContentBlock } from './types';

// ---------------------------------------------------------------------------
// Context lookup
// ---------------------------------------------------------------------------

function findContextForProgress(
  activeSends: AgentChatBridgeRuntime['activeSends'],
  progress: ProviderProgressEvent,
): ActiveStreamContext | undefined {
  for (const [, entry] of activeSends) {
    if (
      progress.session?.sessionId === entry.sessionId ||
      progress.session?.externalTaskId === entry.taskId ||
      progress.session?.requestId?.includes(entry.taskId)
    ) {
      return entry;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Session ID / link population
// ---------------------------------------------------------------------------

function syncProviderSessionId(ctx: ActiveStreamContext, progress: ProviderProgressEvent): void {
  if (!progress.session?.sessionId) return;
  if (!ctx.providerSessionId) ctx.providerSessionId = progress.session.sessionId;
  if (!ctx.link.provider && progress.session.provider)
    ctx.link.provider = progress.session.provider;
  if (progress.session.provider === 'claude-code' && !ctx.link.claudeSessionId) {
    ctx.link.claudeSessionId = progress.session.sessionId;
  }
  if (progress.session.provider === 'codex' && !ctx.link.codexThreadId) {
    ctx.link.codexThreadId = progress.session.sessionId;
  }
}

// ---------------------------------------------------------------------------
// Streaming block handlers
// ---------------------------------------------------------------------------

function ensureBlockCapacity(ctx: ActiveStreamContext, blockIndex: number): void {
  while (ctx.accumulatedBlocks.length <= blockIndex) {
    ctx.accumulatedBlocks.push({ kind: 'text', content: '' });
  }
}

interface BlockHandlerArgs {
  ctx: ActiveStreamContext;
  listeners: AgentChatBridgeRuntime['streamChunkListeners'];
  blockIndex: number;
  now: number;
}

function handleTextBlock(args: BlockHandlerArgs, textDelta: string): void {
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
    },
    ctx,
  );
}

function handleThinkingBlock(args: BlockHandlerArgs, textDelta: string): void {
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
    },
    ctx,
  );
}

type ToolActivity = NonNullable<NonNullable<ProviderProgressEvent['contentBlock']>['toolActivity']>;

function handleToolBlock(args: BlockHandlerArgs, toolActivity: ToolActivity): void {
  const { ctx, listeners, blockIndex, now } = args;
  if (toolActivity.status === 'running') {
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
    ctx.toolsUsed.push({ name: toolActivity.name, filePath: toolActivity.filePath });
    emitMonitorToolStart(ctx, blockIndex, toolActivity, now);
  } else if (toolActivity.status === 'complete') {
    // eslint-disable-next-line security/detect-object-injection -- numeric index into a local array
    const block = ctx.accumulatedBlocks[blockIndex];
    if (block.kind === 'tool_use')
      // eslint-disable-next-line security/detect-object-injection -- numeric index into a local array
      ctx.accumulatedBlocks[blockIndex] = { ...block, status: 'complete' } as AgentChatContentBlock;
    emitMonitorToolEnd(ctx, blockIndex, toolActivity.name, now);
  }
  emitStreamChunk(
    listeners,
    {
      threadId: ctx.threadId,
      messageId: ctx.assistantMessageId,
      type: 'tool_activity',
      blockIndex,
      toolActivity: {
        name: toolActivity.name,
        status: toolActivity.status,
        filePath: toolActivity.filePath,
        inputSummary: toolActivity.inputSummary,
        editSummary: toolActivity.editSummary,
      },
      timestamp: now,
    },
    ctx,
  );
}

function handleContentBlock(
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
  ctx.firstChunkEmitted = true;
}

function handleLegacyMessage(
  ctx: ActiveStreamContext,
  listeners: AgentChatBridgeRuntime['streamChunkListeners'],
  message: string,
  now: number,
): void {
  ctx.accumulatedText += message;
  const lastBlock = ctx.accumulatedBlocks[ctx.accumulatedBlocks.length - 1];
  if (lastBlock && lastBlock.kind === 'text') {
    (lastBlock as { kind: 'text'; content: string }).content += message;
  } else {
    ctx.accumulatedBlocks.push({ kind: 'text', content: message });
  }
  emitStreamChunk(
    listeners,
    {
      threadId: ctx.threadId,
      messageId: ctx.assistantMessageId,
      type: 'text_delta',
      textDelta: message,
      timestamp: now,
    },
    ctx,
  );
  ctx.firstChunkEmitted = true;
}

// ---------------------------------------------------------------------------
// Status-specific handlers
// ---------------------------------------------------------------------------

function handleStreamingProgress(
  ctx: ActiveStreamContext,
  runtime: AgentChatBridgeRuntime,
  progress: ProviderProgressEvent,
  now: number,
): void {
  if (progress.tokenUsage) ctx.tokenUsage = progress.tokenUsage;
  if (progress.contentBlock) {
    handleContentBlock(ctx, runtime.streamChunkListeners, progress.contentBlock, now);
  } else if (progress.message) {
    handleLegacyMessage(ctx, runtime.streamChunkListeners, progress.message, now);
  }
}

function handleCompletedProgress(
  ctx: ActiveStreamContext,
  runtime: AgentChatBridgeRuntime,
  progress: ProviderProgressEvent,
): void {
  stopIncrementalFlush(ctx);
  if (progress.tokenUsage) {
    ctx.tokenUsage = progress.tokenUsage;
    if (ctx.estimatedHistoryTokens && ctx.estimatedHistoryTokens > 0) {
      tokenCalibrationStore.recordObservation(
        ctx.estimatedHistoryTokens,
        progress.tokenUsage.inputTokens,
      );
    }
  }
  void persistCompletedTurn(ctx, runtime, progress);
}

function handleCancelledProgress(
  ctx: ActiveStreamContext,
  runtime: AgentChatBridgeRuntime,
  _progress: ProviderProgressEvent,
  now: number,
): void {
  stopIncrementalFlush(ctx);
  const hasContent = ctx.accumulatedText.length > 0 || ctx.accumulatedBlocks.length > 0;
  if (hasContent) {
    void persistCancelledTurn(ctx, runtime, now);
  } else {
    emitStreamChunk(runtime.streamChunkListeners, {
      threadId: ctx.threadId,
      messageId: ctx.assistantMessageId,
      type: 'complete',
      timestamp: now,
    });
    void runtime.threadStore
      .updateThread(ctx.threadId, { status: 'cancelled', latestOrchestration: ctx.link })
      .catch(() => {});
    emitMonitorSessionEnd(ctx, now, 'Cancelled');
    runtime.activeSends.delete(ctx.taskId);
  }
}

function handleFailedProgress(
  ctx: ActiveStreamContext,
  runtime: AgentChatBridgeRuntime,
  progress: ProviderProgressEvent,
  now: number,
): void {
  stopIncrementalFlush(ctx);
  const errorMessage = progress.message || 'Provider task failed.';
  const hasContent = ctx.accumulatedText.length > 0 || ctx.accumulatedBlocks.length > 0;
  if (hasContent) {
    void persistFailedTurnWithContent(ctx, runtime, errorMessage, now);
  } else {
    void persistFailedTurnNoContent(ctx, runtime, errorMessage, now);
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function handleProviderProgress(
  runtime: AgentChatBridgeRuntime,
  progress: ProviderProgressEvent,
): void {
  const ctx = findContextForProgress(runtime.activeSends, progress);
  if (!ctx) return;
  if (ctx.streamEnded && progress.status !== 'cancelled') return;

  syncProviderSessionId(ctx, progress);
  const now = runtime.now();

  if (progress.status === 'streaming') {
    handleStreamingProgress(ctx, runtime, progress, now);
  } else if (progress.status === 'completed') {
    handleCompletedProgress(ctx, runtime, progress);
  } else if (progress.status === 'cancelled') {
    handleCancelledProgress(ctx, runtime, progress, now);
  } else if (progress.status === 'failed') {
    handleFailedProgress(ctx, runtime, progress, now);
  }
}
