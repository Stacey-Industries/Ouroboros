import type { OrchestrationStatus, TaskSessionRecord } from '../orchestration/types';
import type { AgentChatMessagePatch, AgentChatThreadStore } from './threadStore';
import type {
  AgentChatMessageRecord,
  AgentChatOrchestrationLink,
  AgentChatSendResult,
  AgentChatThreadRecord,
  AgentChatThreadStatus,
  AgentChatThreadStatusSnapshot,
} from './types';

type AgentChatErrorCode = NonNullable<AgentChatMessageRecord['error']>['code'];

const ORCHESTRATION_STATUS_TO_CHAT_STATUS = new Map<OrchestrationStatus, AgentChatThreadStatus>([
  ['idle', 'idle'],
  ['selecting_context', 'submitting'],
  ['awaiting_provider', 'submitting'],
  ['applying', 'running'],
  ['verifying', 'verifying'],
  ['needs_review', 'needs_review'],
  ['complete', 'complete'],
  ['failed', 'failed'],
  ['cancelled', 'cancelled'],
  ['paused', 'running'],
]);

function findMessage(
  thread: AgentChatThreadRecord,
  messageId: string,
): AgentChatMessageRecord | undefined {
  return thread.messages.find((message) => message.id === messageId);
}

function buildError(message: string, code: AgentChatErrorCode): AgentChatMessageRecord['error'] {
  return {
    code,
    message,
    recoverable: code !== 'thread_not_found',
  };
}

export function mapOrchestrationStatusToAgentChatStatus(
  status: OrchestrationStatus,
): AgentChatThreadStatus {
  return ORCHESTRATION_STATUS_TO_CHAT_STATUS.get(status) ?? 'idle';
}

function extractProviderSessionIds(session: TaskSessionRecord): {
  claudeSessionId?: string;
  codexThreadId?: string;
} {
  const provider = session.providerSession?.provider;
  const sessionId = session.providerSession?.sessionId;
  return {
    claudeSessionId: provider === 'claude-code' ? sessionId : undefined,
    codexThreadId: provider === 'codex' ? sessionId : undefined,
  };
}

export function buildAgentChatOrchestrationLink(
  session: TaskSessionRecord | null | undefined,
): AgentChatOrchestrationLink | undefined {
  if (!session) return undefined;

  const providerIds = extractProviderSessionIds(session);
  return {
    taskId: session.taskId,
    sessionId: session.id,
    attemptId: session.attempts.at(-1)?.id ?? session.latestResult?.attemptId,
    provider: session.providerSession?.provider ?? session.request.provider,
    ...providerIds,
    model: session.request.model,
    linkedTerminalId: session.providerSession?.linkedTerminalId,
  };
}

export function buildThreadStatusSnapshot(
  thread: AgentChatThreadRecord,
  latestMessageId?: string,
): AgentChatThreadStatusSnapshot {
  return {
    threadId: thread.id,
    workspaceRoot: thread.workspaceRoot,
    status: thread.status,
    latestMessageId,
    latestOrchestration: thread.latestOrchestration,
    updatedAt: thread.updatedAt,
  };
}

export async function persistThreadLinkage(args: {
  error?: AgentChatMessageRecord['error'];
  link?: AgentChatOrchestrationLink;
  messageId: string;
  status: AgentChatThreadStatus;
  thread: AgentChatThreadRecord;
  threadStore: AgentChatThreadStore;
}): Promise<AgentChatThreadRecord> {
  const patch: AgentChatMessagePatch = {};
  if (Object.prototype.hasOwnProperty.call(args, 'link')) patch.orchestration = args.link;
  if (Object.prototype.hasOwnProperty.call(args, 'error')) patch.error = args.error;

  let nextThread = args.thread;
  if (Object.keys(patch).length > 0) {
    nextThread = await args.threadStore.updateMessage(args.thread.id, args.messageId, patch);
  }

  return args.threadStore.updateThread(nextThread.id, {
    status: args.status,
    latestOrchestration: Object.prototype.hasOwnProperty.call(args, 'link')
      ? args.link
      : nextThread.latestOrchestration,
  });
}

export function buildSendFailureResult(args: {
  error: string;
  messageId?: string;
  orchestration?: AgentChatOrchestrationLink;
  thread?: AgentChatThreadRecord;
}): AgentChatSendResult {
  return {
    success: false,
    error: args.error,
    thread: args.thread,
    message: args.thread && args.messageId ? findMessage(args.thread, args.messageId) : undefined,
    status:
      args.thread && args.messageId
        ? buildThreadStatusSnapshot(args.thread, args.messageId)
        : undefined,
    orchestration: args.orchestration,
  };
}

export function buildSendSuccessResult(args: {
  messageId: string;
  orchestration: AgentChatOrchestrationLink;
  thread: AgentChatThreadRecord;
}): AgentChatSendResult {
  return {
    success: true,
    thread: args.thread,
    message: findMessage(args.thread, args.messageId),
    status: buildThreadStatusSnapshot(args.thread, args.messageId),
    orchestration: args.orchestration,
  };
}

export function createOrchestrationFailure(message: string): AgentChatMessageRecord['error'] {
  return buildError(message, 'orchestration_failed');
}

/**
 * Derive a deterministic assistant message ID from the orchestration session ID.
 * Must match the scheme in eventProjectorSupport.buildProjectedMessageId so that
 * when the session-update projector runs after the bridge has already written the
 * streaming message, upsertProjectedMessage finds it by ID and updates in-place
 * rather than appending a duplicate.
 */
export function buildAssistantMessageId(_createId: () => string, sessionId: string): string {
  return `agent-chat:${sessionId}:assistant`;
}

export function buildThreadWithAssistantMessage(
  thread: AgentChatThreadRecord,
  message: AgentChatMessageRecord,
): AgentChatThreadRecord {
  const existingIndex = thread.messages.findIndex((m) => m.id === message.id);
  const messages =
    existingIndex >= 0
      ? [
          ...thread.messages.slice(0, existingIndex),
          message,
          ...thread.messages.slice(existingIndex + 1),
        ]
      : [...thread.messages, message];

  return {
    ...thread,
    messages,
    updatedAt: Math.max(thread.updatedAt, message.createdAt),
  };
}
