/**
 * useAuth.ts — Hook that manages authentication state for all 3 providers.
 *
 * Self-contained: subscribes to IPC events on mount, exposes actions.
 * Used by AccountsSection (a store-style section that bypasses draft system).
 */

import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useState } from 'react';

import type {
  AuthProvider,
  AuthState,
  CliCredentialDetection,
  GitHubLoginEvent,
} from '../types/electron';

export interface UseAuthReturn {
  states: AuthState[];
  cliDetections: CliCredentialDetection[] | null;
  loading: boolean;
  githubLoginEvent: GitHubLoginEvent | null;

  login: (provider: AuthProvider) => Promise<void>;
  cancelLogin: (provider: AuthProvider) => Promise<void>;
  logout: (provider: AuthProvider) => Promise<void>;
  setApiKey: (
    provider: AuthProvider,
    apiKey: string,
  ) => Promise<{ success: boolean; error?: string }>;
  importCliCreds: (provider: AuthProvider) => Promise<{ success: boolean; error?: string }>;
  detectCliCreds: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;

  getProviderState: (provider: AuthProvider) => AuthState | undefined;
}

function hasAuthApi(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.auth;
}

function useAuthState(): {
  states: AuthState[];
  setStates: Dispatch<SetStateAction<AuthState[]>>;
  loading: boolean;
  setLoading: Dispatch<SetStateAction<boolean>>;
  cliDetections: CliCredentialDetection[] | null;
  setCliDetections: Dispatch<SetStateAction<CliCredentialDetection[] | null>>;
  githubLoginEvent: GitHubLoginEvent | null;
  setGithubLoginEvent: Dispatch<SetStateAction<GitHubLoginEvent | null>>;
} {
  const [states, setStates] = useState<AuthState[]>([]);
  const [loading, setLoading] = useState(true);
  const [cliDetections, setCliDetections] = useState<CliCredentialDetection[] | null>(null);
  const [githubLoginEvent, setGithubLoginEvent] = useState<GitHubLoginEvent | null>(null);

  return {
    states,
    setStates,
    loading,
    setLoading,
    cliDetections,
    setCliDetections,
    githubLoginEvent,
    setGithubLoginEvent,
  };
}

function useAuthInit(
  setStates: Dispatch<SetStateAction<AuthState[]>>,
  setLoading: Dispatch<SetStateAction<boolean>>,
  setGithubLoginEvent: Dispatch<SetStateAction<GitHubLoginEvent | null>>,
): void {
  useEffect(() => {
    if (!hasAuthApi()) {
      setLoading(false);
      return;
    }
    void fetchInitialStates(setStates, setLoading);

    const cleanupState = window.electronAPI.auth.onStateChanged(setStates);
    const cleanupLogin = window.electronAPI.auth.onLoginEvent(setGithubLoginEvent);
    return () => {
      cleanupState();
      cleanupLogin();
    };
  }, [setStates, setLoading, setGithubLoginEvent]);
}

async function fetchInitialStates(
  setStates: Dispatch<SetStateAction<AuthState[]>>,
  setLoading: Dispatch<SetStateAction<boolean>>,
): Promise<void> {
  try {
    const result = await window.electronAPI.auth.getStates();
    if (result.success && result.states) setStates(result.states);
  } finally {
    setLoading(false);
  }
}

function useAuthLoginActions(
  setGithubLoginEvent: Dispatch<SetStateAction<GitHubLoginEvent | null>>,
): Pick<UseAuthReturn, 'login' | 'cancelLogin' | 'logout' | 'setApiKey'> {
  const login = useCallback(
    async (provider: AuthProvider) => {
      if (!hasAuthApi()) return;
      setGithubLoginEvent(null);
      await window.electronAPI.auth.startLogin(provider);
    },
    [setGithubLoginEvent],
  );

  const cancelLogin = useCallback(
    async (provider: AuthProvider) => {
      if (!hasAuthApi()) return;
      setGithubLoginEvent(null);
      await window.electronAPI.auth.cancelLogin(provider);
    },
    [setGithubLoginEvent],
  );

  const logout = useCallback(async (provider: AuthProvider) => {
    if (!hasAuthApi()) return;
    await window.electronAPI.auth.logout(provider);
  }, []);

  const setApiKey = useCallback(async (provider: AuthProvider, apiKey: string) => {
    if (!hasAuthApi()) return { success: false, error: 'Auth API unavailable' };
    return window.electronAPI.auth.setApiKey(provider, apiKey);
  }, []);

  return { login, cancelLogin, logout, setApiKey };
}

function useAuthDataActions(
  setCliDetections: Dispatch<SetStateAction<CliCredentialDetection[] | null>>,
  states: AuthState[],
): Pick<UseAuthReturn, 'importCliCreds' | 'detectCliCreds' | 'openExternal' | 'getProviderState'> {
  const importCliCreds = useCallback(async (provider: AuthProvider) => {
    if (!hasAuthApi()) return { success: false, error: 'Auth API unavailable' };
    return window.electronAPI.auth.importCliCreds(provider);
  }, []);

  const detectCliCreds = useCallback(async () => {
    if (!hasAuthApi()) return;
    const result = await window.electronAPI.auth.detectCliCreds();
    if (result.success && result.detections) setCliDetections(result.detections);
  }, [setCliDetections]);

  const openExternal = useCallback(async (url: string) => {
    if (!hasAuthApi()) return;
    await window.electronAPI.auth.openExternal(url);
  }, []);

  const getProviderState = useCallback(
    (provider: AuthProvider) => states.find((s) => s.provider === provider),
    [states],
  );

  return { importCliCreds, detectCliCreds, openExternal, getProviderState };
}

export function useAuth(): UseAuthReturn {
  const state = useAuthState();
  useAuthInit(state.setStates, state.setLoading, state.setGithubLoginEvent);
  const loginActions = useAuthLoginActions(state.setGithubLoginEvent);
  const dataActions = useAuthDataActions(state.setCliDetections, state.states);

  return {
    states: state.states,
    cliDetections: state.cliDetections,
    loading: state.loading,
    githubLoginEvent: state.githubLoginEvent,
    ...loginActions,
    ...dataActions,
  };
}
