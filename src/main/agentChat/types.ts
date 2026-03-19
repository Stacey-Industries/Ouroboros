import type {
  OperationResult,
  OrchestrationMode,
  OrchestrationProvider,
  TaskRequestContextSelection,
  TaskResult,
  TaskSessionRecord,
  VerificationProfileName,
  VerificationSummary,
} from '../orchestration/types'

export type AgentChatThreadStatus =
  | 'idle'
  | 'submitting'
  | 'running'
  | 'verifying'
  | 'needs_review'
  | 'complete'
  | 'failed'
  | 'cancelled'

export type AgentChatMessageRole = 'user' | 'assistant' | 'system' | 'status'

export type AgentChatMessageStatusKind = 'context' | 'progress' | 'verification' | 'result' | 'error'

export type AgentChatContextBehavior = 'auto' | 'manual'

export type AgentChatDefaultView = 'chat' | 'monitor'

export type AgentChatMessageSource = 'composer' | 'retry' | 'resume' | 'api'

export type AgentChatErrorCode =
  | 'send_failed'
  | 'orchestration_failed'
  | 'verification_failed'
  | 'thread_not_found'
  | 'unknown'

export interface AgentChatOrchestrationLink {
  taskId?: string
  sessionId?: string
  attemptId?: string
  /** Claude Code CLI session UUID (from stream-json init event, used for --resume) */
  claudeSessionId?: string
  /** PTY session ID backing this chat session (for chat-terminal unification) */
  linkedTerminalId?: string
  /** Git HEAD hash captured before the agent turn started — used for revert. */
  preSnapshotHash?: string
}

export interface AgentChatContextSummary {
  selectedFileCount: number
  omittedFileCount: number
  usedAdvancedControls: boolean
}

export interface AgentChatVerificationPreview {
  profile: VerificationProfileName
  status: VerificationSummary['status']
  summary: string
}

export interface AgentChatErrorPayload {
  code: AgentChatErrorCode
  message: string
  recoverable: boolean
}

/* ------------------------------------------------------------------ */
/*  Structured Content Blocks                                         */
/* ------------------------------------------------------------------ */

export type AgentChatContentBlock =
  | { kind: 'text'; content: string }
  | {
      kind: 'thinking'
      content: string
      duration?: number
      collapsed?: boolean
      /** Streaming-only: wall-clock timestamp when this thinking block started (stripped on persist). */
      startedAt?: number
    }
  | {
      kind: 'tool_use'
      tool: string
      input?: unknown
      blockId?: string
      status: 'running' | 'complete' | 'error'
      output?: string
      filePath?: string
      duration?: number
      /** Streaming-only: short summary of the tool input (command, pattern, etc.). */
      inputSummary?: string
      /** Streaming-only: edit change summary (line counts). */
      editSummary?: { oldLines: number; newLines: number }
    }
  | { kind: 'tool_result'; toolUseId: string; content: string }
  | { kind: 'code'; language: string; content: string; filePath?: string; applied?: boolean }
  | { kind: 'diff'; filePath: string; hunks: string; status: 'pending' | 'accepted' | 'rejected' }
  | {
      kind: 'plan'
      steps: Array<{
        id: string
        title: string
        status: 'pending' | 'running' | 'complete' | 'failed'
        detail?: string
      }>
      completedCount: number
    }
  | { kind: 'error'; code: string; message: string; recoverable: boolean }

export interface AgentChatMessageRecord {
  id: string
  threadId: string
  role: AgentChatMessageRole
  content: string
  createdAt: number
  statusKind?: AgentChatMessageStatusKind
  orchestration?: AgentChatOrchestrationLink
  contextSummary?: AgentChatContextSummary
  verificationPreview?: AgentChatVerificationPreview
  error?: AgentChatErrorPayload
  toolsSummary?: string
  costSummary?: string
  durationSummary?: string
  /** Token usage for this message's API call(s). */
  tokenUsage?: { inputTokens: number; outputTokens: number }
  /** Model ID used for this message (e.g. 'claude-opus-4-6'). */
  model?: string
  /** Structured content blocks — when present, renderers should prefer these over `content`. */
  blocks?: AgentChatContentBlock[]
}

export interface AgentChatBranchInfo {
  /** ID of the parent thread this was branched from */
  parentThreadId: string
  /** Title of the parent thread at the time of branching */
  parentTitle: string
  /** ID of the message that was branched from */
  fromMessageId: string
  /** 1-based index of the message in the parent thread */
  fromMessageIndex: number
  /** Preview of the message content that was branched from */
  fromMessagePreview: string
}

export interface AgentChatThreadRecord {
  version: 1
  id: string
  workspaceRoot: string
  createdAt: number
  updatedAt: number
  title: string
  status: AgentChatThreadStatus
  messages: AgentChatMessageRecord[]
  latestOrchestration?: AgentChatOrchestrationLink
  /** Present when this thread was created by branching from another */
  branchInfo?: AgentChatBranchInfo
}

export interface AgentChatSettings {
  defaultProvider: OrchestrationProvider
  defaultVerificationProfile: VerificationProfileName
  contextBehavior: AgentChatContextBehavior
  showAdvancedControls: boolean
  openDetailsOnFailure: boolean
  defaultView: AgentChatDefaultView
}

export interface AgentChatCreateThreadRequest {
  workspaceRoot: string
  title?: string
}

export interface AgentChatSendMessageOverrides {
  provider?: OrchestrationProvider
  verificationProfile?: VerificationProfileName
  mode?: OrchestrationMode
  contextBehavior?: AgentChatContextBehavior
  openDetailsOnFailure?: boolean
  /** Per-message model override (e.g. 'claude-sonnet-4-6', 'claude-opus-4-6') */
  model?: string
  /** Per-message effort override ('low' | 'medium' | 'high' | 'max') */
  effort?: string
  /** Per-message permission mode override ('acceptEdits' | 'plan' | 'auto' | 'bypassPermissions') */
  permissionMode?: string
}

export interface AgentChatSendMessageMetadata {
  source: AgentChatMessageSource
  usedAdvancedControls?: boolean
}

export type ImageMimeType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

export interface ImageAttachment {
  /** Original filename, e.g. "screenshot.png" */
  name: string
  mimeType: ImageMimeType
  /** Raw base64 data WITHOUT the data:…;base64, prefix */
  base64Data: string
  /** Byte size of the decoded data */
  sizeBytes: number
}

export interface AgentChatSendMessageRequest {
  threadId?: string
  workspaceRoot: string
  content: string
  attachments?: ImageAttachment[]
  contextSelection?: Partial<TaskRequestContextSelection>
  overrides?: AgentChatSendMessageOverrides
  metadata?: AgentChatSendMessageMetadata
}

export interface AgentChatThreadStatusSnapshot {
  threadId: string
  workspaceRoot: string
  status: AgentChatThreadStatus
  latestMessageId?: string
  latestOrchestration?: AgentChatOrchestrationLink
  updatedAt: number
}

export interface AgentChatEventBase<TType extends string> {
  type: TType
  threadId: string
  workspaceRoot: string
  timestamp: number
}

export interface AgentChatThreadUpdatedEvent extends AgentChatEventBase<'thread_updated'> {
  thread: AgentChatThreadRecord
}

export interface AgentChatMessageUpdatedEvent extends AgentChatEventBase<'message_updated'> {
  message: AgentChatMessageRecord
}

export interface AgentChatStatusChangedEvent extends AgentChatEventBase<'status_changed'> {
  status: AgentChatThreadStatusSnapshot
}

export interface AgentChatStreamChunk {
  threadId: string
  messageId: string
  type: 'text_delta' | 'thinking_delta' | 'tool_activity' | 'complete' | 'error' | 'thread_snapshot'
  /** Content block index — stable position from the provider API. */
  blockIndex?: number
  textDelta?: string
  thinkingDelta?: string
  toolActivity?: {
    name: string
    status: 'running' | 'complete'
    filePath?: string
    inputSummary?: string
    editSummary?: { oldLines: number; newLines: number }
  }
  /** Full thread record — sent with thread_snapshot chunks after persistence. */
  thread?: AgentChatThreadRecord
  timestamp: number
}

export interface AgentChatStreamChunkEvent extends AgentChatEventBase<'stream_chunk'> {
  chunk: AgentChatStreamChunk
}

export type AgentChatEvent =
  | AgentChatThreadUpdatedEvent
  | AgentChatMessageUpdatedEvent
  | AgentChatStatusChangedEvent
  | AgentChatStreamChunkEvent

export interface AgentChatThreadResult extends OperationResult {
  thread?: AgentChatThreadRecord
}

export interface AgentChatThreadsResult extends OperationResult {
  threads?: AgentChatThreadRecord[]
}

export interface AgentChatSendResult extends OperationResult {
  thread?: AgentChatThreadRecord
  message?: AgentChatMessageRecord
  status?: AgentChatThreadStatusSnapshot
  orchestration?: AgentChatOrchestrationLink
}

export interface AgentChatLinkedDetailsResult extends OperationResult {
  link?: AgentChatOrchestrationLink
  session?: TaskSessionRecord
  result?: TaskResult
}

export interface AgentChatDeleteResult extends OperationResult {
  threadId?: string
}

export interface AgentChatLinkedTerminalResult extends OperationResult {
  claudeSessionId?: string | null
  linkedTerminalId?: string | null
}

export interface AgentChatRevertResult extends OperationResult {
  /** Files that were restored to their pre-agent state. */
  revertedFiles?: string[]
  /** The git commit hash that was restored to. */
  restoredToHash?: string
}

export interface AgentChatAPI {
  createThread: (request: AgentChatCreateThreadRequest) => Promise<AgentChatThreadResult>
  deleteThread: (threadId: string) => Promise<AgentChatDeleteResult>
  loadThread: (threadId: string) => Promise<AgentChatThreadResult>
  listThreads: (workspaceRoot?: string) => Promise<AgentChatThreadsResult>
  sendMessage: (request: AgentChatSendMessageRequest) => Promise<AgentChatSendResult>
  resumeLatestThread: (workspaceRoot: string) => Promise<AgentChatThreadResult>
  getLinkedDetails: (link: AgentChatOrchestrationLink) => Promise<AgentChatLinkedDetailsResult>
  branchThread: (threadId: string, fromMessageId: string) => Promise<AgentChatThreadResult>
  getLinkedTerminal: (threadId: string) => Promise<AgentChatLinkedTerminalResult>
  /** Returns buffered stream chunks for a thread — used to replay state after renderer refresh. */
  getBufferedChunks: (threadId: string) => Promise<AgentChatStreamChunk[]>
  /** Revert file changes made during a specific assistant message's agent turn. */
  revertToSnapshot: (threadId: string, messageId: string) => Promise<AgentChatRevertResult>
  /** Cancel a running task. Routes through the singleton orchestration that owns the process. */
  cancelTask: (taskId: string) => Promise<{ success: boolean; error?: string }>
  onThreadUpdate: (callback: (thread: AgentChatThreadRecord) => void) => () => void
  onMessageUpdate: (callback: (message: AgentChatMessageRecord) => void) => () => void
  onStatusChange: (callback: (status: AgentChatThreadStatusSnapshot) => void) => () => void
  onStreamChunk: (callback: (chunk: AgentChatStreamChunk) => void) => () => void
  onEvent: (callback: (event: AgentChatEvent) => void) => () => void
}
