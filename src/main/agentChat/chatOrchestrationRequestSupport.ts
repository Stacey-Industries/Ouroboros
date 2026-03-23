import type { ResolvedSendOptions } from './chatOrchestrationRequestSupportHelpers';
import {
  buildContextSummary,
  buildResolvedOptions,
  buildTaskRequest,
} from './chatOrchestrationRequestSupportHelpers';
import { buildThreadTitle } from './chatTitleDerivation';
import type { ResolvedAgentChatSettings } from './settingsResolver';
import type { AgentChatThreadStore } from './threadStore';
import { isNonEmptyString } from './threadStoreSupport';
import type {
  AgentChatMessageRecord,
  AgentChatSendMessageRequest,
  AgentChatThreadRecord,
} from './types';

export type { ResolvedSendOptions } from './chatOrchestrationRequestSupportHelpers';
export { normalizeContextSelection } from './chatOrchestrationRequestSupportHelpers';
export { deriveSmartTitle, generateLlmTitle } from './chatTitleDerivation';

export interface PreparedSend {
  messageId: string;
  requestedAt: number;
  taskRequest: import('../orchestration/types').TaskRequest;
  thread: AgentChatThreadRecord;
}

// ---------------------------------------------------------------------------
// User message builder
// ---------------------------------------------------------------------------

function createUserMessage(args: {
  content: string;
  messageId: string;
  request: AgentChatSendMessageRequest;
  requestedAt: number;
  threadId: string;
}): AgentChatMessageRecord {
  const attachmentNames = args.request.attachments?.map((a) => a.name).join(', ');
  const content = attachmentNames
    ? args.content
      ? `${args.content}\n[Attached: ${attachmentNames}]`
      : `[Attached: ${attachmentNames}]`
    : args.content;
  return {
    id: args.messageId,
    threadId: args.threadId,
    role: 'user',
    content,
    createdAt: args.requestedAt,
    contextSummary: buildContextSummary(
      args.request.contextSelection,
      Boolean(args.request.metadata?.usedAdvancedControls),
    ),
  };
}

// ---------------------------------------------------------------------------
// Thread resolution
// ---------------------------------------------------------------------------

async function resolveThreadForSend(args: {
  content: string;
  request: AgentChatSendMessageRequest;
  threadStore: AgentChatThreadStore;
}): Promise<AgentChatThreadRecord> {
  const { content, request, threadStore } = args;
  if (isNonEmptyString(request.threadId)) {
    const thread = await threadStore.loadThread(request.threadId);
    if (!thread) throw new Error(`Chat thread not found: ${request.threadId}`);
    if (thread.workspaceRoot !== request.workspaceRoot) {
      throw new Error(
        `Chat thread ${request.threadId} does not belong to ${request.workspaceRoot}`,
      );
    }
    return thread;
  }
  return threadStore.createThread({
    workspaceRoot: request.workspaceRoot,
    title: buildThreadTitle(content),
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function resolveSendOptions(
  settings: ResolvedAgentChatSettings,
  request: AgentChatSendMessageRequest,
): ResolvedSendOptions {
  const provider = request.overrides?.provider ?? settings.defaultProvider;
  return buildResolvedOptions(settings, provider, request.overrides);
}

export async function preparePendingSend(args: {
  content: string;
  createId: () => string;
  now: () => number;
  request: AgentChatSendMessageRequest;
  resolved: ResolvedSendOptions;
  threadStore: AgentChatThreadStore;
}): Promise<PreparedSend> {
  const requestedAt = args.now();
  let thread = await resolveThreadForSend({
    content: args.content,
    request: args.request,
    threadStore: args.threadStore,
  });
  const messageId = args.createId();
  const message = createUserMessage({
    content: args.content,
    messageId,
    request: args.request,
    requestedAt,
    threadId: thread.id,
  });
  thread = await args.threadStore.appendMessage(thread.id, message);
  thread = await args.threadStore.updateThread(thread.id, { status: 'submitting' });
  return {
    messageId,
    requestedAt,
    taskRequest: buildTaskRequest({
      content: args.content,
      request: args.request,
      requestedAt,
      resolved: args.resolved,
      thread,
    }),
    thread,
  };
}

export function validateSendRequest(request: AgentChatSendMessageRequest): string | null {
  if (!isNonEmptyString(request.workspaceRoot))
    return 'A workspace root is required to send a chat message.';
  if (!isNonEmptyString(request.content) && !request.attachments?.length)
    return 'Cannot send an empty chat message.';
  if (request.attachments) {
    const MAX_SIZE = 5 * 1024 * 1024;
    for (const att of request.attachments) {
      if (att.sizeBytes > MAX_SIZE) return `Attachment "${att.name}" exceeds the 5 MB limit.`;
    }
    if (request.attachments.length > 5) return 'You can attach at most 5 images per message.';
  }
  return null;
}
