import crypto from 'node:crypto';

import type { AgentChatSendMessageRequest } from '@shared/types/agentChat';
import type { TurnId } from '@shared/types/canonicalChatEvent';

import { captureHeadHash } from './chatOrchestrationBridgeGit';
import {
  preparePendingSend,
  resolveSendOptions,
  validateSendRequest,
} from './chatOrchestrationRequestSupport';
import {
  defaultDispatchProvider,
  finalizeActiveSend,
  handleCoordinatorProgress,
} from './chatSendCoordinatorDispatch';
import type { DispatchProvider, SubmitSendDeps } from './chatSendCoordinatorSupport';
import {
  buildSettings,
  createActiveSendRecord,
  createThreadStore,
  ensureFallbackThread,
  findPreviousAssistantMessage,
  registerActiveSend,
  removeActiveSend,
  resolveCommandPayload,
} from './chatSendCoordinatorSupport';

function mintTurnId(): TurnId {
  return crypto.randomUUID() as TurnId;
}

async function buildPendingSend(
  request: AgentChatSendMessageRequest,
  deps: SubmitSendDeps,
  threadStore: ReturnType<typeof createThreadStore>,
) {
  const settings = deps.getSettings?.() ?? buildSettings();
  const previousAssistantMessage = await findPreviousAssistantMessage(
    threadStore,
    request.threadId,
  );
  const resolved = resolveSendOptions(settings, request, previousAssistantMessage);
  const pending = await preparePendingSend({
    content: request.content.trim(),
    createId: deps.createId ?? crypto.randomUUID,
    now: deps.now ?? Date.now,
    request,
    resolved,
    threadStore,
  });
  return { pending, resolved, settings };
}

async function prepareSubmission(request: AgentChatSendMessageRequest, deps: SubmitSendDeps) {
  if (!deps.threadStore) ensureFallbackThread(request);
  const threadStore = createThreadStore(deps.threadStore);
  const { pending, resolved, settings } = await buildPendingSend(request, deps, threadStore);
  const turnId = mintTurnId();
  const threadId = pending.thread.id as import('@shared/types/canonicalChatEvent').ThreadId;
  const preSnapshotHash = (await captureHeadHash(pending.thread.workspaceRoot)) ?? null;
  const commandPayload = resolveCommandPayload({
    preSnapshotHash,
    request,
    resolved,
    settings,
    threadId,
  });
  return {
    commandPayload,
    pending,
    record: createActiveSendRecord({
      broadcaster: deps.broadcaster,
      commandPayload,
      messageId: pending.messageId,
      normalizer: deps.normalizer,
      persistence: deps.persistence,
      registry: deps.registry,
      turnId,
    }),
    threadId,
    turnId,
  };
}

async function startDispatch(args: {
  commandPayload: ReturnType<typeof resolveCommandPayload>;
  deps: SubmitSendDeps;
  dispatchProvider: DispatchProvider;
  record: ReturnType<typeof createActiveSendRecord>;
  taskRequest: import('../orchestration/types').TaskRequest;
}) {
  const handle = await args.dispatchProvider({
    taskRequest: args.taskRequest,
    threadId: args.commandPayload.threadId,
    turnId: args.record.turnId,
    onProgress: (progress) => handleCoordinatorProgress(args.record, progress),
    onTerminal: (kind, message) => {
      finalizeActiveSend(args.record, kind, message);
    },
  });
  args.record.kill = handle.kill;
  args.record.dispatch({
    type: 'turn_started',
    threadId: args.record.threadId,
    turnId: args.record.turnId,
    ts: Date.now(),
    seq: 0,
  });
}

export async function submitSend(
  request: AgentChatSendMessageRequest,
  deps: SubmitSendDeps,
): Promise<{ success: boolean; error?: string; turnId?: TurnId; threadId?: string }> {
  const validationError = validateSendRequest(request);
  if (validationError) return { success: false, error: validationError };
  const { commandPayload, pending, record, threadId, turnId } = await prepareSubmission(
    request,
    deps,
  );
  registerActiveSend(record);
  try {
    await startDispatch({
      commandPayload,
      deps,
      dispatchProvider: deps.dispatchProvider ?? defaultDispatchProvider,
      record,
      taskRequest: pending.taskRequest,
    });
    return { success: true, turnId, threadId };
  } catch (error) {
    removeActiveSend(turnId);
    finalizeActiveSend(record, 'failed', error instanceof Error ? error.message : String(error));
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      turnId,
      threadId,
    };
  }
}

export async function cancelTurn(turnId: string): Promise<{ success: boolean; error?: string }> {
  const record = removeActiveSend(turnId as TurnId);
  if (!record) return { success: false, error: `Active turn not found: ${turnId}` };
  try {
    await record.kill();
    finalizeActiveSend(record, 'cancelled');
    return { success: true };
  } catch (error) {
    registerActiveSend(record);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
