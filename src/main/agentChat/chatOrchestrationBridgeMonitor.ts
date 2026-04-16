/**
 * chatOrchestrationBridgeMonitor.ts — Stream chunk emission and Agent Monitor bridge helpers.
 *
 * Extracted from chatOrchestrationBridge.ts to keep file line counts under the ESLint limit.
 */

import type { HookPayload } from '../hooks';
import { dispatchSyntheticHookEvent, endChatSessionLaunch } from '../hooks';
import log from '../logger';
import { registerSessionTrace } from '../orchestration/contextOutcomeObserver';
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

const MAX_BUFFERED_CHUNKS = 500;

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
    if (ctx.bufferedChunks.length > MAX_BUFFERED_CHUNKS) {
      ctx.bufferedChunks.splice(0, ctx.bufferedChunks.length - MAX_BUFFERED_CHUNKS);
    }
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
  if (!ctx.streamEnded && typeof ctx.sendStartedAt === 'number') {
    log.info('[chat-perf] total-turn-wallclock:', Date.now() - ctx.sendStartedAt, 'ms', 'thread:', ctx.threadId);
  }
  ctx.streamEnded = true;
  if (ctx.flushTimer) {
    clearInterval(ctx.flushTimer);
    ctx.flushTimer = undefined;
  }
}

// ---------------------------------------------------------------------------
// Agent Monitor bridge
//
// All synthetic events use the chat THREAD ID as the monitor session ID.
// This ensures all prompts within the same thread appear as a single session
// in the Agent Monitor — the reducer's updateExistingSession path resets
// status to 'running' while preserving accumulated tokens and tool calls.
//
// Claude Code hook events are suppressed during streaming (via syntheticSessionIds).
// ---------------------------------------------------------------------------

export function ensureMonitorSessionStarted(ctx: ActiveStreamContext, now: number): void {
  if (ctx.monitorStartEmitted) return;
  // Wait until the provider has connected before showing the session.
  if (!ctx.providerSessionId) return;
  ctx.monitorStartEmitted = true;
  endChatSessionLaunch();
  // Register the sessionId → traceId mapping so the hooks tap can route
  // post_tool_use events to the correct outcome observer turn.
  if (ctx.outcomeTraceId) {
    registerSessionTrace(ctx.threadId, ctx.outcomeTraceId);
  }
  dispatchSyntheticHookEvent({
    type: 'agent_start',
    sessionId: ctx.threadId,
    taskLabel: ctx.userPrompt ?? `Chat ${ctx.threadId.slice(0, 8)}`,
    prompt: ctx.userPrompt,
    timestamp: now,
    model: ctx.model,
  });
}

export function emitMonitorToolStart(
  ctx: ActiveStreamContext,
  blockIndex: number,
  toolActivity: { name: string; filePath?: string; inputSummary?: string },
  now: number,
): void {
  ensureMonitorSessionStarted(ctx, now);
  if (!ctx.monitorStartEmitted) return;
  const input: Record<string, unknown> = {};
  if (toolActivity.filePath) input.file_path = toolActivity.filePath;
  if (toolActivity.inputSummary) input.description = toolActivity.inputSummary;
  dispatchSyntheticHookEvent({
    type: 'pre_tool_use',
    sessionId: ctx.threadId,
    toolName: toolActivity.name,
    toolCallId: `stream-${ctx.sessionId}-${blockIndex}`,
    input,
    timestamp: now,
  } as HookPayload);
}

export function emitMonitorToolEnd(
  ctx: ActiveStreamContext,
  blockIndex: number,
  opts: { toolName: string; now: number; output?: string },
): void {
  if (!ctx.monitorStartEmitted) return;
  dispatchSyntheticHookEvent({
    type: 'post_tool_use',
    sessionId: ctx.threadId,
    toolName: opts.toolName,
    toolCallId: `stream-${ctx.sessionId}-${blockIndex}`,
    timestamp: opts.now,
    output: opts.output ? { content: opts.output } : undefined,
  } as HookPayload);
}

export function emitMonitorSubTool(
  ctx: ActiveStreamContext,
  blockIndex: number,
  sub: {
    name: string;
    status: 'running' | 'complete';
    subToolId: string;
    filePath?: string;
    inputSummary?: string;
    output?: string;
  },
  now: number,
): void {
  if (!ctx.monitorStartEmitted) return;
  const parentToolCallId = `stream-${ctx.sessionId}-${blockIndex}`;
  const toolCallId = `${parentToolCallId}-sub-${sub.subToolId}`;
  const type = sub.status === 'running' ? 'pre_tool_use' : 'post_tool_use';
  const input: Record<string, unknown> = {};
  if (sub.filePath) input.file_path = sub.filePath;
  if (sub.inputSummary) input.description = sub.inputSummary;
  dispatchSyntheticHookEvent({
    type,
    sessionId: ctx.threadId,
    toolName: sub.name || 'Tool',
    toolCallId,
    input: type === 'pre_tool_use' ? input : undefined,
    output: sub.output ? { content: sub.output } : undefined,
    timestamp: now,
    parentToolCallId,
  } as HookPayload);
}

export function emitMonitorSessionEnd(ctx: ActiveStreamContext, now: number, error?: string): void {
  if (!ctx.monitorStartEmitted) {
    endChatSessionLaunch();
    return;
  }
  const payload: HookPayload = {
    type: 'agent_end',
    sessionId: ctx.threadId,
    timestamp: now,
    model: ctx.model,
  };
  if (error) (payload as unknown as Record<string, unknown>).error = error;
  if (ctx.costUsd != null) payload.costUsd = ctx.costUsd;
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
