import { randomUUID } from 'crypto';

import { getConfigValue } from '../config';
import log from '../logger';
import { detectCorrection } from '../research/correctionDetector';
import { getCorrectionStore } from '../research/correctionStore';
import { getCorrectionWriter } from '../research/correctionWriter';
import { revertToSnapshotWithBridge } from './chatOrchestrationBridgeGit';
import { stopIncrementalFlush } from './chatOrchestrationBridgeMonitor';
import { handleProviderProgress } from './chatOrchestrationBridgeProgress';
import { executePendingSend } from './chatOrchestrationBridgeSend';
import {
  buildAgentChatOrchestrationLink,
  buildSendFailureResult,
} from './chatOrchestrationBridgeSupport';
import type {
  ActiveStreamContext,
  AgentChatBridgeRuntime,
  OrchestrationClient,
  StreamChunkListener,
} from './chatOrchestrationBridgeTypes';
import {
  deriveSmartTitle,
  generateLlmTitle,
  preparePendingSend,
  resolveSendOptions,
  validateSendRequest,
} from './chatOrchestrationRequestSupport';
import { resolveAgentChatSettings, type ResolvedAgentChatSettings } from './settingsResolver';
import { type AgentChatThreadStore, agentChatThreadStore } from './threadStore';
import type {
  AgentChatLinkedDetailsResult,
  AgentChatOrchestrationLink,
  AgentChatRevertResult,
  AgentChatSendMessageRequest,
  AgentChatSendResult,
  AgentChatStreamChunk,
} from './types';
import { getErrorMessage } from './utils';

export type { StreamChunkListener };

export interface AgentChatOrchestrationBridgeDeps {
  orchestration: OrchestrationClient;
  threadStore?: AgentChatThreadStore;
  createId?: () => string;
  getSettings?: () => ResolvedAgentChatSettings;
  now?: () => number;
}

export interface AgentChatOrchestrationBridge {
  sendMessage: (request: AgentChatSendMessageRequest) => Promise<AgentChatSendResult>;
  getLinkedDetails: (link: AgentChatOrchestrationLink) => Promise<AgentChatLinkedDetailsResult>;
  onStreamChunk: (listener: StreamChunkListener) => () => void;
  getActiveThreadIds: () => string[];
  getBufferedChunks: (threadId: string) => AgentChatStreamChunk[];
  findThreadIdForSession: (sessionOrTaskId: string) => string | undefined;
  /** Reverse lookup: find the taskId for a given threadId in activeSends. */
  findTaskIdForThread: (threadId: string) => string | undefined;
  /** Register a pending cancel for a thread whose taskId isn't available yet. */
  registerPendingCancel: (threadId: string) => void;
  revertToSnapshot: (threadId: string, messageId: string) => Promise<AgentChatRevertResult>;
  dispose: () => void;
}

// Re-export for consumers that import these from the bridge module
export { deriveSmartTitle, generateLlmTitle };
export type { ActiveStreamContext, AgentChatBridgeRuntime };

// ---------------------------------------------------------------------------
// Router context helper
// ---------------------------------------------------------------------------

/** Extract the last assistant message text for the model router's context window. */
function getLastAssistantContent(
  activeSends: AgentChatBridgeRuntime['activeSends'],
  threadId: string | undefined,
): string | undefined {
  if (!threadId) return undefined;
  // Check the in-memory stream buffer first (most recent assistant text).
  for (const [, ctx] of activeSends) {
    if (ctx.threadId === threadId && ctx.accumulatedText) {
      return ctx.accumulatedText.substring(0, 500);
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Send message
// ---------------------------------------------------------------------------

function findActiveThreadConflict(
  activeSends: AgentChatBridgeRuntime['activeSends'],
  threadId: string | undefined,
): string | undefined {
  if (!threadId) return undefined;
  for (const [, ctx] of activeSends) {
    if (ctx.threadId === threadId) {
      return 'A task is already running for this thread. Wait for it to finish or stop it first.';
    }
  }
  return undefined;
}

function buildEarlyReturnResult(
  pending: Awaited<ReturnType<typeof preparePendingSend>>,
): AgentChatSendResult {
  log.info(
    'sendMessage returning thread:',
    pending.thread.id,
    'messages:',
    pending.thread.messages.length,
    'ids:',
    pending.thread.messages.map((m) => `${m.role}:${m.id.slice(-6)}`).join(', '),
  );
  return {
    success: true,
    thread: pending.thread,
    message: pending.thread.messages.find((m) => m.id === pending.messageId),
  } as AgentChatSendResult;
}

/** Fire-and-forget correction capture — no control-flow impact on the send. */
function captureCorrection(userMessage: string, sessionId: string): void {
  const hit = detectCorrection(userMessage);
  if (!hit) return;
  getCorrectionStore().noteCorrection(sessionId, hit.library);
  getCorrectionWriter()?.append({
    library: hit.library,
    userCorrectionText: userMessage,
    sessionId,
    phrasingMatch: hit.phrasingMatch,
    confidence: hit.confidence,
  });
}

async function sendMessageWithBridge(
  runtime: AgentChatBridgeRuntime,
  request: AgentChatSendMessageRequest,
): Promise<AgentChatSendResult> {
  const validationError = validateSendRequest(request);
  if (validationError) return buildSendFailureResult({ error: validationError });

  const conflictError = findActiveThreadConflict(runtime.activeSends, request.threadId);
  if (conflictError) return buildSendFailureResult({ error: conflictError });

  try {
    const prevAssistant = getLastAssistantContent(runtime.activeSends, request.threadId);
    const pending = await preparePendingSend({
      content: request.content.trim(),
      createId: runtime.createId,
      now: runtime.now,
      request,
      resolved: resolveSendOptions(runtime.getSettings(), request, prevAssistant),
      threadStore: runtime.threadStore,
    });

    captureCorrection(request.content.trim(), pending.thread.id);

    void executePendingSend({
      orchestration: runtime.orchestration,
      pending,
      runtime,
      threadStore: runtime.threadStore,
    }).catch((err) => {
      log.error('background executePendingSend failed:', getErrorMessage(err));
    });

    return buildEarlyReturnResult(pending);
  } catch (error) {
    log.error('sendMessage failed:', getErrorMessage(error));
    if (error instanceof Error && error.stack) log.error(error.stack);
    return buildSendFailureResult({ error: getErrorMessage(error) });
  }
}

// ---------------------------------------------------------------------------
// Linked details
// ---------------------------------------------------------------------------

async function getLinkedDetailsWithBridge(
  orchestration: OrchestrationClient,
  link: AgentChatOrchestrationLink,
): Promise<AgentChatLinkedDetailsResult> {
  if (!link.sessionId) {
    return {
      success: false,
      error: 'The linked orchestration session is unavailable for this chat item.',
      link,
    };
  }
  const sessionResult = await orchestration.loadSession(link.sessionId);
  if (!sessionResult.success || !sessionResult.session) {
    return {
      success: false,
      error: sessionResult.error ?? `Orchestration session ${link.sessionId} was not found.`,
      link,
    };
  }
  return {
    success: true,
    link: buildAgentChatOrchestrationLink(sessionResult.session) ?? link,
    session: sessionResult.session,
    result: sessionResult.session.latestResult,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function buildRuntime(deps: AgentChatOrchestrationBridgeDeps): AgentChatBridgeRuntime {
  const streamChunkListeners = new Set<StreamChunkListener>();
  const activeSends = new Map<string, ActiveStreamContext>();
  const pendingCancels = new Set<string>();
  return {
    createId: deps.createId ?? randomUUID,
    getSettings:
      deps.getSettings ??
      (() =>
        resolveAgentChatSettings({
          agentChatSettings: getConfigValue('agentChatSettings'),
          claudeCliSettings: getConfigValue('claudeCliSettings'),
          codexCliSettings: getConfigValue('codexCliSettings'),
        })),
    now: deps.now ?? Date.now,
    orchestration: deps.orchestration,
    threadStore: deps.threadStore ?? agentChatThreadStore,
    streamChunkListeners,
    activeSends,
    pendingCancels,
  };
}

function buildActiveSendLookups(
  activeSends: Map<string, ActiveStreamContext>,
): Pick<
  AgentChatOrchestrationBridge,
  'getActiveThreadIds' | 'findThreadIdForSession' | 'findTaskIdForThread' | 'getBufferedChunks'
> {
  return {
    getActiveThreadIds: () => Array.from(activeSends.values()).map((ctx) => ctx.threadId),
    findThreadIdForSession(sessionOrTaskId) {
      for (const [taskId, ctx] of activeSends) {
        if (taskId === sessionOrTaskId || ctx.sessionId === sessionOrTaskId) return ctx.threadId;
      }
      return undefined;
    },
    findTaskIdForThread(threadId) {
      for (const [taskId, ctx] of activeSends) {
        if (ctx.threadId === threadId) return taskId;
      }
      return undefined;
    },
    getBufferedChunks(threadId) {
      for (const [, ctx] of activeSends) {
        if (ctx.threadId === threadId) return [...ctx.bufferedChunks];
      }
      return [];
    },
  };
}

function buildBridgeObject(
  runtime: AgentChatBridgeRuntime,
  unsubProviderEvent: () => void,
): AgentChatOrchestrationBridge {
  const { streamChunkListeners, activeSends } = runtime;
  return {
    sendMessage: (request) => sendMessageWithBridge(runtime, request),
    getLinkedDetails: (link) => getLinkedDetailsWithBridge(runtime.orchestration, link),
    onStreamChunk: (listener) => {
      streamChunkListeners.add(listener);
      return () => streamChunkListeners.delete(listener);
    },
    ...buildActiveSendLookups(activeSends),
    registerPendingCancel(threadId) {
      runtime.pendingCancels.add(threadId);
    },
    revertToSnapshot: (threadId, messageId) =>
      revertToSnapshotWithBridge(runtime.threadStore, activeSends, threadId, messageId),
    dispose: () => {
      unsubProviderEvent();
      streamChunkListeners.clear();
      for (const [, ctx] of activeSends) stopIncrementalFlush(ctx);
      activeSends.clear();
    },
  };
}

export function createAgentChatOrchestrationBridge(
  deps: AgentChatOrchestrationBridgeDeps,
): AgentChatOrchestrationBridge {
  const runtime = buildRuntime(deps);
  const unsubProviderEvent = deps.orchestration.onProviderEvent((event) => {
    handleProviderProgress(runtime, event);
  });
  return buildBridgeObject(runtime, unsubProviderEvent);
}
