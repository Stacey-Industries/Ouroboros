import type { TaskSessionRecord } from '../orchestration/types';
import {
  buildAgentChatOrchestrationLink,
  mapOrchestrationStatusToAgentChatStatus,
} from './chatOrchestrationBridgeSupport';
import {
  buildProjectedMessages,
  linksEqual,
  messagePatchFromRecord,
  toComparableMessage,
} from './eventProjectorSupport';
import { type AgentChatThreadStore } from './threadStore';
import type {
  AgentChatMessageRecord,
  AgentChatOrchestrationLink,
  AgentChatThreadRecord,
} from './types';

export interface AgentChatSessionProjectionResult {
  changed: boolean;
  changedMessages: AgentChatMessageRecord[];
  latestMessageId?: string;
  thread: AgentChatThreadRecord;
}

/** Resolve content for projected messages, preserving bridge-written assistant content. */
function resolveProjectedContent(
  existing: AgentChatMessageRecord,
  incoming: AgentChatMessageRecord,
): string {
  if (existing.role === 'assistant' && existing.content && existing.content !== '(No response)') {
    return existing.content;
  }
  return incoming.content;
}

async function updateExistingProjectedMessage(args: {
  existing: AgentChatMessageRecord;
  message: AgentChatMessageRecord;
  thread: AgentChatThreadRecord;
  threadStore: AgentChatThreadStore;
}): Promise<{ changed: boolean; message: AgentChatMessageRecord; thread: AgentChatThreadRecord }> {
  const nextMessage = {
    ...args.message,
    createdAt: args.existing.createdAt,
    content: resolveProjectedContent(args.existing, args.message),
  };
  if (
    JSON.stringify(toComparableMessage(args.existing)) ===
    JSON.stringify(toComparableMessage(nextMessage))
  ) {
    return { changed: false, message: args.existing, thread: args.thread };
  }

  const thread = await args.threadStore.updateMessage(
    args.thread.id,
    args.existing.id,
    messagePatchFromRecord(nextMessage),
  );
  return {
    changed: true,
    message: thread.messages.find((entry) => entry.id === args.existing.id) ?? nextMessage,
    thread,
  };
}

async function upsertProjectedMessage(args: {
  message: AgentChatMessageRecord;
  thread: AgentChatThreadRecord;
  threadStore: AgentChatThreadStore;
}): Promise<{
  changed: boolean;
  message: AgentChatMessageRecord;
  thread: AgentChatThreadRecord;
}> {
  const existing = args.thread.messages.find((entry) => entry.id === args.message.id);
  if (existing) {
    return updateExistingProjectedMessage({ existing, ...args });
  }

  const thread = await args.threadStore.appendMessage(args.thread.id, args.message);
  return {
    changed: true,
    message: thread.messages.find((entry) => entry.id === args.message.id) ?? args.message,
    thread,
  };
}

/** Preserve sticky fields from existing thread link when the session update doesn't carry them. */
function applyStickyLinkFields(
  link: AgentChatOrchestrationLink,
  existing: AgentChatOrchestrationLink | undefined,
): void {
  if (!existing) return;
  const stickyFields: Array<keyof AgentChatOrchestrationLink> = [
    'provider',
    'linkedTerminalId',
    'claudeSessionId',
    'codexThreadId',
    'model',
    'effort',
  ];
  for (const field of stickyFields) {
    // eslint-disable-next-line security/detect-object-injection -- field from static array
    if (!link[field] && existing[field]) {
      // eslint-disable-next-line security/detect-object-injection -- field from static array
      (link as Record<string, unknown>)[field] = existing[field];
    }
  }
}

async function syncThreadMetadata(args: {
  session: TaskSessionRecord;
  thread: AgentChatThreadRecord;
  threadStore: AgentChatThreadStore;
}): Promise<{ changed: boolean; thread: AgentChatThreadRecord }> {
  const link = buildAgentChatOrchestrationLink(args.session);
  const nextStatus = mapOrchestrationStatusToAgentChatStatus(args.session.status);

  if (link) {
    applyStickyLinkFields(link, args.thread.latestOrchestration);
  }

  if (args.thread.status === nextStatus && linksEqual(args.thread.latestOrchestration, link)) {
    return { changed: false, thread: args.thread };
  }

  return {
    changed: true,
    thread: await args.threadStore.updateThread(args.thread.id, {
      status: nextStatus,
      latestOrchestration: link,
    }),
  };
}

async function projectMessagesToThread(args: {
  messages: AgentChatMessageRecord[];
  thread: AgentChatThreadRecord;
  threadStore: AgentChatThreadStore;
}): Promise<{
  changed: boolean;
  changedMessages: AgentChatMessageRecord[];
  thread: AgentChatThreadRecord;
}> {
  let thread = args.thread;
  const changedMessages: AgentChatMessageRecord[] = [];

  for (const message of args.messages) {
    const result = await upsertProjectedMessage({
      message,
      thread,
      threadStore: args.threadStore,
    });
    thread = result.thread;
    if (result.changed) {
      changedMessages.push(result.message);
    }
  }

  return {
    changed: changedMessages.length > 0,
    changedMessages,
    thread,
  };
}

export async function projectAgentChatSession(args: {
  session: TaskSessionRecord;
  thread: AgentChatThreadRecord;
  threadStore: AgentChatThreadStore;
}): Promise<AgentChatSessionProjectionResult> {
  const metadata = await syncThreadMetadata(args);
  const messages = await projectMessagesToThread({
    messages: buildProjectedMessages(args.session, metadata.thread.id),
    thread: metadata.thread,
    threadStore: args.threadStore,
  });

  // Auto-title: update thread title from first assistant response
  let { thread } = messages;
  const firstAssistantChanged = messages.changedMessages.find(
    (m) => m.role === 'assistant' && m.content.trim(),
  );
  if (firstAssistantChanged) {
    const updated = await args.threadStore.updateTitleFromResponse(
      thread.id,
      firstAssistantChanged.content,
    );
    if (updated) {
      thread = updated;
    }
  }

  return {
    changed: metadata.changed || messages.changed,
    changedMessages: messages.changedMessages,
    latestMessageId: messages.changedMessages.at(-1)?.id ?? thread.messages.at(-1)?.id,
    thread,
  };
}
