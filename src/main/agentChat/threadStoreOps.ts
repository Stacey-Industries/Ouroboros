/**
 * threadStoreOps.ts — Wave 23 Phase D
 *
 * Mutation helpers extracted from threadStore.ts to keep that file under the
 * 300-line ESLint limit. These functions operate over the SQLite runtime
 * directly and are imported back into threadStore.ts.
 */

import type { ThreadStoreSqliteRuntime } from './threadStoreSqlite';
import type { AgentChatMessagePatch, AgentChatThreadPatch } from './threadStoreSupport';
import { upsertMessage } from './threadStoreSupport';
import type { AgentChatMessageRecord, AgentChatThreadRecord } from './types';

// ── updateThreadRecord ────────────────────────────────────────────────────────

export async function updateThreadRecord(args: {
  now: () => number;
  patch: AgentChatThreadPatch;
  runtime: ThreadStoreSqliteRuntime;
  threadId: string;
}): Promise<AgentChatThreadRecord> {
  // Use targeted SQL UPDATE for thread metadata to avoid the race condition
  // where a full writeThread (DELETE all messages + INSERT) could lose messages
  // that were concurrently appended by another operation.
  const sqlPatch: {
    title?: string;
    status?: string;
    latestOrchestration?: unknown;
    updatedAt: number;
  } = { updatedAt: args.now() };

  if (Object.prototype.hasOwnProperty.call(args.patch, 'title') && args.patch.title !== undefined) {
    sqlPatch.title = args.patch.title;
  }
  if (args.patch.status !== undefined) {
    sqlPatch.status = args.patch.status;
  }
  if (Object.prototype.hasOwnProperty.call(args.patch, 'latestOrchestration')) {
    sqlPatch.latestOrchestration = args.patch.latestOrchestration;
  }

  const result = await args.runtime.updateThreadMetadataOnly(args.threadId, sqlPatch);
  if (result) return result;

  // Fallback: if the targeted update fails (thread not found), use full write
  const thread = await args.runtime.requireThread(args.threadId);
  return args.runtime.writeThread({
    ...thread,
    title: Object.prototype.hasOwnProperty.call(args.patch, 'title')
      ? (args.patch.title ?? thread.title)
      : thread.title,
    status: args.patch.status ?? thread.status,
    latestOrchestration: Object.prototype.hasOwnProperty.call(args.patch, 'latestOrchestration')
      ? args.patch.latestOrchestration
      : thread.latestOrchestration,
    updatedAt: args.now(),
  });
}

// ── updateThreadMessage ───────────────────────────────────────────────────────

export async function updateThreadMessage(args: {
  messageId?: string;
  messagePatch: AgentChatMessagePatch | AgentChatMessageRecord;
  now: () => number;
  runtime: ThreadStoreSqliteRuntime;
  threadId: string;
}): Promise<AgentChatThreadRecord> {
  const thread = await args.runtime.requireThread(args.threadId);
  const existingMessage = args.messageId
    ? thread.messages.find((message) => message.id === args.messageId)
    : undefined;

  if (args.messageId && !existingMessage) {
    throw new Error(`Chat message not found: ${args.messageId}`);
  }

  return args.runtime.writeThread({
    ...thread,
    messages: upsertMessage({
      message: existingMessage
        ? {
            ...existingMessage,
            ...args.messagePatch,
          }
        : (args.messagePatch as AgentChatMessageRecord),
      messages: thread.messages,
      now: args.now,
      threadId: thread.id,
    }),
    updatedAt: args.now(),
  });
}

// ── appendMessageToThread ─────────────────────────────────────────────────────

export async function appendMessageToThread(args: {
  now: () => number;
  runtime: ThreadStoreSqliteRuntime;
  threadId: string;
  message: AgentChatMessageRecord;
}): Promise<AgentChatThreadRecord> {
  const thread = await args.runtime.requireThread(args.threadId);
  const normalizedMsg: AgentChatMessageRecord = {
    ...args.message,
    threadId: thread.id,
    createdAt: args.message.createdAt || args.now(),
  };
  const updatedThread: AgentChatThreadRecord = {
    ...thread,
    messages: [...thread.messages, normalizedMsg],
    updatedAt: args.now(),
  };
  await args.runtime.appendSingleMessage(updatedThread, normalizedMsg);
  return updatedThread;
}
