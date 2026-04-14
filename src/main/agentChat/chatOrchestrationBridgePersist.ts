/**
 * chatOrchestrationBridgePersist.ts — Persistence helpers for terminal progress events.
 *
 * Extracted from chatOrchestrationBridge.ts to keep file line counts under the ESLint limit.
 * Handles SQLite persistence for completed, cancelled, and failed agent turns.
 */

import log from '../logger';
import type { ProviderProgressEvent } from '../orchestration/types';
import { capturePostTurnCheckpoint } from './chatOrchestrationBridgeGit';
import { emitStreamChunk } from './chatOrchestrationBridgeMonitor';
import {
  emitSnapshotChunk,
  emitTurnComplete,
  emitTurnError,
  finalizeThreadStatus,
  upsertOrAppendMessage,
} from './chatOrchestrationBridgePersistHelpers';
import type { ActiveStreamContext, AgentChatBridgeRuntime } from './chatOrchestrationBridgeTypes';
import { deriveSmartTitle, generateLlmTitle } from './chatTitleDerivation';
import {
  projectProviderFailureToAssistantMessage,
  projectProviderResultToAssistantMessage,
} from './responseProjector';
import { sessionMemoryStore } from './sessionMemory';
import type { AgentChatOrchestrationLink, AgentChatThreadRecord } from './types';

// ---------------------------------------------------------------------------
// Generic message upsert helper (completion path — includes cost/duration fields)
// ---------------------------------------------------------------------------

async function upsertAssistantMessage(
  runtime: AgentChatBridgeRuntime,
  threadId: string,
  messageId: string,
  message: ReturnType<typeof projectProviderResultToAssistantMessage>,
): Promise<AgentChatThreadRecord> {
  const thread = await runtime.threadStore.loadThread(threadId);
  const exists = thread?.messages.some((m) => m.id === messageId);
  if (exists) {
    return runtime.threadStore.updateMessage(threadId, messageId, {
      content: message.content,
      orchestration: message.orchestration,
      toolsSummary: message.toolsSummary,
      costSummary: message.costSummary,
      durationSummary: message.durationSummary,
      tokenUsage: message.tokenUsage,
      model: message.model,
      blocks: message.blocks,
    });
  }
  return runtime.threadStore.appendMessage(threadId, message);
}

// ---------------------------------------------------------------------------
// Title update helpers
// ---------------------------------------------------------------------------

async function updateHeuristicTitle(
  runtime: AgentChatBridgeRuntime,
  thread: AgentChatThreadRecord,
  ctx: ActiveStreamContext,
): Promise<void> {
  if (ctx.toolsUsed.length === 0) return;
  const userPrompt = thread.messages.find((m) => m.role === 'user')?.content ?? '';
  const titleArgs = { userPrompt, responseText: ctx.accumulatedText, toolsUsed: ctx.toolsUsed };
  const heuristicTitle = deriveSmartTitle(titleArgs);
  if (heuristicTitle) {
    await runtime.threadStore.updateThread(thread.id, { title: heuristicTitle });
    scheduleLlmTitleUpgrade(runtime, thread.id, titleArgs);
  }
}

function scheduleLlmTitleUpgrade(
  runtime: AgentChatBridgeRuntime,
  threadId: string,
  titleArgs: {
    userPrompt: string;
    responseText: string;
    toolsUsed: Array<{ name: string; filePath?: string }>;
  },
): void {
  void generateLlmTitle(titleArgs)
    .then(async (llmTitle) => {
      if (!llmTitle) return;
      await runtime.threadStore.updateThread(threadId, { title: llmTitle });
      const refreshed = await runtime.threadStore.loadThread(threadId);
      if (refreshed) {
        emitStreamChunk(runtime.streamChunkListeners, {
          threadId,
          messageId: '',
          type: 'thread_snapshot',
          timestamp: Date.now(),
          thread: refreshed,
        });
      }
    })
    .catch(() => {
      /* heuristic title preserved on failure */
    });
}

// ---------------------------------------------------------------------------
// Completed turn
// ---------------------------------------------------------------------------

function mergeProviderSessionId(
  link: AgentChatOrchestrationLink,
  providerSessionId: string | undefined,
): void {
  if (!providerSessionId) return;
  if (link.provider === 'claude-code') link.claudeSessionId ??= providerSessionId;
  else if (link.provider === 'codex') link.codexThreadId ??= providerSessionId;
}

function applyStickyField<K extends keyof AgentChatOrchestrationLink>(
  link: AgentChatOrchestrationLink,
  existing: AgentChatOrchestrationLink | undefined,
  key: K,
): void {
  // eslint-disable-next-line security/detect-object-injection -- key is a known literal keyof AgentChatOrchestrationLink
  const existingVal = existing?.[key];
  // eslint-disable-next-line security/detect-object-injection -- key is a known literal keyof AgentChatOrchestrationLink
  if (existingVal !== undefined && !link[key]) {
    // eslint-disable-next-line security/detect-object-injection -- key is a known literal keyof AgentChatOrchestrationLink
    link[key] = existingVal;
  }
}

function mergeStickyFields(
  link: AgentChatOrchestrationLink,
  existing: AgentChatOrchestrationLink | undefined,
  model: string | undefined,
): void {
  if (!link.provider && existing?.provider) link.provider = existing.provider;
  applyStickyField(link, existing, 'claudeSessionId');
  applyStickyField(link, existing, 'codexThreadId');
  applyStickyField(link, existing, 'linkedTerminalId');
  if (!link.model) link.model = model || existing?.model;
  applyStickyField(link, existing, 'effort');
}

function buildFreshLink(
  ctx: ActiveStreamContext,
  existing: AgentChatOrchestrationLink | undefined,
  providerSessionIdFromStream: string | undefined,
): AgentChatOrchestrationLink {
  const freshLink: AgentChatOrchestrationLink = { ...ctx.link };
  mergeStickyFields(freshLink, existing, ctx.model);
  mergeProviderSessionId(freshLink, providerSessionIdFromStream);
  return freshLink;
}

async function persistCompletedTurnInner(
  ctx: ActiveStreamContext,
  runtime: AgentChatBridgeRuntime,
  assistantMessage: ReturnType<typeof projectProviderResultToAssistantMessage>,
  providerSessionIdFromStream: string | undefined,
): Promise<void> {
  const { threadId, assistantMessageId } = ctx;
  const updatedThread = await upsertAssistantMessage(
    runtime,
    threadId,
    assistantMessageId,
    assistantMessage,
  );
  const thread = await runtime.threadStore.loadThread(threadId);
  const freshLink = buildFreshLink(ctx, thread?.latestOrchestration, providerSessionIdFromStream);
  const finalThread = await finalizeThreadStatus(runtime, updatedThread, 'complete', freshLink);
  const isFirstResponse = finalThread.messages.filter((m) => m.role === 'assistant').length <= 1;
  if (isFirstResponse) await updateHeuristicTitle(runtime, finalThread, ctx);
  const snapshot = (await runtime.threadStore.loadThread(threadId)) ?? finalThread;
  emitSnapshotChunk(runtime, threadId, assistantMessageId, snapshot);
  void capturePostTurnCheckpoint(runtime, threadId, assistantMessageId, snapshot.workspaceRoot);
  void sessionMemoryStore.decayUnused(snapshot.workspaceRoot, []).catch(() => {});
}

export async function persistCompletedTurn(
  ctx: ActiveStreamContext,
  runtime: AgentChatBridgeRuntime,
  progress: ProviderProgressEvent,
): Promise<void> {
  const { threadId, assistantMessageId } = ctx;
  const providerSessionIdFromStream = progress.session?.sessionId;
  const assistantMessage = projectProviderResultToAssistantMessage({
    threadId,
    messageId: assistantMessageId,
    responseText: ctx.accumulatedText,
    orchestrationLink: ctx.link,
    tokenUsage: ctx.tokenUsage,
    model: ctx.model,
    costUsd: progress.costUsd,
    durationMs: progress.durationMs,
    timestamp: runtime.now(),
    blocks: ctx.accumulatedBlocks,
  });
  try {
    await persistCompletedTurnInner(ctx, runtime, assistantMessage, providerSessionIdFromStream);
  } catch (error) {
    log.error('completion persistence failed for thread', threadId, error);
  } finally {
    emitTurnComplete(runtime, ctx);
  }
}

// ---------------------------------------------------------------------------
// Cancelled turn
// ---------------------------------------------------------------------------

export async function persistCancelledTurn(
  ctx: ActiveStreamContext,
  runtime: AgentChatBridgeRuntime,
  now: number,
): Promise<void> {
  const { threadId, assistantMessageId } = ctx;
  const partialMessage = projectProviderResultToAssistantMessage({
    threadId,
    messageId: assistantMessageId,
    responseText: ctx.accumulatedText,
    orchestrationLink: ctx.link,
    tokenUsage: ctx.tokenUsage,
    model: ctx.model,
    timestamp: now,
    blocks: ctx.accumulatedBlocks,
  });

  try {
    const { updatedThread } = await upsertOrAppendMessage({
      runtime,
      threadId,
      messageId: assistantMessageId,
      message: partialMessage,
      update: {
        content: partialMessage.content,
        orchestration: partialMessage.orchestration,
        toolsSummary: partialMessage.toolsSummary,
        blocks: partialMessage.blocks,
      },
    });
    const finalThread = await finalizeThreadStatus(runtime, updatedThread, 'cancelled', ctx.link);
    emitSnapshotChunk(runtime, threadId, assistantMessageId, finalThread);
  } catch (error) {
    log.error('cancel persistence failed for thread', threadId, error);
  } finally {
    emitTurnComplete(runtime, ctx, 'Cancelled');
  }
}

// ---------------------------------------------------------------------------
// Failed turn — with partial content
// ---------------------------------------------------------------------------

export async function persistFailedTurnWithContent(
  ctx: ActiveStreamContext,
  runtime: AgentChatBridgeRuntime,
  errorMessage: string,
  now: number,
): Promise<void> {
  const { threadId, assistantMessageId } = ctx;
  const partialMessage = projectProviderResultToAssistantMessage({
    threadId,
    messageId: assistantMessageId,
    responseText: ctx.accumulatedText,
    orchestrationLink: ctx.link,
    tokenUsage: ctx.tokenUsage,
    model: ctx.model,
    timestamp: now,
    blocks: ctx.accumulatedBlocks,
  });
  partialMessage.error = { code: 'orchestration_failed', message: errorMessage, recoverable: true };

  try {
    const { updatedThread } = await upsertOrAppendMessage({
      runtime,
      threadId,
      messageId: assistantMessageId,
      message: partialMessage,
      update: {
        content: partialMessage.content,
        orchestration: partialMessage.orchestration,
        toolsSummary: partialMessage.toolsSummary,
        blocks: partialMessage.blocks,
      },
    });
    const finalThread = await finalizeThreadStatus(runtime, updatedThread, 'failed', ctx.link);
    emitSnapshotChunk(runtime, threadId, assistantMessageId, finalThread);
  } catch (error) {
    log.error('failure persistence failed for thread', threadId, error);
  } finally {
    emitTurnError(runtime, ctx, errorMessage);
  }
}

// ---------------------------------------------------------------------------
// Failed turn — no content accumulated
// ---------------------------------------------------------------------------

export async function persistFailedTurnNoContent(
  ctx: ActiveStreamContext,
  runtime: AgentChatBridgeRuntime,
  errorMessage: string,
  now: number,
): Promise<void> {
  const { threadId, assistantMessageId } = ctx;
  const failureMessage = projectProviderFailureToAssistantMessage({
    threadId,
    messageId: assistantMessageId,
    errorMessage,
    orchestrationLink: ctx.link,
    timestamp: now,
  });

  try {
    const { updatedThread } = await upsertOrAppendMessage({
      runtime,
      threadId,
      messageId: assistantMessageId,
      message: failureMessage,
      update: {
        content: failureMessage.content,
        orchestration: failureMessage.orchestration,
        error: failureMessage.error,
      },
    });
    const finalThread = await finalizeThreadStatus(runtime, updatedThread, 'failed', ctx.link);
    emitSnapshotChunk(runtime, threadId, assistantMessageId, finalThread);
  } catch (error) {
    log.error('failure persistence failed for thread', threadId, error);
  } finally {
    emitTurnError(runtime, ctx, errorMessage);
  }
}
