/**
 * shared/types/agentChatResults.ts
 *
 * Agent chat result types, event types, streaming types, and the API surface.
 * Split from agentChat.ts to stay under the 300-line limit.
 */

import type {
  AgentChatMessageRecord,
  AgentChatOrchestrationLink,
  AgentChatStreamChunk,
  AgentChatThreadRecord,
  AgentChatThreadStatusSnapshot,
  BranchNode,
  Reaction,
  SessionMemoryEntry,
} from './agentChat';
import type {
  OperationResult,
  OrchestrationProvider,
  TaskResult,
  TaskSessionRecord,
} from './orchestration';

// ─── Events ──────────────────────────────────────────────────────────────────

export interface AgentChatEventBase<TType extends string> {
  type: TType;
  threadId: string;
  workspaceRoot: string;
  timestamp: number;
}

export interface AgentChatThreadUpdatedEvent extends AgentChatEventBase<'thread_updated'> {
  thread: AgentChatThreadRecord;
}

export interface AgentChatMessageUpdatedEvent extends AgentChatEventBase<'message_updated'> {
  message: AgentChatMessageRecord;
}

export interface AgentChatStatusChangedEvent extends AgentChatEventBase<'status_changed'> {
  status: AgentChatThreadStatusSnapshot;
}

export interface AgentChatStreamChunkEvent extends AgentChatEventBase<'stream_chunk'> {
  chunk: AgentChatStreamChunk;
}

export type AgentChatEvent =
  | AgentChatThreadUpdatedEvent
  | AgentChatMessageUpdatedEvent
  | AgentChatStatusChangedEvent
  | AgentChatStreamChunkEvent;

// ─── Operation results ───────────────────────────────────────────────────────

export interface AgentChatThreadResult extends OperationResult {
  thread?: AgentChatThreadRecord;
}

export interface AgentChatThreadsResult extends OperationResult {
  threads?: AgentChatThreadRecord[];
}

export interface AgentChatSendResult extends OperationResult {
  thread?: AgentChatThreadRecord;
  message?: AgentChatMessageRecord;
  status?: AgentChatThreadStatusSnapshot;
  orchestration?: AgentChatOrchestrationLink;
}

export interface AgentChatLinkedDetailsResult extends OperationResult {
  link?: AgentChatOrchestrationLink;
  session?: TaskSessionRecord;
  result?: TaskResult;
}

export interface AgentChatDeleteResult extends OperationResult {
  threadId?: string;
}

export interface AgentChatLinkedTerminalResult extends OperationResult {
  provider?: OrchestrationProvider | null;
  claudeSessionId?: string | null;
  codexThreadId?: string | null;
  linkedTerminalId?: string | null;
}

/** Wave 21 Phase G — session IDs linked to a chat thread via pty:linkToThread. */
export interface AgentChatLinkedTerminalsResult extends OperationResult {
  sessionIds?: string[];
}

export interface AgentChatRevertResult extends OperationResult {
  /** Files that were restored to their pre-agent state. */
  revertedFiles?: string[];
  /** The git commit hash that was restored to. */
  restoredToHash?: string;
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface AgentChatSearchResult {
  threadId: string;
  score: number;
  snippet: string;
  messageId?: string;
}

export interface AgentChatSearchPayload {
  query: string;
  limit?: number;
  threadId?: string;
}

// ─── Wave 21 Phase F — Cost rollup types ─────────────────────────────────────

export interface ThreadCostRollupRecord {
  threadId: string;
  inputTokens: number;
  outputTokens: number;
  totalUsd: number;
}

export interface GlobalCostRollupRecord {
  totalUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  threadCount: number;
}

export interface AgentChatCostRollupRequest {
  threadId: string;
}

export interface AgentChatGlobalCostRequest {
  timeRange?: { from: number; to: number };
}

export interface AgentChatThreadCostResult extends OperationResult {
  rollup?: ThreadCostRollupRecord;
}

export interface AgentChatGlobalCostResult extends OperationResult {
  rollup?: GlobalCostRollupRecord;
  threads?: ThreadCostRollupRecord[];
}

// ─── Wave 22 Phase A — Reaction result ──────────────────────────────────────

export interface AgentChatReactionsResult extends OperationResult {
  reactions?: Reaction[];
}

// ─── Wave 23 Phase D — Merge side chat result ────────────────────────────────

export interface AgentChatMergeSideChatRequest {
  sideChatId: string;
  mainThreadId: string;
  summary: string;
  includeMessageIds?: string[];
}

export interface AgentChatMergeSideChatResult extends OperationResult {
  systemMessageId?: string;
}

// ─── Wave 23 Phase A — Branch tree result ────────────────────────────────────

export interface AgentChatBranchesResult extends OperationResult {
  branches?: BranchNode[];
}

export interface AgentChatForkThreadRequest {
  sourceThreadId: string;
  fromMessageId: string;
  includeHistory: boolean;
  isSideChat?: boolean;
}

// ─── API surface ─────────────────────────────────────────────────────────────

export interface AgentChatAPI {
  createThread: (
    request: import('./agentChat').AgentChatCreateThreadRequest,
  ) => Promise<AgentChatThreadResult>;
  deleteThread: (threadId: string) => Promise<AgentChatDeleteResult>;
  loadThread: (threadId: string) => Promise<AgentChatThreadResult>;
  listThreads: (workspaceRoot?: string) => Promise<AgentChatThreadsResult>;
  sendMessage: (
    request: import('./agentChat').AgentChatSendMessageRequest,
  ) => Promise<AgentChatSendResult>;
  resumeLatestThread: (workspaceRoot: string) => Promise<AgentChatThreadResult>;
  getLinkedDetails: (link: AgentChatOrchestrationLink) => Promise<AgentChatLinkedDetailsResult>;
  branchThread: (threadId: string, fromMessageId: string) => Promise<AgentChatThreadResult>;
  getLinkedTerminal: (threadId: string) => Promise<AgentChatLinkedTerminalResult>;
  /** Returns buffered stream chunks for a thread — used to replay state after renderer refresh. */
  getBufferedChunks: (threadId: string) => Promise<AgentChatStreamChunk[]>;
  /** Revert file changes made during a specific assistant message's agent turn. */
  revertToSnapshot: (threadId: string, messageId: string) => Promise<AgentChatRevertResult>;
  /** Cancel a running task. Routes through the singleton orchestration that owns the process. */
  cancelTask: (taskId: string) => Promise<{ success: boolean; error?: string }>;
  /** Cancel by thread ID — works even before taskId is available (pending cancel). */
  cancelByThreadId: (threadId: string) => Promise<{ success: boolean; error?: string }>;
  /** List all active (non-superseded) memories for a workspace. */
  listMemories: (
    workspaceRoot: string,
  ) => Promise<{ success: boolean; memories?: SessionMemoryEntry[]; error?: string }>;
  /** Create a new memory entry manually. */
  createMemory: (
    workspaceRoot: string,
    entry: { type: string; content: string; relevantFiles?: string[] },
  ) => Promise<{ success: boolean; memory?: SessionMemoryEntry; error?: string }>;
  /** Update an existing memory entry by ID. */
  updateMemory: (
    workspaceRoot: string,
    memoryId: string,
    updates: { content?: string; type?: string; relevantFiles?: string[] },
  ) => Promise<{ success: boolean; memory?: SessionMemoryEntry; error?: string }>;
  /** Delete a memory entry by ID. */
  deleteMemory: (
    workspaceRoot: string,
    memoryId: string,
  ) => Promise<{ success: boolean; error?: string }>;
  /** Get tags for a thread. Returns [] if thread not found. */
  getThreadTags: (
    threadId: string,
  ) => Promise<{ success: boolean; tags?: string[]; error?: string }>;
  /** Persist tags for a thread (replaces existing tags). */
  setThreadTags: (
    threadId: string,
    tags: string[],
  ) => Promise<{ success: boolean; error?: string }>;
  /** Full-text search across thread messages, tags, and file paths. */
  searchThreads: (
    payload: AgentChatSearchPayload,
  ) => Promise<{ success: boolean; results?: AgentChatSearchResult[]; hasMore?: boolean; error?: string }>;
  /** Wave 21 Phase C — toggle pinned state for a thread. */
  pinThread: (
    threadId: string,
    pinned: boolean,
  ) => Promise<{ success: boolean; error?: string }>;
  /** Wave 21 Phase C — soft-delete a thread (sets deletedAt; 30-day grace). */
  softDeleteThread: (threadId: string) => Promise<{ success: boolean; error?: string }>;
  /** Wave 21 Phase C — restore a soft-deleted thread (clears deletedAt). */
  restoreDeletedThread: (threadId: string) => Promise<{ success: boolean; error?: string }>;
  /** Wave 21 Phase E — export a thread to markdown, JSON, or HTML. */
  exportThread: (
    threadId: string,
    format: 'markdown' | 'json' | 'html',
  ) => Promise<{ success: boolean; content?: string; error?: string }>;
  /** Wave 21 Phase E — import a thread from JSON or transcript text. */
  importThread: (
    content: string,
    format: 'json' | 'transcript',
  ) => Promise<{ success: boolean; threadId?: string; error?: string }>;
  /** Wave 21 Phase F — per-thread token/cost rollup. */
  getThreadCostRollup: (
    payload: AgentChatCostRollupRequest,
  ) => Promise<AgentChatThreadCostResult>;
  /** Wave 21 Phase F — global cost rollup across all threads, with optional time range. */
  getGlobalCostRollup: (
    payload?: AgentChatGlobalCostRequest,
  ) => Promise<AgentChatGlobalCostResult>;
  /** Wave 21 Phase G — return PTY session IDs linked to this thread. */
  getLinkedTerminals: (threadId: string) => Promise<AgentChatLinkedTerminalsResult>;
  /** Wave 22 Phase A — get current reactions for a message. */
  getMessageReactions: (messageId: string) => Promise<AgentChatReactionsResult>;
  /** Wave 22 Phase A — add a reaction; returns updated list. */
  addMessageReaction: (messageId: string, kind: string) => Promise<AgentChatReactionsResult>;
  /** Wave 22 Phase A — remove a reaction; returns updated list. */
  removeMessageReaction: (messageId: string, kind: string) => Promise<AgentChatReactionsResult>;
  /** Wave 22 Phase A — set collapsedByDefault flag for a message. */
  setMessageCollapsed: (
    messageId: string,
    collapsed: boolean,
  ) => Promise<{ success: boolean; error?: string }>;
  /**
   * Wave 22 Phase F — re-run from a message.
   * Branches the thread at the user message preceding messageId, then sends
   * that user message on the new branch with the given overrides.
   * Always creates a new branch — original thread is never modified.
   */
  reRunFromMessage: (
    threadId: string,
    messageId: string,
    overrides?: { model?: string; effort?: string; permissionMode?: string },
  ) => Promise<AgentChatThreadResult>;
  /**
   * Wave 23 Phase A — fork a thread, creating a new branch from a given message.
   * If includeHistory, copies messages up to and including fromMessageId.
   * Otherwise only copies system prompt messages.
   */
  forkThread: (request: AgentChatForkThreadRequest) => Promise<AgentChatThreadResult>;
  /** Wave 23 Phase A — set a user-visible label for a branch thread. */
  renameBranch: (
    threadId: string,
    name: string,
  ) => Promise<{ success: boolean; error?: string }>;
  /** Wave 23 Phase A — list the branch tree rooted at rootThreadId. */
  listBranches: (rootThreadId: string) => Promise<AgentChatBranchesResult>;
  /**
   * Wave 23 Phase D — append a system-role summary message from a side chat into the main thread.
   * Multiple merges are allowed; each call appends a new system message.
   */
  mergeSideChat: (
    request: AgentChatMergeSideChatRequest,
  ) => Promise<AgentChatMergeSideChatResult>;
  onThreadUpdate: (callback: (thread: AgentChatThreadRecord) => void) => () => void;
  onMessageUpdate: (callback: (message: AgentChatMessageRecord) => void) => () => void;
  onStatusChange: (callback: (status: AgentChatThreadStatusSnapshot) => void) => () => void;
  onStreamChunk: (callback: (chunk: AgentChatStreamChunk) => void) => () => void;
  onEvent: (callback: (event: AgentChatEvent) => void) => () => void;
}
