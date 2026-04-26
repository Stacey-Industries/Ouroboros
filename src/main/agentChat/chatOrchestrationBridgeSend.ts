/** chatOrchestrationBridgeSend.ts — Task send flow. Low-level helpers in chatOrchestrationBridgeSendHelpers.ts. */

import { beginChatSessionLaunch } from '../hooks';
import log from '../logger';
import { captureHeadHash } from './chatOrchestrationBridgeGit';
import { startIncrementalFlush, stopIncrementalFlush } from './chatOrchestrationBridgeMonitor';
import {
  failPendingSend,
  inheritExistingLinkFields,
} from './chatOrchestrationBridgeSendHelpers';
import {
  buildAgentChatOrchestrationLink,
  buildAssistantMessageId,
  buildSendSuccessResult,
  mapOrchestrationStatusToAgentChatStatus,
  persistThreadLinkage,
} from './chatOrchestrationBridgeSupport';
import type {
  ActiveStreamContext,
  AgentChatBridgeRuntime,
  OrchestrationClient,
} from './chatOrchestrationBridgeTypes';
import type { PreparedSend } from './chatOrchestrationRequestSupport';
import type { AgentChatThreadStore } from './threadStore';
import { tokenCalibrationStore } from './tokenCalibration';
import type { AgentChatOrchestrationLink, AgentChatSendResult } from './types';

export { failPendingSend } from './chatOrchestrationBridgeSendHelpers';

type CreateTaskResult = Awaited<ReturnType<OrchestrationClient['createTask']>>;
type StartTaskResult = Awaited<ReturnType<OrchestrationClient['startTask']>>;

// ---------------------------------------------------------------------------
// Task creation / linkage
// ---------------------------------------------------------------------------

export async function persistCreatedLink(args: {
  created: CreateTaskResult;
  pending: PreparedSend;
  threadStore: AgentChatThreadStore;
}): Promise<{ link: AgentChatOrchestrationLink; thread: PreparedSend['thread'] }> {
  const link = buildAgentChatOrchestrationLink(args.created.session) ?? {
    taskId: args.created.taskId,
    sessionId: args.created.session?.id,
  };
  const existing = args.pending.thread.latestOrchestration;
  if (existing) inheritExistingLinkFields(link, existing);
  link.routedBy = args.pending.routedBy;
  const thread = await persistThreadLinkage({
    link,
    messageId: args.pending.messageId,
    status: 'submitting',
    thread: args.pending.thread,
    threadStore: args.threadStore,
  });
  return { link, thread };
}

export async function finalizeStartedTask(args: {
  fallbackLink: AgentChatOrchestrationLink;
  linkedThread: PreparedSend['thread'];
  pending: PreparedSend;
  started: StartTaskResult;
  threadStore: AgentChatThreadStore;
}): Promise<AgentChatSendResult> {
  if (!args.started.success || !args.started.session) {
    const failedLink = buildAgentChatOrchestrationLink(args.started.session) ?? args.fallbackLink;
    return failPendingSend({
      error: args.started.error ?? 'Failed to start the orchestration task.',
      link: failedLink,
      messageId: args.pending.messageId,
      thread: args.linkedThread,
      threadStore: args.threadStore,
    });
  }
  const startedLink = buildAgentChatOrchestrationLink(args.started.session) ?? args.fallbackLink;
  const thread = await persistThreadLinkage({
    link: startedLink,
    messageId: args.pending.messageId,
    status: mapOrchestrationStatusToAgentChatStatus(args.started.session.status),
    thread: args.linkedThread,
    threadStore: args.threadStore,
  });
  return buildSendSuccessResult({
    messageId: args.pending.messageId,
    orchestration: startedLink,
    thread,
  });
}

// ---------------------------------------------------------------------------
// Stream context and send core
// ---------------------------------------------------------------------------

export interface BuildStreamContextOptions {
  pending: PreparedSend;
  created: CreateTaskResult & { taskId: string; session: NonNullable<CreateTaskResult['session']> };
  link: AgentChatOrchestrationLink;
  assistantMessageId: string;
  sendStartedAt?: number;
}

export function buildStreamContext({
  pending,
  created,
  link,
  assistantMessageId,
  sendStartedAt,
}: BuildStreamContextOptions): ActiveStreamContext {
  const userPrompt = pending.thread.messages.find((m) => m.role === 'user')?.content;
  return {
    threadId: pending.thread.id,
    assistantMessageId,
    taskId: created.taskId,
    sessionId: created.session.id,
    link,
    accumulatedText: '',
    firstChunkEmitted: false,
    model: pending.taskRequest.model,
    bufferedChunks: [],
    chunkSequence: 0,
    toolsUsed: [],
    accumulatedBlocks: [],
    monitorStartEmitted: false,
    userPrompt: userPrompt?.slice(0, 120),
    streamEnded: false,
    estimatedHistoryTokens: pending.taskRequest.conversationHistory?.reduce(
      (sum, m) => sum + tokenCalibrationStore.calibrate(m.content.length / 4),
      0,
    ),
    sendStartedAt,
    outcomeTraceId: pending.outcomeTraceId ?? undefined,
  };
}

async function startTaskWithCleanup(args: {
  orchestration: OrchestrationClient;
  runtime: AgentChatBridgeRuntime;
  streamCtx: ActiveStreamContext;
  taskId: string;
  et0: number;
}): Promise<StartTaskResult> {
  const { orchestration, runtime, streamCtx, taskId, et0 } = args;
  const et3 = Date.now();
  try {
    const started = await orchestration.startTask(taskId);
    log.info('startTask:', Date.now() - et3, 'ms');
    log.info('total executePendingSend:', Date.now() - et0, 'ms');
    return started;
  } catch (err) {
    stopIncrementalFlush(streamCtx);
    runtime.activeSends.delete(taskId);
    throw err;
  }
}

export async function executePendingSendCore(args: {
  orchestration: OrchestrationClient;
  pending: PreparedSend;
  runtime: AgentChatBridgeRuntime;
  threadStore: AgentChatThreadStore;
  streamCtx: ActiveStreamContext;
  created: CreateTaskResult & { taskId: string; session: NonNullable<CreateTaskResult['session']> };
  linked: { link: AgentChatOrchestrationLink; thread: PreparedSend['thread'] };
  et0: number;
}): Promise<AgentChatSendResult> {
  const { orchestration, runtime, threadStore, streamCtx, created, linked } = args;
  try {
    startIncrementalFlush(runtime, streamCtx);
    const started = await startTaskWithCleanup({
      orchestration,
      runtime,
      streamCtx,
      taskId: created.taskId,
      et0: args.et0,
    });
    if (!started.success) {
      log.error('startTask failed:', started.error);
      stopIncrementalFlush(streamCtx);
      runtime.activeSends.delete(created.taskId);
    }
    return finalizeStartedTask({
      fallbackLink: linked.link,
      linkedThread: linked.thread,
      pending: args.pending,
      started,
      threadStore,
    });
  } catch (err) {
    stopIncrementalFlush(streamCtx);
    runtime.activeSends.delete(created.taskId);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Execute pending send (main entry)
// ---------------------------------------------------------------------------

type ValidCreated = CreateTaskResult & {
  taskId: string;
  session: NonNullable<CreateTaskResult['session']>;
};

type CreateAndLinkResult =
  | { validCreated: ValidCreated; linked: { link: AgentChatOrchestrationLink; thread: PreparedSend['thread'] } }
  | AgentChatSendResult;

async function createAndLinkTask(args: {
  orchestration: OrchestrationClient;
  pending: PreparedSend;
  threadStore: AgentChatThreadStore;
  et0: number;
}): Promise<CreateAndLinkResult> {
  const preSnapshotPromise = captureHeadHash(args.pending.thread.workspaceRoot);
  const et1 = Date.now();
  const created = await args.orchestration.createTask(args.pending.taskRequest);
  log.info('createTask:', Date.now() - et1, 'ms');
  const preSnapshotHash = await preSnapshotPromise;
  log.info('total up to createTask:', Date.now() - args.et0, 'ms');
  if (!created.success || !created.taskId || !created.session) {
    log.error('createTask failed:', created.error);
    return failPendingSend({
      error: created.error ?? 'Failed to create the orchestration task.',
      messageId: args.pending.messageId,
      thread: args.pending.thread,
      threadStore: args.threadStore,
    });
  }
  const et2 = Date.now();
  const linked = await persistCreatedLink({ created, pending: args.pending, threadStore: args.threadStore });
  log.info('persistCreatedLink:', Date.now() - et2, 'ms');
  if (preSnapshotHash) linked.link.preSnapshotHash = preSnapshotHash;
  return { validCreated: created as ValidCreated, linked };
}

async function abortCancelledTask(args: {
  linked: { link: AgentChatOrchestrationLink; thread: PreparedSend['thread'] };
  pending: PreparedSend;
  threadStore: AgentChatThreadStore;
}): Promise<AgentChatSendResult> {
  log.info('pending cancel for thread:', args.pending.thread.id, '— skipping task start');
  await persistThreadLinkage({
    link: args.linked.link,
    messageId: args.pending.messageId,
    status: 'cancelled',
    thread: args.linked.thread,
    threadStore: args.threadStore,
  });
  return { success: false, error: 'Cancelled by user.' };
}

export async function executePendingSend(args: {
  orchestration: OrchestrationClient;
  pending: PreparedSend;
  runtime: AgentChatBridgeRuntime;
  threadStore: AgentChatThreadStore;
}): Promise<AgentChatSendResult> {
  const et0 = Date.now();
  await new Promise<void>((r) => setTimeout(r, 0));

  const result = await createAndLinkTask({
    orchestration: args.orchestration,
    pending: args.pending,
    threadStore: args.threadStore,
    et0,
  });
  if ('success' in result) return result;

  const { validCreated, linked } = result;

  // Pending cancel: user clicked stop while createAndLinkTask was in-flight.
  if (args.runtime.pendingCancels.delete(args.pending.thread.id)) {
    return abortCancelledTask({ linked, pending: args.pending, threadStore: args.threadStore });
  }

  const assistantMessageId = buildAssistantMessageId(validCreated.taskId);
  const streamCtx = buildStreamContext({
    pending: args.pending,
    created: validCreated,
    link: linked.link,
    assistantMessageId,
    sendStartedAt: et0,
  });
  args.runtime.activeSends.set(validCreated.taskId, streamCtx);

  // Signal hooks.ts to suppress lifecycle events until synthetic agent_start fires.
  beginChatSessionLaunch();

  return executePendingSendCore({
    orchestration: args.orchestration,
    pending: args.pending,
    runtime: args.runtime,
    threadStore: args.threadStore,
    streamCtx,
    created: validCreated,
    linked,
    et0,
  });
}
