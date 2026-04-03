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

export interface AgentChatRevertResult extends OperationResult {
  /** Files that were restored to their pre-agent state. */
  revertedFiles?: string[];
  /** The git commit hash that was restored to. */
  restoredToHash?: string;
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
  onThreadUpdate: (callback: (thread: AgentChatThreadRecord) => void) => () => void;
  onMessageUpdate: (callback: (message: AgentChatMessageRecord) => void) => () => void;
  onStatusChange: (callback: (status: AgentChatThreadStatusSnapshot) => void) => () => void;
  onStreamChunk: (callback: (chunk: AgentChatStreamChunk) => void) => () => void;
  onEvent: (callback: (event: AgentChatEvent) => void) => () => void;
}
