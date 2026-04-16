/**
 * mergeSideChat.ts — Wave 23 Phase D
 *
 * Appends a system-role summary message from a side chat into the main thread.
 * Pure logic over a ThreadStoreLike adaptor for testability.
 */

import { randomUUID } from 'crypto';

import type { AgentChatMessageRecord, AgentChatThreadRecord } from './types';

// ── Adaptor interface ─────────────────────────────────────────────────────────

export interface ThreadStoreLike {
  requireThread: (id: string) => Promise<AgentChatThreadRecord>;
  appendSingleMessage: (
    thread: AgentChatThreadRecord,
    message: AgentChatMessageRecord,
  ) => Promise<void>;
  readThread: (id: string) => Promise<AgentChatThreadRecord | null>;
}

// ── Params & result ───────────────────────────────────────────────────────────

export interface MergeSideChatParams {
  sideChatId: string;
  mainThreadId: string;
  summary: string;
  includeMessageIds?: string[];
}

export interface MergeSideChatResult {
  success: boolean;
  systemMessageId?: string;
  error?: string;
}

// ── Format helpers ────────────────────────────────────────────────────────────

function buildBranchLabel(sideChatThread: AgentChatThreadRecord): string {
  return sideChatThread.branchName ?? sideChatThread.title;
}

function buildIncludedSection(
  messages: AgentChatMessageRecord[],
  includeIds: string[],
): string {
  const selected = messages.filter((m) => includeIds.includes(m.id));
  if (selected.length === 0) return '';

  const lines = selected.map((m) => {
    const roleLabel = m.role === 'assistant' ? 'Assistant' : 'User';
    const preview = m.content.slice(0, 500);
    return `**${roleLabel}:** ${preview}`;
  });

  return `\n\n### Included messages\n\n${lines.join('\n\n')}`;
}

function buildSummaryContent(
  sideChatThread: AgentChatThreadRecord,
  summary: string,
  includeMessageIds: string[] | undefined,
): string {
  const branchLabel = buildBranchLabel(sideChatThread);
  let content = `## Side chat summary (from ${branchLabel})\n\n${summary}`;

  if (includeMessageIds && includeMessageIds.length > 0) {
    content += buildIncludedSection(sideChatThread.messages, includeMessageIds);
  }

  return content;
}

// ── Core implementation ───────────────────────────────────────────────────────

export async function mergeSideChatIntoMain(
  params: MergeSideChatParams,
  store: ThreadStoreLike,
  deps: { createId?: () => string; now?: () => number } = {},
): Promise<MergeSideChatResult> {
  const { sideChatId, mainThreadId, summary, includeMessageIds } = params;
  const createId = deps.createId ?? randomUUID;
  const now = deps.now ?? Date.now;

  const [sideChat, mainThread] = await Promise.all([
    store.requireThread(sideChatId),
    store.requireThread(mainThreadId),
  ]);

  const content = buildSummaryContent(sideChat, summary, includeMessageIds);

  const newMessageId = createId();
  const message: AgentChatMessageRecord = {
    id: newMessageId,
    threadId: mainThread.id,
    role: 'system',
    content,
    createdAt: now(),
  };

  const updatedThread: AgentChatThreadRecord = {
    ...mainThread,
    messages: [...mainThread.messages, message],
    updatedAt: now(),
  };

  await store.appendSingleMessage(updatedThread, message);

  return { success: true, systemMessageId: newMessageId };
}
