import { useCallback } from 'react';
import {
  hasElectronAPI,
  loadScopedSessions,
  normalizeError,
  type OrchestrationStateStore,
} from '../useOrchestrationModel.helpers';
import {
  applyLoadedSessions,
  getLatestScopedSession,
  getScopedSessionList,
  hasSessionLoadFailure,
  mergeScopedSessions,
  resetOrchestrationStore,
} from './useOrchestrationRefresh.parts';

function resolveSelectedSession(sessions: ReturnType<typeof mergeScopedSessions>, selectedSessionId: string | null, latestScopedSession: ReturnType<typeof getLatestScopedSession>) {
  if (selectedSessionId) {
    const selectedSession = sessions.find((session) => session.id === selectedSessionId);
    if (selectedSession) {
      return selectedSession;
    }
  }

  return latestScopedSession ?? sessions[0] ?? null;
}

export function useRefreshSessions(
  projectRoot: string | null,
  selectedSessionId: string | null,
  setters: OrchestrationStateStore,
): () => Promise<void> {
  return useCallback(async (): Promise<void> => {
    if (!projectRoot) {
      resetOrchestrationStore(setters);
      return;
    }

    if (!hasElectronAPI()) {
      setters.setError('Orchestration API is unavailable in this renderer.');
      setters.setLoading(false);
      setters.setRefreshing(false);
      return;
    }

    setters.setRefreshing(true);
    setters.setError(null);

    try {
      const { latestResponse, sessionsResponse } = await loadScopedSessions(projectRoot);
      const sessionList = getScopedSessionList(projectRoot, sessionsResponse.sessions, sessionsResponse.success);
      const latestScopedSession = getLatestScopedSession(projectRoot, sessionList, latestResponse);
      const mergedSessions = mergeScopedSessions(sessionList, latestScopedSession);
      const resolvedSession = resolveSelectedSession(mergedSessions, selectedSessionId, latestScopedSession);
      applyLoadedSessions(setters, mergedSessions, resolvedSession);

      if (hasSessionLoadFailure(latestResponse.success, sessionsResponse.success)) {
        setters.setError(latestResponse.error ?? sessionsResponse.error ?? 'Failed to load orchestration sessions.');
      }
    } catch (nextError) {
      setters.setError(normalizeError(nextError, 'Failed to load orchestration sessions.'));
    } finally {
      setters.setLoading(false);
      setters.setRefreshing(false);
    }
  }, [projectRoot, selectedSessionId, setters]);
}
