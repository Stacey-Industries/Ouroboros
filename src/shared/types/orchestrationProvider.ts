/** Orchestration provider, verification, session, and IPC result types. */

import type { ContextPacket } from './orchestrationContext';
import type {
  NextSuggestedAction,
  OperationResult,
  OrchestrationProvider,
  OrchestrationStatus,
  ProviderExecutionStatus,
  TaskRequest,
  VerificationProfileName,
  VerificationRunStatus,
} from './orchestrationDomain';

export interface OrchestrationState {
  status: OrchestrationStatus;
  activeTaskId?: string;
  activeSessionId?: string;
  activeAttemptId?: string;
  provider?: OrchestrationProvider;
  verificationProfile?: VerificationProfileName;
  contextPacketId?: string;
  message?: string;
  pendingApproval?: boolean;
  updatedAt: number;
}

export interface VerificationIssue {
  filePath?: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface VerificationCommandResult {
  stepId: string;
  status: VerificationRunStatus;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  durationMs?: number;
}

export interface VerificationSummary {
  profile: VerificationProfileName;
  status: VerificationRunStatus;
  startedAt: number;
  completedAt?: number;
  commandResults: VerificationCommandResult[];
  issues: VerificationIssue[];
  summary: string;
  requiredApproval: boolean;
}

export interface ProviderSessionReference {
  provider: OrchestrationProvider;
  sessionId?: string;
  requestId?: string;
  externalTaskId?: string;
  linkedTerminalId?: string;
}

export interface ProviderArtifact {
  provider: OrchestrationProvider;
  status: ProviderExecutionStatus;
  submittedAt: number;
  completedAt?: number;
  session: ProviderSessionReference;
  lastMessage?: string;
}

export interface DiffFileSummary {
  filePath: string;
  additions: number;
  deletions: number;
  summary?: string;
  risk?: 'low' | 'medium' | 'high';
}

export interface DiffSummary {
  files: DiffFileSummary[];
  totalFiles: number;
  totalAdditions: number;
  totalDeletions: number;
  summary: string;
}

export interface TaskResult {
  taskId: string;
  sessionId: string;
  attemptId?: string;
  status: OrchestrationStatus;
  contextPacketId?: string;
  providerArtifact?: ProviderArtifact;
  verificationSummary?: VerificationSummary;
  diffSummary?: DiffSummary;
  unresolvedIssues: string[];
  nextSuggestedAction?: NextSuggestedAction;
  message?: string;
}

export interface TaskAttemptRecord {
  id: string;
  startedAt: number;
  completedAt?: number;
  status: OrchestrationStatus;
  contextPacketId?: string;
  providerArtifact?: ProviderArtifact;
  verificationSummary?: VerificationSummary;
  diffSummary?: DiffSummary;
  unresolvedIssues: string[];
  nextSuggestedAction?: NextSuggestedAction;
  resultMessage?: string;
}

export interface TaskSessionRecord {
  version: 1;
  id: string;
  taskId: string;
  workspaceRoots: string[];
  createdAt: number;
  updatedAt: number;
  request: TaskRequest;
  status: OrchestrationStatus;
  contextPacket?: ContextPacket;
  providerSession?: ProviderSessionReference;
  lastVerificationSummary?: VerificationSummary;
  latestResult?: TaskResult;
  attempts: TaskAttemptRecord[];
  unresolvedIssues: string[];
  nextSuggestedAction?: NextSuggestedAction;
}

export interface TaskSessionPatch {
  status?: OrchestrationStatus;
  contextPacket?: ContextPacket;
  providerSession?: ProviderSessionReference;
  lastVerificationSummary?: VerificationSummary;
  latestResult?: TaskResult;
  unresolvedIssues?: string[];
  nextSuggestedAction?: NextSuggestedAction;
  appendAttempt?: TaskAttemptRecord;
}

export interface ContextPacketResult extends OperationResult {
  packet?: ContextPacket;
}

export interface TaskMutationResult extends OperationResult {
  taskId?: string;
  session?: TaskSessionRecord;
  state?: OrchestrationState;
  result?: TaskResult;
}

export interface TaskSessionResult extends OperationResult {
  session?: TaskSessionRecord;
}

export interface TaskSessionsResult extends OperationResult {
  sessions?: TaskSessionRecord[];
}

export interface VerificationResult extends OperationResult {
  summary?: VerificationSummary;
  session?: TaskSessionRecord;
  state?: OrchestrationState;
}
