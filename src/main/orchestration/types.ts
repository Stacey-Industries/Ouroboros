export type OrchestrationMode = 'plan' | 'edit' | 'review'

export type OrchestrationProvider = 'claude-code' | 'codex' | 'anthropic-api'

export type VerificationProfileName = 'fast' | 'default' | 'full'

export type OrchestrationStatus =
  | 'idle'
  | 'selecting_context'
  | 'awaiting_provider'
  | 'applying'
  | 'verifying'
  | 'needs_review'
  | 'complete'
  | 'failed'
  | 'cancelled'
  | 'paused'

export type ContextReasonKind =
  | 'user_selected'
  | 'pinned'
  | 'included'
  | 'active_file'
  | 'open_file'
  | 'dirty_buffer'
  | 'recent_edit'
  | 'git_diff'
  | 'diagnostic'
  | 'keyword_match'
  | 'import_adjacency'
  | 'dependency'

export type ContextConfidence = 'high' | 'medium' | 'low'

export type ContextSnippetSource =
  | 'full_file'
  | 'selection'
  | 'diff_hunk'
  | 'diagnostic'
  | 'manual_pin'
  | 'keyword_match'
  | 'import_adjacency'
  | 'dirty_buffer'

export type VerificationStepKind = 'command' | 'diagnostics' | 'git'

export type VerificationRunStatus = 'pending' | 'running' | 'passed' | 'failed' | 'cancelled' | 'skipped'

export type ProviderExecutionStatus = 'queued' | 'streaming' | 'completed' | 'failed' | 'cancelled'

export type NextSuggestedAction =
  | 'review_changes'
  | 'rerun_verification'
  | 'resume_provider'
  | 'adjust_context'
  | 'complete_task'
  | 'retry_task'

export interface OperationResult {
  success: boolean
  error?: string
}

export interface TaskRequestContextSelection {
  userSelectedFiles: string[]
  pinnedFiles: string[]
  includedFiles: string[]
  excludedFiles: string[]
}

export interface ContextBudgetConstraints {
  maxFiles?: number
  maxBytes?: number
  maxTokens?: number
  maxSnippetsPerFile?: number
}

export interface TaskRequestMetadata {
  origin: 'panel' | 'command_palette' | 'resume' | 'api'
  label?: string
  requestedAt?: number
}

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface TaskRequest {
  taskId?: string
  sessionId?: string
  workspaceRoots: string[]
  goal: string
  mode: OrchestrationMode
  provider: OrchestrationProvider
  verificationProfile: VerificationProfileName
  contextSelection?: Partial<TaskRequestContextSelection>
  budget?: ContextBudgetConstraints
  resumeFromSessionId?: string
  metadata?: TaskRequestMetadata
  /** Full conversation history for providers that support multi-turn context (e.g. anthropic-api). */
  conversationHistory?: ConversationMessage[]
}

export interface WorkspaceRootFact {
  rootPath: string
  fileCount?: number
  directoryCount?: number
  languages: string[]
  entryPoints: string[]
  recentlyEditedFiles: string[]
  indexedAt: number
}

export interface GitDiffFileSummary {
  filePath: string
  additions: number
  deletions: number
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'unknown'
}

export interface GitDiffSummary {
  changedFiles: GitDiffFileSummary[]
  totalAdditions: number
  totalDeletions: number
  changedFileCount: number
  comparedAgainst?: string
  generatedAt: number
}

export interface DiagnosticsFileSummary {
  filePath: string
  errors: number
  warnings: number
  infos: number
  hints: number
}

export interface DiagnosticsSummary {
  files: DiagnosticsFileSummary[]
  totalErrors: number
  totalWarnings: number
  totalInfos: number
  totalHints: number
  generatedAt: number
}

export interface RecentEditsSummary {
  files: string[]
  generatedAt: number
}

export interface RepoFacts {
  workspaceRoots: string[]
  roots: WorkspaceRootFact[]
  gitDiff: GitDiffSummary
  diagnostics: DiagnosticsSummary
  recentEdits: RecentEditsSummary
}

export interface EditorSelectionRange {
  startLine: number
  startCharacter: number
  endLine: number
  endCharacter: number
}

export interface DirtyBufferSnapshot {
  filePath: string
  language?: string
  content: string
  selection?: EditorSelectionRange
  updatedAt: number
}

export interface LiveIdeState {
  activeFile?: string
  selectedFiles: string[]
  openFiles: string[]
  dirtyFiles: string[]
  dirtyBuffers: DirtyBufferSnapshot[]
  selection?: EditorSelectionRange
  collectedAt: number
}

export interface ContextSelectionReason {
  kind: ContextReasonKind
  weight: number
  detail: string
}

export interface ContextSnippetRange {
  startLine: number
  endLine: number
}

export interface ContextSnippet {
  range: ContextSnippetRange
  source: ContextSnippetSource
  label: string
  content?: string
}

export interface ContextTruncationNote {
  reason: 'budget' | 'deduped' | 'max_lines' | 'binary' | 'omitted'
  detail: string
}

export interface RankedContextFile {
  filePath: string
  score: number
  confidence: ContextConfidence
  reasons: ContextSelectionReason[]
  snippets: ContextSnippet[]
  truncationNotes: ContextTruncationNote[]
}

export interface OmittedContextCandidate {
  filePath: string
  reason: string
}

export interface ContextBudgetSummary {
  estimatedBytes: number
  estimatedTokens: number
  byteLimit?: number
  tokenLimit?: number
  droppedContentNotes: string[]
}

export interface ContextPacketTaskMetadata {
  taskId: string
  goal: string
  mode: OrchestrationMode
  provider: OrchestrationProvider
  verificationProfile: VerificationProfileName
}

export interface ContextPacket {
  version: 1
  id: string
  createdAt: number
  task: ContextPacketTaskMetadata
  repoFacts: RepoFacts
  liveIdeState: LiveIdeState
  files: RankedContextFile[]
  omittedCandidates: OmittedContextCandidate[]
  budget: ContextBudgetSummary
  /** Compressed structural map of the codebase (from context layer). */
  repoMap?: RepoMapSummary
  /** AI-generated summaries for modules relevant to this task (from context layer). */
  moduleSummaries?: ModuleContextSummary[]
}

export interface RepoMapSummary {
  projectName: string
  languages: string[]
  frameworks: string[]
  moduleCount: number
  modules: Array<{
    id: string
    label: string
    rootPath: string
    fileCount: number
    exports: string[]
    recentlyChanged: boolean
  }>
}

export interface ModuleContextSummary {
  moduleId: string
  label: string
  rootPath: string
  description: string
  keyResponsibilities: string[]
  gotchas: string[]
  exports: string[]
}

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
}

export interface ProviderArtifact {
  provider: OrchestrationProvider
  status: ProviderExecutionStatus
  submittedAt: number
  completedAt?: number
  session: ProviderSessionReference
  lastMessage?: string
}

export interface ProviderProgressEvent {
  provider: OrchestrationProvider
  status: ProviderExecutionStatus
  message: string
  session?: ProviderSessionReference
  timestamp: number
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
