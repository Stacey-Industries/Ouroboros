/**
 * typesProvider.ts — Provider types, session records, and orchestration API.
 *
 * Cross-boundary types (used by renderer/preload) are re-exported from
 * src/shared/types/orchestration.ts. Main-process-only types (OrchestrationAPI,
 * ProviderCapabilities, ProviderProgressEvent, etc.) remain defined here.
 */

import type { ContextPacket } from './typesContext';
import type {
  OrchestrationProvider,
  ProviderExecutionStatus,
  TaskRequest,
  VerificationProfileName,
} from './typesDomain';

// ─── Cross-boundary types (canonical in shared — re-exported for compat) ─────
export type {
  ContextPacketResult,
  DiffFileSummary,
  DiffSummary,
  NextSuggestedAction,
  OperationResult,
  OrchestrationState,
  ProviderArtifact,
  ProviderSessionReference,
  TaskAttemptRecord,
  TaskMutationResult,
  TaskResult,
  TaskSessionPatch,
  TaskSessionRecord,
  TaskSessionResult,
  TaskSessionsResult,
  VerificationCommandResult,
  VerificationIssue,
  VerificationResult,
  VerificationSummary,
} from '@shared/types/orchestration';

// ─── Main-process-only types ──────────────────────────────────────────────────

export interface ProviderCapabilities {
  provider: OrchestrationProvider;
  supportsStreaming: boolean;
  supportsResume: boolean;
  supportsStructuredEdits: boolean;
  supportsToolUse: boolean;
  supportsContextCaching: boolean;
  maxContextHint: number | null;
  requiresTerminalSession: boolean;
  requiresHookEvents: boolean;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
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
  blockIndex: number;
  /** Type of content block */
  blockType: 'text' | 'thinking' | 'tool_use';
  /** Text delta for text/thinking blocks */
  textDelta?: string;
  /** Tool activity for tool_use blocks */
  toolActivity?: {
    name: string;
    status: 'running' | 'complete';
    toolUseId?: string;
    filePath?: string;
    inputSummary?: string;
    editSummary?: { oldLines: number; newLines: number };
  };
}

export interface ProviderProgressEvent {
  provider: OrchestrationProvider;
  status: ProviderExecutionStatus;
  /** Status text for non-streaming events; text delta for legacy streaming path. */
  message: string;
  session?: import('@shared/types/orchestration').ProviderSessionReference;
  timestamp: number;
  /** Structured content block delta — when present, carries block identity from the API. */
  contentBlock?: ProviderContentBlockDelta;
  /** Cumulative token usage for this request (populated on 'completed' status). */
  tokenUsage?: TokenUsage;
  /** Total cost in USD (populated on 'completed' status). */
  costUsd?: number;
  /** Total duration in milliseconds (populated on 'completed' status). */
  durationMs?: number;
}

export interface VerificationStep {
  id: string;
  label: string;
  kind: import('./typesDomain').VerificationStepKind;
  command?: string;
  requiresApproval: boolean;
  readOnly: boolean;
}

export interface VerificationProfile {
  name: VerificationProfileName;
  label: string;
  description: string;
  steps: VerificationStep[];
  allowsExpensiveSteps: boolean;
  mayRequireApproval: boolean;
}

export interface OrchestrationEventBase<TType extends string> {
  type: TType;
  taskId: string;
  sessionId?: string;
  timestamp: number;
}

export interface OrchestrationStateChangedEvent extends OrchestrationEventBase<'state_changed'> {
  state: import('@shared/types/orchestration').OrchestrationState;
}

export interface OrchestrationProviderProgressEvent extends OrchestrationEventBase<'provider_progress'> {
  progress: ProviderProgressEvent;
}

export interface OrchestrationVerificationUpdatedEvent extends OrchestrationEventBase<'verification_updated'> {
  summary: import('@shared/types/orchestration').VerificationSummary;
}

export interface OrchestrationSessionUpdatedEvent extends OrchestrationEventBase<'session_updated'> {
  session: import('@shared/types/orchestration').TaskSessionRecord;
}

export interface OrchestrationTaskResultEvent extends OrchestrationEventBase<'task_result'> {
  result: import('@shared/types/orchestration').TaskResult;
}

export type OrchestrationEvent =
  | OrchestrationStateChangedEvent
  | OrchestrationProviderProgressEvent
  | OrchestrationVerificationUpdatedEvent
  | OrchestrationSessionUpdatedEvent
  | OrchestrationTaskResultEvent;

export interface OrchestrationAPI {
  createTask: (
    request: TaskRequest,
  ) => Promise<import('@shared/types/orchestration').TaskMutationResult>;
  startTask: (taskId: string) => Promise<import('@shared/types/orchestration').TaskMutationResult>;
  previewContext: (
    request: TaskRequest,
  ) => Promise<import('@shared/types/orchestration').ContextPacketResult>;
  buildContextPacket: (
    request: TaskRequest,
  ) => Promise<import('@shared/types/orchestration').ContextPacketResult>;
  loadSession: (
    sessionId: string,
  ) => Promise<import('@shared/types/orchestration').TaskSessionResult>;
  loadSessions: (
    workspaceRoot?: string,
  ) => Promise<import('@shared/types/orchestration').TaskSessionsResult>;
  loadLatestSession: (
    workspaceRoot?: string,
  ) => Promise<import('@shared/types/orchestration').TaskSessionResult>;
  updateSession: (
    sessionId: string,
    patch: import('@shared/types/orchestration').TaskSessionPatch,
  ) => Promise<import('@shared/types/orchestration').TaskSessionResult>;
  resumeTask: (
    sessionId: string,
  ) => Promise<import('@shared/types/orchestration').TaskMutationResult>;
  rerunVerification: (
    sessionId: string,
    profile?: VerificationProfileName,
  ) => Promise<import('@shared/types/orchestration').VerificationResult>;
  cancelTask: (taskId: string) => Promise<import('@shared/types/orchestration').TaskMutationResult>;
  pauseTask: (taskId: string) => Promise<import('@shared/types/orchestration').TaskMutationResult>;
  onStateChange: (
    callback: (state: import('@shared/types/orchestration').OrchestrationState) => void,
  ) => () => void;
  onProviderEvent: (callback: (event: ProviderProgressEvent) => void) => () => void;
  onVerificationSummary: (
    callback: (summary: import('@shared/types/orchestration').VerificationSummary) => void,
  ) => () => void;
  onSessionUpdate: (
    callback: (session: import('@shared/types/orchestration').TaskSessionRecord) => void,
  ) => () => void;
}

// Keep ContextPacket import available for provider adapter files that reference it
export type { ContextPacket };
