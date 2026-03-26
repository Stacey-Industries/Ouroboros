import { useEffect, useMemo } from 'react';

import type { UseOrchestrationModelReturn } from '../useOrchestrationModel';
import { deriveStateFromSession } from '../useOrchestrationModel.helpers';
import { useSessionSelection, useTaskControlActions } from './useOrchestrationActions';
import { useOrchestrationEvents } from './useOrchestrationEvents';
import { useRefreshSessions } from './useOrchestrationRefresh';
import { useOrchestrationStore } from './useOrchestrationStore';

export function useOrchestrationModelCore(projectRoot: string | null): UseOrchestrationModelReturn {
  const store = useOrchestrationStore(projectRoot);
  const latestSession = useMemo(() => store.sessions[0] ?? null, [store.sessions]);
  const session = useMemo(() => store.selectedSessionId
    ? store.sessions.find((item) => item.id === store.selectedSessionId) ?? latestSession
    : latestSession, [latestSession, store.selectedSessionId, store.sessions]);
  const refresh = useRefreshSessions(projectRoot, store.selectedSessionId, store.setters);
  const selectSession = useSessionSelection(projectRoot, store.setters);
  const actions = useTaskControlActions(store.setters, {
    latestSession,
    session,
    activeTaskId: store.state?.activeTaskId,
  });

  useEffect(() => {
    store.setters.setLoading(Boolean(projectRoot));
    void refresh();
  }, [projectRoot, refresh, store.setters]);

  useOrchestrationEvents(projectRoot, store.setters);

  return {
    loading: store.loading,
    refreshing: store.refreshing,
    error: store.error,
    actionError: store.actionError,
    actionMessage: store.actionMessage,
    state: store.state ?? deriveStateFromSession(session),
    latestSession,
    session,
    sessions: store.sessions,
    selectedSessionId: store.selectedSessionId,
    providerEvent: store.providerEvent,
    verificationSummary: session?.lastVerificationSummary ?? session?.latestResult?.verificationSummary ?? store.latestVerificationSummary,
    latestResult: session?.latestResult ?? store.latestResult,
    refresh,
    selectSession,
    resumeLatest: actions.resumeLatest,
    rerunVerification: actions.rerunVerification,
    pauseActive: actions.pauseActive,
    cancelActive: actions.cancelActive,
  };
}
