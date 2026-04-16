import { randomUUID } from 'crypto';
import { app } from 'electron';
import * as path from 'path';

import { mergeSideChatIntoMain, type MergeSideChatParams, type MergeSideChatResult } from './mergeSideChat';
import {
  forkThreadImpl,
  type ForkThreadParams,
  listBranchesOfThreadImpl,
  renameBranchImpl,
} from './threadStoreFork';
import {
  appendMessageToThread,
  updateThreadMessage,
  updateThreadRecord,
} from './threadStoreOps';
import { branchThreadFrom, reRunFromMessageImpl } from './threadStoreRerun';
import type { SearchOptions, SearchResult } from './threadStoreSearch';
import { ThreadStoreSqliteRuntime } from './threadStoreSqlite';
import {
  DEFAULT_THREAD_TITLE,
  isNonEmptyString,
  normalizeLink,
  normalizeMessages,
} from './threadStoreSupport';
export type { ForkThreadParams } from './threadStoreFork';
export type {
  AgentChatMessagePatch,
  AgentChatThreadPatch,
  AgentChatThreadStoreOptions,
  CreateAgentChatThreadOptions,
} from './threadStoreSupport';
import type {
  AgentChatMessagePatch,
  AgentChatThreadPatch,
  AgentChatThreadStoreOptions,
  CreateAgentChatThreadOptions,
} from './threadStoreSupport';
import type {
  AgentChatCreateThreadRequest,
  AgentChatMessageRecord,
  AgentChatThreadRecord,
  BranchNode,
  Reaction,
} from './types';

export const DEFAULT_AGENT_CHAT_THREAD_STORE_DIR = path.join(
  app.getPath('userData'),
  'agent-chat',
  'threads',
);

const DEFAULT_MAX_AGENT_CHAT_THREADS = 100;

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
  /** Wave 22 Phase F — branch at the user msg preceding messageId, return {branch, userMessage}. */
  reRunFromMessage: (
    threadId: string,
    messageId: string,
  ) => Promise<{ branch: AgentChatThreadRecord; userMessage: AgentChatMessageRecord }>;
  getStorageDirectory: () => string;
  /** Retrieve current tags for a thread. Returns [] if thread not found. */
  getTags: (threadId: string) => Promise<string[]>;
  /** Persist tags for a thread. JSON-encodes internally. */
  setTags: (threadId: string, tags: string[]) => Promise<void>;
  /** Full-text search across thread messages, tags, and file paths. */
  searchThreads: (query: string, opts?: SearchOptions) => SearchResult[];
  /** Wave 21 Phase C — toggle pinned state (persists to SQLite). */
  pinThread: (threadId: string, pinned: boolean) => Promise<void>;
  /** Wave 21 Phase C — mark thread as soft-deleted (deletedAt = now). */
  softDeleteThread: (threadId: string) => Promise<void>;
  /** Wave 21 Phase C — clear deletedAt, restoring thread from soft-delete. */
  restoreDeletedThread: (threadId: string) => Promise<void>;
  /** Wave 22 Phase A — get reactions for a message. Returns [] if none. */
  getMessageReactions: (messageId: string) => Promise<Reaction[]>;
  /** Wave 22 Phase A — persist reactions for a message (replaces existing). */
  setMessageReactions: (messageId: string, reactions: Reaction[]) => Promise<void>;
  /** Wave 22 Phase A — set the collapsedByDefault flag for a message. */
  setMessageCollapsed: (messageId: string, collapsed: boolean) => Promise<void>;
  /** Wave 23 Phase A — fork a thread, optionally carrying history. */
  forkThread: (params: ForkThreadParams) => Promise<AgentChatThreadRecord>;
  /** Wave 23 Phase A — set a user-visible label for a branch thread. */
  renameBranch: (threadId: string, name: string) => Promise<void>;
  /** Wave 23 Phase A — list the branch tree rooted at rootThreadId. */
  listBranches: (rootThreadId: string) => Promise<BranchNode[]>;
  /** Wave 23 Phase D — append a system summary message from a side chat into the main thread. */
  mergeSideChat: (params: MergeSideChatParams) => Promise<MergeSideChatResult>;
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

type StoreApiArgs = { createId: () => string; now: () => number; runtime: ThreadStoreSqliteRuntime };

function buildCoreApi(args: StoreApiArgs): Pick<
  AgentChatThreadStore,
  | 'createThread' | 'deleteThread' | 'loadThread' | 'listThreads' | 'loadLatestThread'
  | 'updateThread' | 'appendMessage' | 'updateMessage' | 'updateTitleFromResponse'
  | 'branchThread' | 'reRunFromMessage' | 'getStorageDirectory'
> {
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
    reRunFromMessage: (id, mid) =>
      runtime.runMutation(() =>
        reRunFromMessageImpl({ createId, now, runtime, threadId: id, messageId: mid }),
      ),
    getStorageDirectory: () => runtime.getStorageDirectory(),
  };
}

function buildThreadStoreApi(args: StoreApiArgs): AgentChatThreadStore {
  const { runtime, createId, now } = args;
  return {
    ...buildCoreApi(args),
    getTags: (id) => runtime.getTags(id),
    setTags: (id, tags) => runtime.setTags(id, tags),
    searchThreads: (query, opts) => runtime.searchThreads(query, opts),
    pinThread: (id, pinned) => runtime.pinThread(id, pinned),
    softDeleteThread: (id) => runtime.softDeleteThread(id),
    restoreDeletedThread: (id) => runtime.restoreDeletedThread(id),
    getMessageReactions: (mid) => runtime.getMessageReactions(mid),
    setMessageReactions: (mid, reactions) => runtime.setMessageReactions(mid, reactions),
    setMessageCollapsed: (mid, collapsed) => runtime.setMessageCollapsed(mid, collapsed),
    forkThread: (params) =>
      runtime.runMutation(() =>
        forkThreadImpl({ createId, now, params, runtime }),
      ),
    renameBranch: (id, name) =>
      runtime.runMutation(async () => renameBranchImpl(runtime, id, name)),
    listBranches: (rootThreadId) => listBranchesOfThreadImpl(runtime, rootThreadId),
    mergeSideChat: (params) =>
      runtime.runMutation(() =>
        mergeSideChatIntoMain(params, runtime, { createId, now }),
      ),
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
