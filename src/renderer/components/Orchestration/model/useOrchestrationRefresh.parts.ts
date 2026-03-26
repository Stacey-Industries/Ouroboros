import type { TaskSessionRecord } from '../../../types/electron';
import {
  deriveStateFromSession,
  mergeSession,
  type OrchestrationStateStore,
  sessionMatchesProjectRoot,
  sortSessions,
} from '../useOrchestrationModel.helpers';

export function resetOrchestrationStore(setters: OrchestrationStateStore): void {
  setters.setSessions([]);
  setters.setSelectedSessionId(null);
  setters.setState(null);
  setters.setError(null);
  setters.setProviderEvent(null);
  setters.setLatestVerificationSummary(null);
  setters.setLatestResult(null);
  setters.setLoading(false);
  setters.setRefreshing(false);
}

export function getLatestScopedSession(projectRoot: string, sessions: TaskSessionRecord[], latestResponse: { success: boolean; session?: TaskSessionRecord }): TaskSessionRecord | null {
  return latestResponse.success && latestResponse.session && sessionMatchesProjectRoot(latestResponse.session, projectRoot)
    ? latestResponse.session
    : sessions[0] ?? null;
}

export function getScopedSessionList(projectRoot: string, sessions: TaskSessionRecord[] | undefined, success: boolean): TaskSessionRecord[] {
  return success ? sortSessions((sessions ?? []).filter((item) => sessionMatchesProjectRoot(item, projectRoot))) : [];
}

export function mergeScopedSessions(sessionList: TaskSessionRecord[], latestScopedSession: TaskSessionRecord | null): TaskSessionRecord[] {
  return latestScopedSession ? mergeSession(sessionList, latestScopedSession) : sessionList;
}

export function applyLoadedSessions(
  setters: OrchestrationStateStore,
  sessions: TaskSessionRecord[],
  resolvedSession: TaskSessionRecord | null,
): void {
  setters.setSessions(sessions);
  setters.setSelectedSessionId(resolvedSession?.id ?? null);
  setters.setState(deriveStateFromSession(resolvedSession));
  setters.setLatestVerificationSummary(resolvedSession?.lastVerificationSummary ?? resolvedSession?.latestResult?.verificationSummary ?? null);
  setters.setLatestResult(resolvedSession?.latestResult ?? null);
}

export function hasSessionLoadFailure(latestSuccess: boolean, sessionsSuccess: boolean): boolean {
  return !latestSuccess && !sessionsSuccess;
}
