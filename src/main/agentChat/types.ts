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
  | { kind: 'thinking'; content: string; duration?: number; collapsed?: boolean }
  | {
      kind: 'tool_use'
      tool: string
      input?: unknown
      blockId?: string
      status: 'running' | 'complete' | 'error'
      output?: string
      filePath?: string
      duration?: number
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
}

export interface AgentChatSendMessageMetadata {
  source: AgentChatMessageSource
  usedAdvancedControls?: boolean
}

export interface AgentChatSendMessageRequest {
  threadId?: string
  workspaceRoot: string
  content: string
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
  type: 'text_delta' | 'thinking_delta' | 'tool_activity' | 'complete' | 'error'
  textDelta?: string
  thinkingDelta?: string
  toolActivity?: { name: string; status: 'running' | 'complete'; filePath?: string }
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

export interface AgentChatAPI {
  createThread: (request: AgentChatCreateThreadRequest) => Promise<AgentChatThreadResult>
  deleteThread: (threadId: string) => Promise<AgentChatDeleteResult>
  loadThread: (threadId: string) => Promise<AgentChatThreadResult>
  listThreads: (workspaceRoot?: string) => Promise<AgentChatThreadsResult>
  sendMessage: (request: AgentChatSendMessageRequest) => Promise<AgentChatSendResult>
  resumeLatestThread: (workspaceRoot: string) => Promise<AgentChatThreadResult>
  getLinkedDetails: (link: AgentChatOrchestrationLink) => Promise<AgentChatLinkedDetailsResult>
  branchThread: (threadId: string, fromMessageId: string) => Promise<AgentChatThreadResult>
  onThreadUpdate: (callback: (thread: AgentChatThreadRecord) => void) => () => void
  onMessageUpdate: (callback: (message: AgentChatMessageRecord) => void) => () => void
  onStatusChange: (callback: (status: AgentChatThreadStatusSnapshot) => void) => () => void
  onStreamChunk: (callback: (chunk: AgentChatStreamChunk) => void) => () => void
  onEvent: (callback: (event: AgentChatEvent) => void) => () => void
}
