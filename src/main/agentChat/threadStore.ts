import { randomUUID } from 'crypto';
import { app } from 'electron';
import * as path from 'path';

import { ThreadStoreSqliteRuntime } from './threadStoreSqlite';
import {
  DEFAULT_THREAD_TITLE,
  isNonEmptyString,
  normalizeLink,
  normalizeMessages,
  upsertMessage,
} from './threadStoreSupport';
import type {
  AgentChatCreateThreadRequest,
  AgentChatMessageRecord,
  AgentChatOrchestrationLink,
  AgentChatThreadRecord,
  AgentChatThreadStatus,
} from './types';

export const DEFAULT_AGENT_CHAT_THREAD_STORE_DIR = path.join(
  app.getPath('userData'),
  'agent-chat',
  'threads',
);

const DEFAULT_MAX_AGENT_CHAT_THREADS = 100;

export interface CreateAgentChatThreadOptions {
  status?: AgentChatThreadStatus;
  messages?: AgentChatMessageRecord[];
  latestOrchestration?: AgentChatOrchestrationLink;
}

export interface AgentChatThreadPatch {
  title?: string;
  status?: AgentChatThreadStatus;
  latestOrchestration?: AgentChatOrchestrationLink;
}

export type AgentChatMessagePatch = Partial<
  Omit<AgentChatMessageRecord, 'id' | 'threadId' | 'createdAt'>
>;

export interface AgentChatThreadStoreOptions {
  createId?: () => string;
  maxThreads?: number;
  now?: () => number;
  threadsDir?: string;
}

export interface AgentChatThreadStore {
  createThread: (
    request: AgentChatCreateThreadRequest,
    options?: CreateAgentChatThreadOptions,
  ) => Promise<AgentChatThreadRecord>;
  deleteThread: (threadId: string) => Promise<boolean>;
  loadThread: (threadId: string) => Promise<AgentChatThreadRecord | null>;
  listThreads: (workspaceRoot?: string) => Promise<AgentChatThreadRecord[]>;
  loadLatestThread: (workspaceRoot?: string) => Promise<AgentChatThreadRecord | null>;
  updateThread: (threadId: string, patch: AgentChatThreadPatch) => Promise<AgentChatThreadRecord>;
  appendMessage: (
    threadId: string,
    message: AgentChatMessageRecord,
  ) => Promise<AgentChatThreadRecord>;
  updateMessage: (
    threadId: string,
    messageId: string,
    patch: AgentChatMessagePatch,
  ) => Promise<AgentChatThreadRecord>;
  updateTitleFromResponse: (
    threadId: string,
    assistantContent: string,
  ) => Promise<AgentChatThreadRecord | null>;
  branchThread: (threadId: string, fromMessageId: string) => Promise<AgentChatThreadRecord>;
  getStorageDirectory: () => string;
}

function buildThreadRecord(args: {
  createId: () => string;
  createOptions: CreateAgentChatThreadOptions;
  now: () => number;
  request: AgentChatCreateThreadRequest;
}): AgentChatThreadRecord {
  const timestamp = args.now();
  const threadId = args.createId();

  return {
    version: 1,
    id: threadId,
    workspaceRoot: args.request.workspaceRoot.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
    title: isNonEmptyString(args.request.title) ? args.request.title.trim() : DEFAULT_THREAD_TITLE,
    status: args.createOptions.status ?? 'idle',
    messages: normalizeMessages(args.createOptions.messages, args.now, threadId),
    latestOrchestration: normalizeLink(args.createOptions.latestOrchestration),
  };
}

async function updateThreadRecord(args: {
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

async function updateThreadMessage(args: {
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

function createThreadMethod(args: {
  createId: () => string;
  now: () => number;
  runtime: ThreadStoreSqliteRuntime;
}): AgentChatThreadStore['createThread'] {
  return async (request, createOptions = {}) =>
    args.runtime.runMutation(async () => {
      if (!isNonEmptyString(request.workspaceRoot)) {
        throw new Error('Workspace root is required to create a chat thread');
      }

      return args.runtime.writeThread(
        buildThreadRecord({
          createId: args.createId,
          createOptions,
          now: args.now,
          request,
        }),
      );
    });
}

async function listThreadRecords(
  runtime: ThreadStoreSqliteRuntime,
  workspaceRoot?: string,
): Promise<AgentChatThreadRecord[]> {
  const threads = await runtime.loadAllThreads();
  if (!isNonEmptyString(workspaceRoot)) return threads;
  return threads.filter((thread) => thread.workspaceRoot === workspaceRoot);
}

async function loadLatestThreadRecord(
  runtime: ThreadStoreSqliteRuntime,
  workspaceRoot?: string,
): Promise<AgentChatThreadRecord | null> {
  const threads = await listThreadRecords(runtime, workspaceRoot);
  return threads[0] ?? null;
}

async function appendMessageToThread(args: {
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

async function branchThreadFrom(args: {
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
  const title = sourceThread.title.startsWith('Branch of ')
    ? sourceThread.title
    : `Branch of ${sourceThread.title}`;

  return args.runtime.writeThread({
    version: 1,
    id: newId,
    workspaceRoot: sourceThread.workspaceRoot,
    createdAt: timestamp,
    updatedAt: timestamp,
    title,
    status: 'idle',
    messages: sourceThread.messages.slice(0, idx + 1).map((m) => ({ ...m, threadId: newId })),
    latestOrchestration: undefined,
  });
}

function buildThreadStoreApi(args: {
  createId: () => string;
  now: () => number;
  runtime: ThreadStoreSqliteRuntime;
}): AgentChatThreadStore {
  const { runtime, now, createId } = args;
  return {
    createThread: createThreadMethod(args),
    deleteThread: (id) => runtime.runMutation(() => runtime.deleteThread(id)),
    loadThread: (id) => runtime.readThread(id),
    listThreads: (ws) => listThreadRecords(runtime, ws),
    loadLatestThread: (ws) => loadLatestThreadRecord(runtime, ws),
    updateThread: (id, patch) =>
      runtime.runMutation(() => updateThreadRecord({ now, patch, runtime, threadId: id })),
    appendMessage: (id, msg) =>
      runtime.runMutation(() =>
        appendMessageToThread({ now, runtime, threadId: id, message: msg }),
      ),
    updateMessage: (id, mid, patch) =>
      runtime.runMutation(() =>
        updateThreadMessage({ messageId: mid, messagePatch: patch, now, runtime, threadId: id }),
      ),
    updateTitleFromResponse: (id, content) =>
      runtime.runMutation(() => runtime.updateTitleFromResponse(id, content)),
    branchThread: (id, mid) =>
      runtime.runMutation(() =>
        branchThreadFrom({ createId, now, runtime, threadId: id, fromMessageId: mid }),
      ),
    getStorageDirectory: () => runtime.getStorageDirectory(),
  };
}

let singletonRuntime: ThreadStoreSqliteRuntime | null = null;

export function createAgentChatThreadStore(
  options: AgentChatThreadStoreOptions = {},
): AgentChatThreadStore {
  const threadsDir = options.threadsDir ?? DEFAULT_AGENT_CHAT_THREAD_STORE_DIR;
  const maxThreads = options.maxThreads ?? DEFAULT_MAX_AGENT_CHAT_THREADS;
  const now = options.now ?? Date.now;
  const createId = options.createId ?? randomUUID;
  const runtime = new ThreadStoreSqliteRuntime({ maxThreads, now, threadsDir });
  singletonRuntime = runtime;

  return buildThreadStoreApi({ createId, now, runtime });
}

export const agentChatThreadStore = createAgentChatThreadStore();

/** Close the thread store's SQLite connection. Call during app shutdown. */
export function closeThreadStore(): void {
  singletonRuntime?.close();
  singletonRuntime = null;
}
