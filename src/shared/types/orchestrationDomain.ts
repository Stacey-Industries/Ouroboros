/** Orchestration domain primitives and task request types. */

import type { ImageAttachment } from './agentChat';

export type OrchestrationMode = 'plan' | 'edit' | 'review';

export type OrchestrationProvider = 'claude-code' | 'codex' | 'anthropic-api';

export type VerificationProfileName = 'fast' | 'default' | 'full';

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
  | 'paused';

export type ContextReasonKind =
  | 'user_selected'
  | 'pinned'
  | 'included'
  | 'dirty_buffer'
  | 'recent_edit'
  | 'recent_user_edit'
  | 'recent_agent_edit'
  | 'git_diff'
  | 'diagnostic'
  | 'keyword_match'
  | 'import_adjacency'
  | 'dependency'
  | 'test_companion'
  | 'pagerank';

export type ContextConfidence = 'high' | 'medium' | 'low';

export type ContextSnippetSource =
  | 'full_file'
  | 'selection'
  | 'diff_hunk'
  | 'diagnostic'
  | 'manual_pin'
  | 'keyword_match'
  | 'import_adjacency'
  | 'dirty_buffer'
  | 'semantic_chunk';

export type VerificationStepKind = 'command' | 'diagnostics' | 'git';

export type VerificationRunStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'cancelled'
  | 'skipped';

export type ProviderExecutionStatus = 'queued' | 'streaming' | 'completed' | 'failed' | 'cancelled';

export type NextSuggestedAction =
  | 'review_changes'
  | 'rerun_verification'
  | 'resume_provider'
  | 'adjust_context'
  | 'complete_task'
  | 'retry_task';

export interface OperationResult {
  success: boolean;
  error?: string;
}

export interface UserSelectedFileRange {
  path: string;
  startLine?: number;
  endLine?: number;
  symbolType?: string;
}

export interface TaskRequestContextSelection {
  userSelectedFiles: string[];
  userSelectedRanges?: UserSelectedFileRange[];
  pinnedFiles: string[];
  includedFiles: string[];
  excludedFiles: string[];
}

export interface ContextBudgetConstraints {
  maxFiles?: number;
  maxBytes?: number;
  maxTokens?: number;
  maxSnippetsPerFile?: number;
}

export interface TaskRequestMetadata {
  origin: 'panel' | 'command_palette' | 'resume' | 'api';
  label?: string;
  requestedAt?: number;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GitDiffHunk {
  startLine: number;
  lineCount: number;
}

export interface TerminalSessionSnapshot {
  sessionId: string;
  lines: string[];
  capturedAt: number;
}

export interface TaskRequest {
  taskId?: string;
  sessionId?: string;
  workspaceRoots: string[];
  goal: string;
  mode: OrchestrationMode;
  provider: OrchestrationProvider;
  verificationProfile: VerificationProfileName;
  model?: string;
  effort?: string;
  permissionMode?: string;
  contextSelection?: Partial<TaskRequestContextSelection>;
  budget?: ContextBudgetConstraints;
  resumeFromSessionId?: string;
  metadata?: TaskRequestMetadata;
  conversationHistory?: ConversationMessage[];
  goalAttachments?: ImageAttachment[];
  /** Expanded skill body — injected into context, not shown as user message */
  skillExpansion?: string;
  // ── Wave 26 Phase C inference controls (pass-through to provider adapter) ──
  /** Sampling temperature (0.0 – 1.0). Provider ignores if unsupported. */
  temperature?: number;
  /** Maximum output tokens. Provider ignores if unsupported. */
  maxTokens?: number;
  /** Stop sequences. Provider ignores if unsupported. */
  stopSequences?: string[];
  /** Top-p sampling. Provider ignores if unsupported. */
  topP?: number;
  /** Top-k sampling. Provider ignores if unsupported. */
  topK?: number;
  /** JSON schema string for structured output. null disables structured mode. */
  jsonSchema?: string | null;
  /**
   * Wave 26 Phase D — comma-separated tool whitelist for the provider.
   * Empty string = provider default (all tools). Non-empty = restrict to listed tools.
   */
  allowedTools?: string;
}
