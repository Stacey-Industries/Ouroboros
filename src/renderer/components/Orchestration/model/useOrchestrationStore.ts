import { useState } from 'react';
import type {
  OrchestrationState,
  ProviderProgressEvent,
  TaskResult,
  TaskSessionRecord,
  VerificationSummary,
} from '../../../types/electron';
import type { OrchestrationStateStore } from '../useOrchestrationModel.helpers';
import { buildOrchestrationStore, useStableOrchestrationSetters } from './useOrchestrationStore.parts';

export interface OrchestrationStoreState {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  actionError: string | null;
  actionMessage: string | null;
  state: OrchestrationState | null;
  sessions: TaskSessionRecord[];
  selectedSessionId: string | null;
  providerEvent: ProviderProgressEvent | null;
  latestVerificationSummary: VerificationSummary | null;
  latestResult: TaskResult | null;
}

export interface OrchestrationStore extends OrchestrationStoreState {
  setters: OrchestrationStateStore;
}

function useOrchestrationStateValues(projectRoot: string | null): OrchestrationStoreState & OrchestrationStateStore {
  const [loading, setLoading] = useState(Boolean(projectRoot));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [state, setState] = useState<OrchestrationState | null>(null);
  const [sessions, setSessions] = useState<TaskSessionRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [providerEvent, setProviderEvent] = useState<ProviderProgressEvent | null>(null);
  const [latestVerificationSummary, setLatestVerificationSummary] = useState<VerificationSummary | null>(null);
  const [latestResult, setLatestResult] = useState<TaskResult | null>(null);

  return {
    loading,
    refreshing,
    error,
    actionError,
    actionMessage,
    state,
    sessions,
    selectedSessionId,
    providerEvent,
    latestVerificationSummary,
    latestResult,
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
  };
}

export function useOrchestrationStore(projectRoot: string | null): OrchestrationStore {
  const values = useOrchestrationStateValues(projectRoot);
  const setters = useStableOrchestrationSetters(values);

  return buildOrchestrationStore(values, setters);
}
