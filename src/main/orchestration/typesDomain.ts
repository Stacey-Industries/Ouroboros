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
  | 'test_companion'

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
  /** Model identifier to use for this task (e.g. 'claude-opus-4-6'). When empty, the provider picks its default. */
  model?: string
  /** Effort level for this task ('low' | 'medium' | 'high' | 'max'). When empty, provider default is used. */
  effort?: string
  /** Permission mode override for this task ('default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions'). */
  permissionMode?: string
  contextSelection?: Partial<TaskRequestContextSelection>
  budget?: ContextBudgetConstraints
  resumeFromSessionId?: string
  metadata?: TaskRequestMetadata
  /** Full conversation history for providers that support multi-turn context (e.g. anthropic-api). */
  conversationHistory?: ConversationMessage[]
  /** Image attachments for the current-turn user message (vision). */
  goalAttachments?: import('../agentChat/types').ImageAttachment[]
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

export interface GitDiffHunk {
  startLine: number
  lineCount: number
}

export interface GitDiffFileSummary {
  filePath: string
  additions: number
  deletions: number
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'unknown'
  hunks?: GitDiffHunk[]
}

export interface GitDiffSummary {
  changedFiles: GitDiffFileSummary[]
  totalAdditions: number
  totalDeletions: number
  changedFileCount: number
  comparedAgainst?: string
  currentBranch?: string
  generatedAt: number
}

export interface DiagnosticMessage {
  severity: 'error' | 'warning' | 'info' | 'hint'
  line: number
  character?: number
  message: string
  source?: string
}

export interface DiagnosticsFileSummary {
  filePath: string
  errors: number
  warnings: number
  infos: number
  hints: number
  messages?: DiagnosticMessage[]
}

export interface DiagnosticsSummary {
  files: DiagnosticsFileSummary[]
  totalErrors: number
  totalWarnings: number
  totalInfos: number
  totalHints: number
  generatedAt: number
}

export interface TerminalSessionSnapshot {
  sessionId: string
  lines: string[]
  capturedAt: number
}

export interface RecentEditsSummary {
  files: string[]
  generatedAt: number
}

export interface RecentCommit {
  hash: string
  message: string
  authorDate: string
}

export interface RepoFacts {
  workspaceRoots: string[]
  roots: WorkspaceRootFact[]
  gitDiff: GitDiffSummary
  diagnostics: DiagnosticsSummary
  recentEdits: RecentEditsSummary
  recentCommits?: RecentCommit[]
}
