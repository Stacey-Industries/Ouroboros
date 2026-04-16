/**
 * threadStoreRerun.ts — Wave 22 Phase F
 *
 * Re-run-from-message logic extracted from threadStore.ts to stay within the
 * 300-line and 40-line-per-function ESLint limits.
 */
import type { ThreadStoreSqliteRuntime } from './threadStoreSqlite';
import type { AgentChatBranchInfo, AgentChatMessageRecord, AgentChatThreadRecord } from './types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function findUserMessageIndex(
  messages: AgentChatMessageRecord[],
  anchorIdx: number,
): number {
  // Walk backwards from anchor to find the nearest user message.
  for (let i = anchorIdx - 1; i >= 0; i--) {
    const msg = messages.at(i);
    if (msg?.role === 'user') return i;
  }
  // If anchorIdx itself is a user message, use it.
  const anchor = messages.at(anchorIdx);
  if (anchor?.role === 'user') return anchorIdx;
  return -1;
}

function buildRerunTitle(sourceTitle: string): string {
  const prefix = 'Re-run of ';
  if (sourceTitle.startsWith(prefix)) return sourceTitle;
  return `${prefix}${sourceTitle}`;
}

function buildBranchInfo(
  source: AgentChatThreadRecord,
  userMsg: AgentChatMessageRecord,
  userIdx: number,
): AgentChatBranchInfo {
  return {
    parentThreadId: source.id,
    parentTitle: source.title,
    fromMessageId: userMsg.id,
    fromMessageIndex: userIdx + 1,
    fromMessagePreview: userMsg.content?.slice(0, 120) ?? '',
  };
}

function sliceBranchMessages(
  messages: AgentChatMessageRecord[],
  beforeIdx: number,
  newThreadId: string,
): AgentChatMessageRecord[] {
  if (beforeIdx < 0) return [];
  return messages.slice(0, beforeIdx + 1).map((m) => ({ ...m, threadId: newThreadId }));
}

// ── branchThreadFrom ──────────────────────────────────────────────────────────

function buildBranchTitle(sourceTitle: string): string {
  return sourceTitle.startsWith('Branch of ') ? sourceTitle : `Branch of ${sourceTitle}`;
}

export async function branchThreadFrom(args: {
  createId: () => string;
  now: () => number;
  runtime: ThreadStoreSqliteRuntime;
  threadId: string;
  fromMessageId: string;
}): Promise<AgentChatThreadRecord> {
  const sourceThread = await args.runtime.requireThread(args.threadId);
  const idx = sourceThread.messages.findIndex((m) => m.id === args.fromMessageId);
  if (idx === -1) throw new Error(`Message not found: ${args.fromMessageId}`);

  const timestamp = args.now();
  const newId = args.createId();
  const fromMsg = sourceThread.messages.at(idx);
  if (!fromMsg) throw new Error('Branch message index out of bounds.');

  return args.runtime.writeThread({
    version: 1,
    id: newId,
    workspaceRoot: sourceThread.workspaceRoot,
    createdAt: timestamp,
    updatedAt: timestamp,
    title: buildBranchTitle(sourceThread.title),
    status: 'idle',
    messages: sourceThread.messages.slice(0, idx + 1).map((m) => ({ ...m, threadId: newId })),
    latestOrchestration: undefined,
    branchInfo: {
      parentThreadId: sourceThread.id,
      parentTitle: sourceThread.title,
      fromMessageId: fromMsg.id,
      fromMessageIndex: idx + 1,
      fromMessagePreview: fromMsg.content?.slice(0, 120) ?? '',
    },
  });
}

// ── reRunFromMessageImpl ──────────────────────────────────────────────────────

export async function reRunFromMessageImpl(args: {
  createId: () => string;
  now: () => number;
  runtime: ThreadStoreSqliteRuntime;
  threadId: string;
  messageId: string;
}): Promise<{ branch: AgentChatThreadRecord; userMessage: AgentChatMessageRecord }> {
  const source = await args.runtime.requireThread(args.threadId);
  const anchorIdx = source.messages.findIndex((m) => m.id === args.messageId);
  if (anchorIdx === -1) throw new Error(`Message not found: ${args.messageId}`);

  const userIdx = findUserMessageIndex(source.messages, anchorIdx);
  if (userIdx === -1) throw new Error('No preceding user message found before this message.');

  const userMsg = source.messages.at(userIdx);
  if (!userMsg) throw new Error('User message index out of bounds.');

  const newId = args.createId();
  const timestamp = args.now();
  const branchMessages = sliceBranchMessages(source.messages, userIdx - 1, newId);

  const branch = await args.runtime.writeThread({
    version: 1,
    id: newId,
    workspaceRoot: source.workspaceRoot,
    createdAt: timestamp,
    updatedAt: timestamp,
    title: buildRerunTitle(source.title),
    status: 'idle',
    messages: branchMessages,
    latestOrchestration: undefined,
    branchInfo: buildBranchInfo(source, userMsg, userIdx),
  });

  return { branch, userMessage: { ...userMsg, threadId: newId } };
}
