/**
 * typesDomain.ts — Re-exports cross-boundary primitive types from shared,
 * plus main-process-only types (repo facts, context reasoning, git diff details).
 *
 * Cross-boundary types (used by renderer/preload) now live in
 * src/shared/types/orchestration.ts. This file re-exports them so existing
 * main-process imports (`from './typesDomain'`) continue to work.
 */

// ─── Cross-boundary types (canonical in shared) ───────────────────────────────
export type {
  ContextBudgetConstraints,
  ContextConfidence,
  ContextReasonKind,
  ContextSnippetSource,
  ConversationMessage,
  DiagnosticMessage,
  DiagnosticsFileSummary,
  DiagnosticsSummary,
  GitDiffFileSummary,
  GitDiffHunk,
  GitDiffSummary,
  NextSuggestedAction,
  OperationResult,
  OrchestrationMode,
  OrchestrationProvider,
  OrchestrationStatus,
  ProviderExecutionStatus,
  RecentCommit,
  RecentEditsSummary,
  RepoFacts,
  TaskRequest,
  TaskRequestContextSelection,
  TaskRequestMetadata,
  TerminalSessionSnapshot,
  VerificationProfileName,
  VerificationRunStatus,
  VerificationStepKind,
  WorkspaceRootFact,
} from '@shared/types/orchestration';

// ─── Main-process-only types ─────────────────────────────────────────────────
// (Not needed by renderer/preload — kept here to avoid moving everything)

// (All domain types cross the boundary; this file is now a re-export barrel)
