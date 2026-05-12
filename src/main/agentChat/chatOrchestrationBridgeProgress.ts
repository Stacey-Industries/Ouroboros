/**
 * chatOrchestrationBridgeProgress.ts — Provider progress event handlers for the orchestration bridge.
 *
 * Extracted from chatOrchestrationBridge.ts to keep file line counts under the ESLint limit.
 * Handles streaming, completion, cancellation, and failure progress events.
 * Block-level helpers live in chatOrchestrationBridgeProgressBlocks.ts.
 *
 * Phase 4: reportTerminal calls added to completed/cancelled/failed handlers so
 * DiffComparator fires on every real chat turn.
 */

import type { TurnId } from '@shared/types/canonicalChatEvent';

import type { ProviderProgressEvent } from '../orchestration/types';
import {
  emitMonitorSessionEnd,
  emitStreamChunk,
  ensureMonitorSessionStarted,
  stopIncrementalFlush,
} from './chatOrchestrationBridgeMonitor';
import {
  persistCancelledTurn,
  persistCompletedTurn,
  persistFailedTurnNoContent,
  persistFailedTurnWithContent,
} from './chatOrchestrationBridgePersist';
import { handleContentBlock } from './chatOrchestrationBridgeProgressBlocks';
import { findContextForProgress } from './chatOrchestrationBridgeProgressHelpers';
import { closeOpenSubagents } from './chatOrchestrationBridgeSubagent';
import type { ActiveStreamContext, AgentChatBridgeRuntime } from './chatOrchestrationBridgeTypes';
import { getShadowTap } from './shadowTap';
import { tokenCalibrationStore } from './tokenCalibration';

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
// Legacy message handler
// ---------------------------------------------------------------------------

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
  // Wave 57 Phase C — close any Task child sessions that didn't complete.
  closeOpenSubagents(ctx, 'success');
  if (progress.tokenUsage) {
    ctx.tokenUsage = progress.tokenUsage;
    if (ctx.estimatedHistoryTokens && ctx.estimatedHistoryTokens > 0) {
      tokenCalibrationStore.recordObservation(
        ctx.estimatedHistoryTokens,
        progress.tokenUsage.inputTokens,
      );
    }
  }
  if (progress.costUsd != null) ctx.costUsd = progress.costUsd;
  void persistCompletedTurn(ctx, runtime, progress);
  // Phase 4: signal shadow path that this turn reached a terminal state.
  getShadowTap()?.reportTerminal(ctx.taskId as TurnId, 'completed');
}

function handleCancelledProgress(
  ctx: ActiveStreamContext,
  runtime: AgentChatBridgeRuntime,
  _progress: ProviderProgressEvent,
  now: number,
): void {
  stopIncrementalFlush(ctx);
  // Wave 57 Phase C — close any Task child sessions that didn't complete.
  closeOpenSubagents(ctx, 'cancelled');
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
  // Phase 4: signal shadow path that this turn reached a terminal state.
  getShadowTap()?.reportTerminal(ctx.taskId as TurnId, 'cancelled');
}

function handleFailedProgress(
  ctx: ActiveStreamContext,
  runtime: AgentChatBridgeRuntime,
  progress: ProviderProgressEvent,
  now: number,
): void {
  stopIncrementalFlush(ctx);
  // Wave 57 Phase C — close any Task child sessions that didn't complete.
  closeOpenSubagents(ctx, 'error');
  const errorMessage = progress.message || 'Provider task failed.';
  const hasContent = ctx.accumulatedText.length > 0 || ctx.accumulatedBlocks.length > 0;
  if (hasContent) {
    void persistFailedTurnWithContent(ctx, runtime, errorMessage, now);
  } else {
    void persistFailedTurnNoContent(ctx, runtime, errorMessage, now);
  }
  // Phase 4: signal shadow path that this turn reached a terminal state.
  getShadowTap()?.reportTerminal(ctx.taskId as TurnId, 'failed');
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
  // Emit the synthetic agent_start as soon as providerSessionId is known —
  // before tool events arrive. This registers the session in activeSessions
  // so that inferSessionId can remap Claude Code hook tool events to it.
  ensureMonitorSessionStarted(ctx, runtime.now());
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
