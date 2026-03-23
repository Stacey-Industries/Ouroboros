import type { ContextPacket } from './typesContext'
import type {
  NextSuggestedAction,
  OperationResult,
  OrchestrationProvider,
  OrchestrationStatus,
  ProviderExecutionStatus,
  TaskRequest,
  VerificationProfileName,
  VerificationRunStatus,
  VerificationStepKind,
} from './typesDomain'

export interface ProviderCapabilities {
  provider: OrchestrationProvider
  supportsStreaming: boolean
  supportsResume: boolean
  supportsStructuredEdits: boolean
  supportsToolUse: boolean
  supportsContextCaching: boolean
  maxContextHint: number | null
  requiresTerminalSession: boolean
  requiresHookEvents: boolean
}

export interface ProviderSessionReference {
  provider: OrchestrationProvider
  sessionId?: string
  requestId?: string
  externalTaskId?: string
  /** PTY session ID when the provider is backed by a real terminal */
  linkedTerminalId?: string
}

export interface ProviderArtifact {
  provider: OrchestrationProvider
  status: ProviderExecutionStatus
  submittedAt: number
  completedAt?: number
  session: ProviderSessionReference
  lastMessage?: string
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

/**
 * Structured content block delta — carries block identity from the provider API
 * through to the renderer so blocks can be placed at exact positions.
 *
 * This replaces the old prefix-encoded string approach (__tool__:, __thinking__:)
 * that lost block indices and forced heuristic reconstruction downstream.
 */
export interface ProviderContentBlockDelta {
  /** Position of the content block in the assistant message (global across turns) */
  blockIndex: number
  /** Type of content block */
  blockType: 'text' | 'thinking' | 'tool_use'
  /** Text delta for text/thinking blocks */
  textDelta?: string
  /** Tool activity for tool_use blocks */
  toolActivity?: {
    name: string
    status: 'running' | 'complete'
    toolUseId?: string
    filePath?: string
    inputSummary?: string
    editSummary?: { oldLines: number; newLines: number }
  }
}

export interface ProviderProgressEvent {
  provider: OrchestrationProvider
  status: ProviderExecutionStatus
  /** Status text for non-streaming events; text delta for legacy streaming path. */
  message: string
  session?: ProviderSessionReference
  timestamp: number
  /** Structured content block delta — when present, carries block identity from the API. */
  contentBlock?: ProviderContentBlockDelta
  /** Cumulative token usage for this request (populated on 'completed' status). */
  tokenUsage?: TokenUsage
  /** Total cost in USD (populated on 'completed' status). */
  costUsd?: number
  /** Total duration in milliseconds (populated on 'completed' status). */
  durationMs?: number
}

export interface DiffFileSummary {
  filePath: string
  additions: number
  deletions: number
  summary?: string
  risk?: 'low' | 'medium' | 'high'
}

export interface DiffSummary {
  files: DiffFileSummary[]
  totalFiles: number
  totalAdditions: number
  totalDeletions: number
  summary: string
}

export interface VerificationStep {
  id: string
  label: string
  kind: VerificationStepKind
  command?: string
  requiresApproval: boolean
  readOnly: boolean
}

export interface VerificationProfile {
  name: VerificationProfileName
  label: string
  description: string
  steps: VerificationStep[]
  allowsExpensiveSteps: boolean
  mayRequireApproval: boolean
}

export interface VerificationIssue {
  filePath?: string
  severity: 'error' | 'warning' | 'info'
  message: string
}

export interface VerificationCommandResult {
  stepId: string
  status: VerificationRunStatus
  exitCode?: number
  stdout?: string
  stderr?: string
  durationMs?: number
}

export interface VerificationSummary {
  profile: VerificationProfileName
  status: VerificationRunStatus
  startedAt: number
  completedAt?: number
  commandResults: VerificationCommandResult[]
  issues: VerificationIssue[]
  summary: string
  requiredApproval: boolean
}

export interface TaskResult {
  taskId: string
  sessionId: string
  attemptId?: string
  status: OrchestrationStatus
  contextPacketId?: string
  providerArtifact?: ProviderArtifact
  verificationSummary?: VerificationSummary
  diffSummary?: DiffSummary
  unresolvedIssues: string[]
  nextSuggestedAction?: NextSuggestedAction
  message?: string
}

export interface TaskAttemptRecord {
  id: string
  startedAt: number
  completedAt?: number
  status: OrchestrationStatus
  contextPacketId?: string
  providerArtifact?: ProviderArtifact
  verificationSummary?: VerificationSummary
  diffSummary?: DiffSummary
  unresolvedIssues: string[]
  nextSuggestedAction?: NextSuggestedAction
  resultMessage?: string
}

export interface TaskSessionRecord {
  version: 1
  id: string
  taskId: string
  workspaceRoots: string[]
  createdAt: number
  updatedAt: number
  request: TaskRequest
  status: OrchestrationStatus
  contextPacket?: ContextPacket
  providerSession?: ProviderSessionReference
  lastVerificationSummary?: VerificationSummary
  latestResult?: TaskResult
  attempts: TaskAttemptRecord[]
  unresolvedIssues: string[]
  nextSuggestedAction?: NextSuggestedAction
}

export interface TaskSessionPatch {
  status?: OrchestrationStatus
  contextPacket?: ContextPacket
  providerSession?: ProviderSessionReference
  lastVerificationSummary?: VerificationSummary
  latestResult?: TaskResult
  unresolvedIssues?: string[]
  nextSuggestedAction?: NextSuggestedAction
  appendAttempt?: TaskAttemptRecord
}

export interface OrchestrationState {
  status: OrchestrationStatus
  activeTaskId?: string
  activeSessionId?: string
  activeAttemptId?: string
  provider?: OrchestrationProvider
  verificationProfile?: VerificationProfileName
  contextPacketId?: string
  message?: string
  pendingApproval?: boolean
  updatedAt: number
}

export interface OrchestrationEventBase<TType extends string> {
  type: TType
  taskId: string
  sessionId?: string
  timestamp: number
}

export interface OrchestrationStateChangedEvent extends OrchestrationEventBase<'state_changed'> {
  state: OrchestrationState
}

export interface OrchestrationProviderProgressEvent extends OrchestrationEventBase<'provider_progress'> {
  progress: ProviderProgressEvent
}

export interface OrchestrationVerificationUpdatedEvent extends OrchestrationEventBase<'verification_updated'> {
  summary: VerificationSummary
}

export interface OrchestrationSessionUpdatedEvent extends OrchestrationEventBase<'session_updated'> {
  session: TaskSessionRecord
}

export interface OrchestrationTaskResultEvent extends OrchestrationEventBase<'task_result'> {
  result: TaskResult
}

export type OrchestrationEvent =
  | OrchestrationStateChangedEvent
  | OrchestrationProviderProgressEvent
  | OrchestrationVerificationUpdatedEvent
  | OrchestrationSessionUpdatedEvent
  | OrchestrationTaskResultEvent

export interface TaskMutationResult extends OperationResult {
  taskId?: string
  session?: TaskSessionRecord
  state?: OrchestrationState
  result?: TaskResult
}

export interface ContextPacketResult extends OperationResult {
  packet?: ContextPacket
}

export interface TaskSessionResult extends OperationResult {
  session?: TaskSessionRecord
}

export interface TaskSessionsResult extends OperationResult {
  sessions?: TaskSessionRecord[]
}

export interface VerificationResult extends OperationResult {
  summary?: VerificationSummary
  session?: TaskSessionRecord
  state?: OrchestrationState
}

export interface OrchestrationAPI {
  createTask: (request: TaskRequest) => Promise<TaskMutationResult>
  startTask: (taskId: string) => Promise<TaskMutationResult>
  previewContext: (request: TaskRequest) => Promise<ContextPacketResult>
  buildContextPacket: (request: TaskRequest) => Promise<ContextPacketResult>
  loadSession: (sessionId: string) => Promise<TaskSessionResult>
  loadSessions: (workspaceRoot?: string) => Promise<TaskSessionsResult>
  loadLatestSession: (workspaceRoot?: string) => Promise<TaskSessionResult>
  updateSession: (sessionId: string, patch: TaskSessionPatch) => Promise<TaskSessionResult>
  resumeTask: (sessionId: string) => Promise<TaskMutationResult>
  rerunVerification: (sessionId: string, profile?: VerificationProfileName) => Promise<VerificationResult>
  cancelTask: (taskId: string) => Promise<TaskMutationResult>
  pauseTask: (taskId: string) => Promise<TaskMutationResult>
  onStateChange: (callback: (state: OrchestrationState) => void) => () => void
  onProviderEvent: (callback: (event: ProviderProgressEvent) => void) => () => void
  onVerificationSummary: (callback: (summary: VerificationSummary) => void) => () => void
  onSessionUpdate: (callback: (session: TaskSessionRecord) => void) => () => void
}
