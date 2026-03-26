import { useMemo } from 'react';

import type { OrchestrationStateStore } from '../useOrchestrationModel.helpers';
import type { OrchestrationStore, OrchestrationStoreState } from './useOrchestrationStore';

export function buildOrchestrationSetters(setters: OrchestrationStateStore): OrchestrationStateStore {
  return {
    setLoading: setters.setLoading,
    setRefreshing: setters.setRefreshing,
    setError: setters.setError,
    setActionError: setters.setActionError,
    setActionMessage: setters.setActionMessage,
    setState: setters.setState,
    setSessions: setters.setSessions,
    setSelectedSessionId: setters.setSelectedSessionId,
    setProviderEvent: setters.setProviderEvent,
    setLatestVerificationSummary: setters.setLatestVerificationSummary,
    setLatestResult: setters.setLatestResult,
  };
}

export function buildOrchestrationStore(values: OrchestrationStoreState, setters: OrchestrationStateStore): OrchestrationStore {
  return {
    loading: values.loading,
    refreshing: values.refreshing,
    error: values.error,
    actionError: values.actionError,
    actionMessage: values.actionMessage,
    state: values.state,
    sessions: values.sessions,
    selectedSessionId: values.selectedSessionId,
    providerEvent: values.providerEvent,
    latestVerificationSummary: values.latestVerificationSummary,
    latestResult: values.latestResult,
    setters,
  };
}

export function useStableOrchestrationSetters(setters: OrchestrationStateStore): OrchestrationStateStore {
  const {
    setActionError,
    setActionMessage,
    setError,
    setLatestResult,
    setLatestVerificationSummary,
    setLoading,
    setProviderEvent,
    setRefreshing,
    setSelectedSessionId,
    setSessions,
    setState,
  } = setters;
  return useMemo(() => buildOrchestrationSetters({
    setLoading,
    setRefreshing,
    setError,
    setActionError,
    setActionMessage,
    setState,
    setSessions,
    setSelectedSessionId,
    setProviderEvent,
    setLatestVerificationSummary,
    setLatestResult,
  }), [
    setActionError,
    setActionMessage,
    setError,
    setLatestResult,
    setLatestVerificationSummary,
    setLoading,
    setProviderEvent,
    setRefreshing,
    setSelectedSessionId,
    setSessions,
    setState,
  ]);
}
