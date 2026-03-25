import type { Dispatch, SetStateAction } from 'react';

import type {
  OrchestrationState,
  ProviderProgressEvent,
  TaskMutationResult,
  TaskResult,
  TaskSessionRecord,
  TaskSessionResult,
  TaskSessionsResult,
  VerificationResult,
  VerificationSummary,
} from '../../types/electron';

export function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window && 'orchestration' in window.electronAPI;
}

export function normalizeError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return typeof error === 'string' && error.trim() ? error : fallback;
}

export function sessionMatchesProjectRoot(session: TaskSessionRecord, projectRoot: string | null): boolean {
  return !projectRoot || session.workspaceRoots.includes(projectRoot) || session.request.workspaceRoots.includes(projectRoot);
}

export function sortSessions(sessions: TaskSessionRecord[]): TaskSessionRecord[] {
  return [...sessions].sort((left, right) => right.updatedAt - left.updatedAt);
}

export function mergeSession(sessions: TaskSessionRecord[], nextSession: TaskSessionRecord): TaskSessionRecord[] {
  return sortSessions([...sessions.filter((session) => session.id !== nextSession.id), nextSession]);
}

export function updateSessionsWithResult(sessions: TaskSessionRecord[], result: TaskResult): TaskSessionRecord[] {
  return sortSessions(sessions.map((session) => updateSessionResult(session, result)));
}

function updateSessionResult(session: TaskSessionRecord, result: TaskResult): TaskSessionRecord {
  if (session.id !== result.sessionId) {
    return session;
  }

  return {
    ...session,
    status: result.status,
    updatedAt: Date.now(),
    latestResult: result,
    unresolvedIssues: result.unresolvedIssues,
    nextSuggestedAction: result.nextSuggestedAction,
    lastVerificationSummary: result.verificationSummary ?? session.lastVerificationSummary,
    attempts: patchAttempts(session, result),
  };
}

function patchAttempts(session: TaskSessionRecord, result: TaskResult): TaskSessionRecord['attempts'] {
  const matchingAttemptIndex = result.attemptId ? session.attempts.findIndex((attempt) => attempt.id === result.attemptId) : -1;
  if (matchingAttemptIndex < 0) {
    return session.attempts;
  }

  return session.attempts.map((attempt, index) => index === matchingAttemptIndex ? {
    ...attempt,
    completedAt: attempt.completedAt ?? Date.now(),
    status: result.status,
    contextPacketId: result.contextPacketId ?? attempt.contextPacketId,
    providerArtifact: result.providerArtifact ?? attempt.providerArtifact,
    verificationSummary: result.verificationSummary ?? attempt.verificationSummary,
    diffSummary: result.diffSummary ?? attempt.diffSummary,
    unresolvedIssues: result.unresolvedIssues,
    nextSuggestedAction: result.nextSuggestedAction ?? attempt.nextSuggestedAction,
    resultMessage: result.message ?? attempt.resultMessage,
  } : attempt);
}

export function updateSessionsWithVerification(
  sessions: TaskSessionRecord[],
  sessionId: string | undefined,
  summary: VerificationSummary,
): TaskSessionRecord[] {
  if (!sessionId) {
    return sessions;
  }

  return sortSessions(sessions.map((session) => session.id === sessionId ? { ...session, updatedAt: Date.now(), lastVerificationSummary: summary } : session));
}

function resolvePendingApproval(session: TaskSessionRecord): boolean | undefined {
  return (session.lastVerificationSummary ?? session.latestResult?.verificationSummary)?.requiredApproval;
}

function resolveSessionMessage(session: TaskSessionRecord): string | undefined {
  return session.latestResult?.providerArtifact?.lastMessage ?? session.latestResult?.message;
}

export function deriveStateFromSession(session: TaskSessionRecord | null): OrchestrationState | null {
  if (!session) {
    return null;
  }

  return {
    status: session.status,
    activeTaskId: session.taskId,
    activeSessionId: session.id,
    activeAttemptId: session.latestResult?.attemptId ?? session.attempts.at(-1)?.id,
    provider: session.request.provider,
    verificationProfile: session.request.verificationProfile,
    contextPacketId: session.contextPacket?.id ?? session.latestResult?.contextPacketId,
    message: resolveSessionMessage(session),
    pendingApproval: resolvePendingApproval(session),
    updatedAt: session.updatedAt,
  };
}

export async function loadScopedSessions(projectRoot: string): Promise<{ latestResponse: TaskSessionResult; sessionsResponse: TaskSessionsResult }> {
  const [latestResponse, sessionsResponse] = await Promise.all([
    window.electronAPI.orchestration.loadLatestSession(projectRoot),
    window.electronAPI.orchestration.loadSessions(projectRoot),
  ]);

  return { latestResponse, sessionsResponse };
}

export interface OrchestrationStateStore {
  setSessions: Dispatch<SetStateAction<TaskSessionRecord[]>>;
  setState: Dispatch<SetStateAction<OrchestrationState | null>>;
  setLatestResult: Dispatch<SetStateAction<TaskResult | null>>;
  setLatestVerificationSummary: Dispatch<SetStateAction<VerificationSummary | null>>;
  setSelectedSessionId: Dispatch<SetStateAction<string | null>>;
  setProviderEvent: Dispatch<SetStateAction<ProviderProgressEvent | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setActionError: Dispatch<SetStateAction<string | null>>;
  setActionMessage: Dispatch<SetStateAction<string | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setRefreshing: Dispatch<SetStateAction<boolean>>;
}

function applyResponseState(
  response: TaskMutationResult | VerificationResult | TaskSessionResult,
  store: Pick<OrchestrationStateStore, 'setState'>,
): void {
  if ('state' in response && response.state) {
    store.setState(response.state);
  }
}

function applyResponseSession(
  response: TaskMutationResult | VerificationResult | TaskSessionResult,
  store: Pick<OrchestrationStateStore, 'setSessions' | 'setState' | 'setLatestResult' | 'setLatestVerificationSummary' | 'setSelectedSessionId'>,
): void {
  if (!('session' in response) || !response.session) {
    return;
  }

  const session = response.session as TaskSessionRecord;
  store.setSessions((previous) => mergeSession(previous, session));
  store.setSelectedSessionId(session.id);
  if (!('state' in response && response.state)) {
    store.setState(deriveStateFromSession(session));
  }
  store.setLatestVerificationSummary(session.lastVerificationSummary ?? session.latestResult?.verificationSummary ?? null);
  store.setLatestResult(session.latestResult ?? null);
}

function applyResponseResult(
  response: TaskMutationResult | VerificationResult | TaskSessionResult,
  store: Pick<OrchestrationStateStore, 'setLatestResult' | 'setSessions'>,
): void {
  if (!('result' in response) || !response.result) {
    return;
  }

  store.setLatestResult(response.result);
  store.setSessions((previous) => updateSessionsWithResult(previous, response.result as TaskResult));
}

function applyResponseSummary(
  response: TaskMutationResult | VerificationResult | TaskSessionResult,
  store: Pick<OrchestrationStateStore, 'setLatestVerificationSummary'>,
): void {
  if ('summary' in response && response.summary) {
    store.setLatestVerificationSummary(response.summary as VerificationSummary);
  }
}

export function applyMutationResult(
  response: TaskMutationResult | VerificationResult | TaskSessionResult,
  store: Pick<OrchestrationStateStore, 'setSessions' | 'setState' | 'setLatestResult' | 'setLatestVerificationSummary' | 'setSelectedSessionId'>,
): void {
  applyResponseState(response, store);
  applyResponseSession(response, store);
  applyResponseResult(response, store);
  applyResponseSummary(response, store);
}
