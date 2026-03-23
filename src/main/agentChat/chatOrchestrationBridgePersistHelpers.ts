/**
 * chatOrchestrationBridgePersistHelpers.ts — Low-level helpers for turn persistence.
 *
 * Extracted from chatOrchestrationBridgePersist.ts to keep function and file sizes
 * under ESLint limits. Provides the upsert, status-update, snapshot-emit, and
 * finally-block patterns that are common across all four persist functions.
 */

import { emitMonitorSessionEnd, emitStreamChunk } from './chatOrchestrationBridgeMonitor';
import type { ActiveStreamContext, AgentChatBridgeRuntime } from './chatOrchestrationBridgeTypes';
import type { AgentChatMessageRecord, AgentChatOrchestrationLink, AgentChatThreadRecord } from './types';

// ---------------------------------------------------------------------------
// Upsert helpers
// ---------------------------------------------------------------------------

type PartialContentUpdate = Pick<
  AgentChatMessageRecord,
  'content' | 'orchestration' | 'toolsSummary' | 'blocks' | 'error'
>;

/**
 * Load the thread, then either update the existing message or append a new one.
 * Returns the updated thread and a flag indicating whether the message existed.
 */
export async function upsertOrAppendMessage(args: {
  runtime: AgentChatBridgeRuntime;
  threadId: string;
  messageId: string;
  message: AgentChatMessageRecord;
  update: PartialContentUpdate;
}): Promise<{ updatedThread: AgentChatThreadRecord; existed: boolean }> {
  const { runtime, threadId, messageId, message, update } = args;
  const thread = await runtime.threadStore.loadThread(threadId);
  const existed = thread?.messages.some((m) => m.id === messageId) ?? false;
  const updatedThread = existed
    ? await runtime.threadStore.updateMessage(threadId, messageId, update)
    : await runtime.threadStore.appendMessage(threadId, message);
  return { updatedThread, existed };
}

// ---------------------------------------------------------------------------
// Status / snapshot helpers
// ---------------------------------------------------------------------------

/** Update thread status + link, then return the freshest loaded copy. */
export async function finalizeThreadStatus(
  runtime: AgentChatBridgeRuntime,
  thread: AgentChatThreadRecord,
  status: 'complete' | 'cancelled' | 'failed',
  link: AgentChatOrchestrationLink,
): Promise<AgentChatThreadRecord> {
  await runtime.threadStore.updateThread(thread.id, { status, latestOrchestration: link });
  return (await runtime.threadStore.loadThread(thread.id)) ?? thread;
}

/** Emit a thread_snapshot chunk to all listeners. */
export function emitSnapshotChunk(
  runtime: AgentChatBridgeRuntime,
  threadId: string,
  messageId: string,
  thread: AgentChatThreadRecord,
): void {
  emitStreamChunk(runtime.streamChunkListeners, {
    threadId,
    messageId,
    type: 'thread_snapshot',
    timestamp: Date.now(),
    thread,
  });
}

// ---------------------------------------------------------------------------
// Finally-block helpers
// ---------------------------------------------------------------------------

/** Emit complete chunk + monitor end + remove from activeSends (used by completed/cancelled turns). */
export function emitTurnComplete(
  runtime: AgentChatBridgeRuntime,
  ctx: ActiveStreamContext,
  monitorLabel?: string,
): void {
  emitStreamChunk(runtime.streamChunkListeners, {
    threadId: ctx.threadId,
    messageId: ctx.assistantMessageId,
    type: 'complete',
    timestamp: Date.now(),
  });
  emitMonitorSessionEnd(ctx, Date.now(), monitorLabel);
  runtime.activeSends.delete(ctx.taskId);
}

/** Emit error chunk + monitor end + remove from activeSends (used by failed turns). */
export function emitTurnError(
  runtime: AgentChatBridgeRuntime,
  ctx: ActiveStreamContext,
  errorMessage: string,
): void {
  emitStreamChunk(runtime.streamChunkListeners, {
    threadId: ctx.threadId,
    messageId: ctx.assistantMessageId,
    type: 'error',
    textDelta: errorMessage,
    timestamp: Date.now(),
  });
  emitMonitorSessionEnd(ctx, Date.now(), errorMessage);
  runtime.activeSends.delete(ctx.taskId);
}
