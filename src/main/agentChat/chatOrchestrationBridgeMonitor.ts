/**
 * chatOrchestrationBridgeMonitor.ts — Stream chunk emission and Agent Monitor bridge helpers.
 *
 * Extracted from chatOrchestrationBridge.ts to keep file line counts under the ESLint limit.
 */

import type { HookPayload } from '../hooks';
import { dispatchSyntheticHookEvent, endChatSessionLaunch } from '../hooks';
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
//
// Claude Code emits its own hook events (session_start, pre_tool_use, etc.)
// via installed hook scripts. The synthetic events here only annotate the
// existing Claude Code session — they never create a separate session.
//
// - ensureMonitorSessionStarted: emits agent_start with the PROVIDER session
//   ID (same as Claude Code's session_start) so the reducer updates the
//   existing session's label to the user prompt instead of "Session <prefix>".
// - Tool events: NOT emitted — Claude Code hook scripts handle these.
// - emitMonitorSessionEnd: emits agent_end with provider session ID to
//   deliver token/usage data to the correct session.
// ---------------------------------------------------------------------------

export function ensureMonitorSessionStarted(ctx: ActiveStreamContext, now: number): void {
  if (ctx.monitorStartEmitted) return;
  // Wait until we know the Claude Code session ID so we annotate the
  // existing session rather than creating a duplicate.
  if (!ctx.providerSessionId) return;
  ctx.monitorStartEmitted = true;
  // The synthetic agent_start is about to fire — clear the launch flag so
  // syntheticSessionIds takes over suppression from here.
  endChatSessionLaunch();
  dispatchSyntheticHookEvent({
    type: 'agent_start',
    sessionId: ctx.providerSessionId,
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
  ensureMonitorSessionStarted(ctx, now);
  if (!ctx.providerSessionId) return;
  const input: Record<string, unknown> = {};
  if (toolActivity.filePath) input.file_path = toolActivity.filePath;
  if (toolActivity.inputSummary) input.description = toolActivity.inputSummary;
  dispatchSyntheticHookEvent({
    type: 'pre_tool_use',
    sessionId: ctx.providerSessionId,
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
  if (!ctx.providerSessionId) return;
  dispatchSyntheticHookEvent({
    type: 'post_tool_use',
    sessionId: ctx.providerSessionId,
    toolName,
    toolCallId: `stream-${ctx.sessionId}-${blockIndex}`,
    timestamp: now,
  } as HookPayload);
}

export function emitMonitorSessionEnd(ctx: ActiveStreamContext, now: number, error?: string): void {
  // If the synthetic agent_start never fired (no tools, or providerSessionId
  // was never captured), clean up the launch flag so it doesn't leak.
  if (!ctx.monitorStartEmitted) {
    endChatSessionLaunch();
    return;
  }
  if (!ctx.providerSessionId) return;
  const payload: HookPayload = {
    type: 'agent_end',
    sessionId: ctx.providerSessionId,
    timestamp: now,
  };
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
