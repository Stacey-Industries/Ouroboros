/**
 * shared/types/agentChat.ts
 *
 * Agent chat types that cross the main/renderer/preload process boundary.
 * Canonical source for all AgentChat* types consumed by the renderer and preload.
 *
 * The main process (`src/main/agentChat/types.ts`) re-exports everything from here
 * so existing main-process imports are unaffected.
 */

import type { SkillExecutionRecord } from './ruleActivity';

// ─── Re-exported from sessionMemory (type only) ───────────────────────────────

export interface SessionMemoryEntry {
  id: string;
  timestamp: string;
  sessionId: string;
  type: 'decision' | 'pattern' | 'fact' | 'preference' | 'error_resolution';
  content: string;
  relevantFiles: string[];
  confidence: number;
  supersededBy?: string;
}

// ─── Image attachments ────────────────────────────────────────────────────────

export type ImageMimeType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

export interface ImageAttachment {
  /** Original filename, e.g. "screenshot.png" */
  name: string;
  mimeType: ImageMimeType;
  /** Raw base64 data WITHOUT the data:…;base64, prefix */
  base64Data: string;
  /** Byte size of the decoded data */
  sizeBytes: number;
}

// ─── Wave 22 Phase A — Reaction ──────────────────────────────────────────────

export interface Reaction {
  /** Reaction kind — '+1', '-1', or a custom string (e.g. emoji shortcode). */
  kind: '+1' | '-1' | (string & {});
  /** Identity of the reactor (optional — undefined means current user). */
  by?: string;
  /** Epoch ms when the reaction was added. */
  at: number;
}

// ─── Thread / message primitives ──────────────────────────────────────────────

export type AgentChatThreadStatus =
  | 'idle'
  | 'submitting'
  | 'running'
  | 'verifying'
  | 'needs_review'
  | 'complete'
  | 'failed'
  | 'cancelled';

export type AgentChatMessageRole = 'user' | 'assistant' | 'system' | 'status';

export type AgentChatMessageStatusKind =
  | 'context'
  | 'progress'
  | 'verification'
  | 'result'
  | 'error';

export type AgentChatContextBehavior = 'auto' | 'manual';

export type AgentChatDefaultView = 'chat' | 'monitor';

export type AgentChatMessageSource = 'composer' | 'edit' | 'retry' | 'resume' | 'api';

export type AgentChatErrorCode =
  | 'send_failed'
  | 'orchestration_failed'
  | 'verification_failed'
  | 'thread_not_found'
  | 'unknown';

// ─── Cross-domain references (orchestration primitives) ───────────────────────
// Imported from shared/types/orchestration to avoid reaching into main/

import type {
  OrchestrationMode,
  OrchestrationProvider,
  TaskRequestContextSelection,
  VerificationProfileName,
  VerificationSummary,
} from './orchestration';

// ─── AgentChat compound types ─────────────────────────────────────────────────

export interface AgentChatOrchestrationLink {
  taskId?: string;
  sessionId?: string;
  attemptId?: string;
  /** Provider that executed this session. */
  provider?: OrchestrationProvider;
  /** Claude Code CLI session UUID (from stream-json init event, used for --resume) */
  claudeSessionId?: string;
  /** Codex thread UUID (from thread.started, used for `codex resume <id>`) */
  codexThreadId?: string;
  /** Model string used for this session (e.g. 'minimax:MiniMax-M2.7', 'claude-opus-4-6').
   *  Used to detect model changes between turns — a model change invalidates --resume
   *  because thinking block signatures are model-specific. */
  model?: string;
  /** Effort/reasoning level used for this session. */
  effort?: string;
  /** PTY session ID backing this chat session (for chat-terminal unification) */
  linkedTerminalId?: string;
  /** Git HEAD hash captured before the agent turn started — used for revert. */
  preSnapshotHash?: string;
  /** How the model was selected: 'rule', 'classifier', 'llm', 'user', or undefined. */
  routedBy?: string;
}

export interface AgentChatContextSummary {
  selectedFileCount: number;
  omittedFileCount: number;
  usedAdvancedControls: boolean;
}

export interface AgentChatVerificationPreview {
  profile: VerificationProfileName;
  status: VerificationSummary['status'];
  summary: string;
}

export interface AgentChatErrorPayload {
  code: AgentChatErrorCode;
  message: string;
  recoverable: boolean;
}

/* ------------------------------------------------------------------ */
/*  Sub-tool activity (nested subagent tool calls)                    */
/* ------------------------------------------------------------------ */

export interface AgentChatSubToolActivity {
  name: string;
  status: 'running' | 'complete' | 'error';
  filePath?: string;
  inputSummary?: string;
  editSummary?: { oldLines: number; newLines: number };
  output?: string;
  /** Stable ID for React keying — deterministic from parent + counter. */
  subToolId: string;
}

/* ------------------------------------------------------------------ */
/*  Structured Content Blocks                                         */
/* ------------------------------------------------------------------ */

export type AgentChatContentBlock =
  | { kind: 'text'; content: string }
  | {
      kind: 'thinking';
      content: string;
      duration?: number;
      collapsed?: boolean;
      /** Streaming-only: wall-clock timestamp when this thinking block started (stripped on persist). */
      startedAt?: number;
    }
  | {
      kind: 'tool_use';
      tool: string;
      input?: unknown;
      blockId?: string;
      status: 'running' | 'complete' | 'error';
      output?: string;
      filePath?: string;
      duration?: number;
      /** Streaming-only: short summary of the tool input (command, pattern, etc.). */
      inputSummary?: string;
      /** Streaming-only: edit change summary (line counts). */
      editSummary?: { oldLines: number; newLines: number };
      /** Nested subagent tool calls (populated when this is an Agent/Task tool). */
      subTools?: AgentChatSubToolActivity[];
    }
  | { kind: 'tool_result'; toolUseId: string; content: string }
  | { kind: 'code'; language: string; content: string; filePath?: string; applied?: boolean }
  | { kind: 'diff'; filePath: string; hunks: string; status: 'pending' | 'accepted' | 'rejected' }
  | {
      kind: 'plan';
      steps: Array<{
        id: string;
        title: string;
        status: 'pending' | 'running' | 'complete' | 'failed';
        detail?: string;
      }>;
      completedCount: number;
    }
  | { kind: 'error'; code: string; message: string; recoverable: boolean };

export interface AgentChatMessageRecord {
  id: string;
  threadId: string;
  role: AgentChatMessageRole;
  content: string;
  createdAt: number;
  statusKind?: AgentChatMessageStatusKind;
  orchestration?: AgentChatOrchestrationLink;
  contextSummary?: AgentChatContextSummary;
  verificationPreview?: AgentChatVerificationPreview;
  error?: AgentChatErrorPayload;
  toolsSummary?: string;
  costSummary?: string;
  durationSummary?: string;
  /** Token usage for this message's API call(s). */
  tokenUsage?: { inputTokens: number; outputTokens: number };
  /** Model ID used for this message (e.g. 'claude-opus-4-6'). */
  model?: string;
  /** Structured content blocks — when present, renderers should prefer these over `content`. */
  blocks?: AgentChatContentBlock[];
  /** Skill invocations that occurred during this message's processing. */
  skillExecutions?: SkillExecutionRecord[];
  /**
   * Git commit hash on refs/ouroboros/checkpoints/<threadId> captured after this turn.
   * Present only on assistant messages that had a checkpoint created.
   */
  checkpointCommit?: string;
  /** Wave 22 Phase A — emoji/thumbs reactions on this message. */
  reactions?: Reaction[];
  /** Wave 22 Phase A — when true, the renderer should render this message folded/collapsed. */
  collapsedByDefault?: boolean;
}

export interface AgentChatBranchInfo {
  /** ID of the parent thread this was branched from */
  parentThreadId: string;
  /** Title of the parent thread at the time of branching */
  parentTitle: string;
  /** ID of the message that was branched from */
  fromMessageId: string;
  /** 1-based index of the message in the parent thread */
  fromMessageIndex: number;
  /** Preview of the message content that was branched from */
  fromMessagePreview: string;
}

export interface AgentChatThreadRecord {
  version: 1;
  id: string;
  workspaceRoot: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  status: AgentChatThreadStatus;
  messages: AgentChatMessageRecord[];
  latestOrchestration?: AgentChatOrchestrationLink;
  /** Present when this thread was created by branching from another */
  branchInfo?: AgentChatBranchInfo;
  /** Number of times the conversation history has been compacted for this thread */
  compactionCount?: number;
  /** Running count of user turns sent on this thread (used for adaptive budget scaling) */
  turnCount?: number;
  /**
   * Tags for this thread. Auto-tags are prefixed `auto:` (e.g. `auto:typescript`).
   * Manual tags have no prefix. JSON-encoded in SQLite as TEXT.
   */
  tags?: string[];
  /** Wave 21 Phase C — pinned threads sort to top of sidebar. SQLite: INTEGER 0/1. */
  pinned?: boolean;
  /** Wave 21 Phase C — epoch ms when this thread was soft-deleted (30-day grace). */
  deletedAt?: number;
}

export interface AgentChatSettings {
  defaultProvider: OrchestrationProvider;
  defaultVerificationProfile: VerificationProfileName;
  contextBehavior: AgentChatContextBehavior;
  showAdvancedControls: boolean;
  openDetailsOnFailure: boolean;
  defaultView: AgentChatDefaultView;
}

export interface AgentChatCreateThreadRequest {
  workspaceRoot: string;
  title?: string;
}

export interface AgentChatSendMessageOverrides {
  provider?: OrchestrationProvider;
  verificationProfile?: VerificationProfileName;
  mode?: OrchestrationMode;
  contextBehavior?: AgentChatContextBehavior;
  openDetailsOnFailure?: boolean;
  /** Per-message model override (e.g. 'claude-sonnet-4-6', 'claude-opus-4-6') */
  model?: string;
  /** Per-message effort override ('low' | 'medium' | 'high' | 'max') */
  effort?: string;
  /** Per-message permission mode override ('acceptEdits' | 'plan' | 'auto' | 'bypassPermissions') */
  permissionMode?: string;
}

export interface AgentChatSendMessageMetadata {
  source: AgentChatMessageSource;
  usedAdvancedControls?: boolean;
}

export interface AgentChatSendMessageRequest {
  threadId?: string;
  workspaceRoot: string;
  content: string;
  attachments?: ImageAttachment[];
  contextSelection?: Partial<TaskRequestContextSelection>;
  overrides?: AgentChatSendMessageOverrides;
  metadata?: AgentChatSendMessageMetadata;
  /** Expanded skill body — injected into agent context, not shown in chat */
  skillExpansion?: string;
}

export interface AgentChatThreadStatusSnapshot {
  threadId: string;
  workspaceRoot: string;
  status: AgentChatThreadStatus;
  latestMessageId?: string;
  latestOrchestration?: AgentChatOrchestrationLink;
  updatedAt: number;
}

// ─── Streaming chunk ─────────────────────────────────────────────────────────

export interface AgentChatStreamChunkToolActivity {
  name: string;
  status: 'running' | 'complete' | 'error';
  filePath?: string;
  inputSummary?: string;
  editSummary?: { oldLines: number; newLines: number } | string;
  /** Tool result content (populated on 'complete' status). */
  output?: string;
  /** When present, this is a subagent tool activity targeting the parent Agent tool. */
  subTool?: AgentChatSubToolActivity;
}

export interface AgentChatStreamChunk {
  type: 'text_delta' | 'thinking_delta' | 'tool_activity' | 'complete' | 'error' | 'thread_snapshot';
  messageId: string;
  /** Present on all chunk types for cross-thread routing in multi-thread UIs. */
  threadId?: string;
  timestamp?: number;
  textDelta?: string;
  thinkingDelta?: string;
  blockIndex?: number;
  toolActivity?: AgentChatStreamChunkToolActivity;
  tokenUsage?: { inputTokens: number; outputTokens: number };
  /** Present only on thread_snapshot chunks — full updated thread state. */
  thread?: AgentChatThreadRecord;
}

// ─── Re-exports from split file ──────────────────────────────────────────────

export type {
  AgentChatAPI,
  AgentChatDeleteResult,
  AgentChatEvent,
  AgentChatEventBase,
  AgentChatLinkedDetailsResult,
  AgentChatLinkedTerminalResult,
  AgentChatLinkedTerminalsResult,
  AgentChatMessageUpdatedEvent,
  AgentChatReactionsResult,
  AgentChatRevertResult,
  AgentChatSearchPayload,
  AgentChatSearchResult,
  AgentChatSendResult,
  AgentChatStatusChangedEvent,
  AgentChatStreamChunkEvent,
  AgentChatThreadResult,
  AgentChatThreadsResult,
  AgentChatThreadUpdatedEvent,
} from './agentChatResults';
