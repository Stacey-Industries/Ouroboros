import type {
  OrchestrationStatus,
  ProviderArtifact,
  ProviderExecutionStatus,
  ProviderProgressEvent,
  TaskAttemptRecord,
  TaskResult,
  TaskSessionRecord,
} from './types'

function isTerminalProviderStatus(status: ProviderExecutionStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

function mapProviderExecutionStatus(status: ProviderExecutionStatus): OrchestrationStatus {
  if (status === 'queued') return 'awaiting_provider'
  if (status === 'streaming') return 'applying'
  if (status === 'completed') return 'complete'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'cancelled'
  return 'applying'
}

function resolveProviderSession(
  progress: ProviderProgressEvent,
  existing: ProviderArtifact | undefined,
): ProviderArtifact['session'] {
  return progress.session ?? existing?.session ?? { provider: progress.provider }
}

function resolveProviderSubmittedAt(
  progress: ProviderProgressEvent,
  existing: ProviderArtifact | undefined,
  now: () => number,
): number {
  return existing?.submittedAt ?? progress.timestamp ?? now()
}

function resolveProviderCompletedAt(
  progress: ProviderProgressEvent,
  existing: ProviderArtifact | undefined,
  now: () => number,
): number | undefined {
  if (!isTerminalProviderStatus(progress.status)) {
    return existing?.completedAt
  }

  return existing?.completedAt ?? progress.timestamp ?? now()
}

function buildProviderArtifactFromProgress(
  progress: ProviderProgressEvent,
  existing: ProviderArtifact | undefined,
  now: () => number,
): ProviderArtifact {
  return {
    provider: progress.provider,
    status: progress.status,
    session: resolveProviderSession(progress, existing),
    submittedAt: resolveProviderSubmittedAt(progress, existing, now),
    completedAt: resolveProviderCompletedAt(progress, existing, now),
    lastMessage: progress.message,
  }
}

function updateAttemptWithProviderProgress(
  attempt: TaskAttemptRecord,
  progress: ProviderProgressEvent,
  now: () => number,
): TaskAttemptRecord {
  const status = mapProviderExecutionStatus(progress.status)
  const isTerminal = status === 'complete' || status === 'failed' || status === 'cancelled'
  const completedAt = isTerminal
    ? attempt.completedAt ?? progress.timestamp ?? now()
    : attempt.completedAt
  const unresolvedIssues = status === 'failed' || status === 'cancelled'
    ? Array.from(new Set([...attempt.unresolvedIssues, progress.message]))
    : attempt.unresolvedIssues
  return {
    ...attempt,
    completedAt,
    status,
    providerArtifact: buildProviderArtifactFromProgress(progress, attempt.providerArtifact, now),
    unresolvedIssues,
    resultMessage: progress.message,
  }
}

export function applyProviderProgressToSession(
  session: TaskSessionRecord,
  attemptId: string,
  progress: ProviderProgressEvent,
  now: () => number,
): TaskSessionRecord {
  const status = mapProviderExecutionStatus(progress.status)
  const unresolvedIssues = status === 'failed' || status === 'cancelled'
    ? Array.from(new Set([...session.unresolvedIssues, progress.message]))
    : session.unresolvedIssues
  return {
    ...session,
    status,
    updatedAt: now(),
    providerSession: progress.session ?? session.providerSession,
    attempts: session.attempts.map((attempt) => attempt.id === attemptId
      ? updateAttemptWithProviderProgress(attempt, progress, now)
      : attempt),
    unresolvedIssues,
    nextSuggestedAction: status === 'failed' || status === 'cancelled'
      ? 'retry_task'
      : status === 'complete'
        ? 'review_changes'
        : 'resume_provider',
  }
}

function buildProviderFailureResult(session: TaskSessionRecord, attemptId: string, message: string): TaskResult {
  const attempt = session.attempts.find((entry) => entry.id === attemptId)
  const unresolvedIssues = Array.from(new Set([...(attempt?.unresolvedIssues ?? session.unresolvedIssues), message]))
  return {
    taskId: session.taskId,
    sessionId: session.id,
    attemptId,
    status: 'failed',
    contextPacketId: session.contextPacket?.id ?? attempt?.contextPacketId,
    providerArtifact: attempt?.providerArtifact,
    unresolvedIssues,
    nextSuggestedAction: 'retry_task',
    message,
  }
}

export function applyProviderFailureToSession(
  session: TaskSessionRecord,
  attemptId: string,
  message: string,
  now: () => number,
): TaskSessionRecord {
  const attempts: TaskAttemptRecord[] = session.attempts.map((attempt) => {
    if (attempt.id !== attemptId) {
      return attempt
    }
    const providerArtifact: ProviderArtifact | undefined = attempt.providerArtifact
      ? {
        ...attempt.providerArtifact,
        status: 'failed' as const,
        completedAt: attempt.providerArtifact.completedAt ?? now(),
        lastMessage: message,
      }
      : undefined
    return {
      ...attempt,
      completedAt: attempt.completedAt ?? now(),
      status: 'failed',
      providerArtifact,
      unresolvedIssues: Array.from(new Set([...attempt.unresolvedIssues, message])),
      resultMessage: message,
    }
  })
  const latestResult = buildProviderFailureResult({ ...session, attempts }, attemptId, message)
  return {
    ...session,
    status: 'failed',
    updatedAt: now(),
    attempts,
    latestResult,
    unresolvedIssues: latestResult.unresolvedIssues,
    nextSuggestedAction: 'retry_task',
  }
}
