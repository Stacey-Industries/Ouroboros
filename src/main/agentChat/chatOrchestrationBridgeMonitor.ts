/**
 * chatOrchestrationBridgeMonitor.ts — Stream chunk emission and Agent Monitor bridge helpers.
 *
 * Extracted from chatOrchestrationBridge.ts to keep file line counts under the ESLint limit.
 */

import type { HookPayload } from '../hooks';
import { dispatchSyntheticHookEvent } from '../hooks';
import log from '../logger';
import type {
  ActiveStreamContext,
  AgentChatBridgeRuntime,
  StreamChunkListener,
} from './chatOrchestrationBridgeTypes';
import { projectProviderResultToAssistantMessage } from './responseProjector';
import type { AgentChatStreamChunk } from './types';

// ---------------------------------------------------------------------------
// Stream chunk emission
// ---------------------------------------------------------------------------

export function emitStreamChunk(
  listeners: Set<StreamChunkListener>,
  chunk: AgentChatStreamChunk,
  ctx?: ActiveStreamContext,
): void {
  if (
    ctx &&
    chunk.type !== 'complete' &&
    chunk.type !== 'error' &&
    chunk.type !== 'thread_snapshot'
  ) {
    ctx.bufferedChunks.push(chunk);
  }
  for (const listener of listeners) {
    try {
      listener(chunk);
    } catch {
      /* swallow listener errors */
    }
  }
}

// ---------------------------------------------------------------------------
// Incremental flush lifecycle
// ---------------------------------------------------------------------------

export function stopIncrementalFlush(ctx: ActiveStreamContext): void {
  ctx.streamEnded = true;
  if (ctx.flushTimer) {
    clearInterval(ctx.flushTimer);
    ctx.flushTimer = undefined;
  }
}

// ---------------------------------------------------------------------------
// Agent Monitor bridge
// ---------------------------------------------------------------------------

function ensureMonitorSessionStarted(ctx: ActiveStreamContext, now: number): void {
  if (ctx.monitorStartEmitted) return;
  ctx.monitorStartEmitted = true;
  const sessionId = ctx.providerSessionId ?? ctx.sessionId;
  dispatchSyntheticHookEvent({
    type: 'agent_start',
    sessionId,
    taskLabel: ctx.userPrompt ?? `Chat ${ctx.threadId.slice(0, 8)}`,
    prompt: ctx.userPrompt,
    timestamp: now,
  });
}

export function emitMonitorToolStart(
  ctx: ActiveStreamContext,
  blockIndex: number,
  toolActivity: { name: string; filePath?: string; inputSummary?: string },
  now: number,
): void {
  const sessionId = ctx.providerSessionId ?? ctx.sessionId;
  ensureMonitorSessionStarted(ctx, now);
  const input: Record<string, unknown> = {};
  if (toolActivity.filePath) input.file_path = toolActivity.filePath;
  if (toolActivity.inputSummary) input.description = toolActivity.inputSummary;
  dispatchSyntheticHookEvent({
    type: 'pre_tool_use',
    sessionId,
    toolName: toolActivity.name,
    toolCallId: `stream-${ctx.sessionId}-${blockIndex}`,
    input,
    timestamp: now,
  } as HookPayload);
}

export function emitMonitorToolEnd(
  ctx: ActiveStreamContext,
  blockIndex: number,
  toolName: string,
  now: number,
): void {
  const sessionId = ctx.providerSessionId ?? ctx.sessionId;
  dispatchSyntheticHookEvent({
    type: 'post_tool_use',
    sessionId,
    toolName,
    toolCallId: `stream-${ctx.sessionId}-${blockIndex}`,
    timestamp: now,
  } as HookPayload);
}

export function emitMonitorSessionEnd(ctx: ActiveStreamContext, now: number, error?: string): void {
  const sessionId = ctx.providerSessionId ?? ctx.sessionId;
  if (!ctx.monitorStartEmitted) return;
  const payload: HookPayload = { type: 'agent_end', sessionId, timestamp: now };
  if (error) (payload as unknown as Record<string, unknown>).error = error;
  if (ctx.tokenUsage) {
    payload.usage = {
      input_tokens: ctx.tokenUsage.inputTokens,
      output_tokens: ctx.tokenUsage.outputTokens,
    };
  }
  dispatchSyntheticHookEvent(payload);
}

// ---------------------------------------------------------------------------
// Incremental persistence flush
// ---------------------------------------------------------------------------

const FLUSH_INTERVAL_MS = 5000;

export async function flushPartialMessage(
  runtime: AgentChatBridgeRuntime,
  ctx: ActiveStreamContext,
): Promise<void> {
  if (ctx.streamEnded || !ctx.firstChunkEmitted) return;
  const partialMessage = projectProviderResultToAssistantMessage({
    threadId: ctx.threadId,
    messageId: ctx.assistantMessageId,
    responseText: ctx.accumulatedText,
    orchestrationLink: ctx.link,
    tokenUsage: ctx.tokenUsage,
    model: ctx.model,
    timestamp: runtime.now(),
    blocks: ctx.accumulatedBlocks,
  });
  if (ctx.accumulatedBlocks.length > 0) {
    partialMessage.blocks = ctx.accumulatedBlocks.map((b) => ({ ...b }));
  }
  if (ctx.streamEnded) return;
  try {
    const thread = await runtime.threadStore.loadThread(ctx.threadId);
    if (ctx.streamEnded) return;
    const exists = thread?.messages.some((m) => m.id === ctx.assistantMessageId);
    if (exists) {
      await runtime.threadStore.updateMessage(ctx.threadId, ctx.assistantMessageId, {
        content: partialMessage.content,
        orchestration: partialMessage.orchestration,
        toolsSummary: partialMessage.toolsSummary,
        blocks: partialMessage.blocks,
      });
    } else {
      await runtime.threadStore.appendMessage(ctx.threadId, partialMessage);
    }
  } catch (error) {
    log.warn('incremental flush failed for thread', ctx.threadId, error);
  }
}

export function startIncrementalFlush(
  runtime: AgentChatBridgeRuntime,
  ctx: ActiveStreamContext,
): void {
  ctx.flushTimer = setInterval(() => {
    if (ctx.streamEnded || ctx.flushTimer === undefined) return;
    void flushPartialMessage(runtime, ctx);
  }, FLUSH_INTERVAL_MS);
}
