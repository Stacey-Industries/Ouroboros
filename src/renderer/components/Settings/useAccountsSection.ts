/**
 * useAccountsSection.ts — Section-specific state wrapping useAuth.
 *
 * Manages which card is expanded, API key input values, copy feedback, etc.
 */

import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../../hooks/useAuth';
import type {
  AuthProvider,
  AuthState,
  CliCredentialDetection,
  GitHubLoginEvent,
} from '../../types/electron';

export interface AccountsSectionModel {
  // Auth state
  states: AuthState[];
  loading: boolean;
  githubLoginEvent: GitHubLoginEvent | null;
  cliDetections: CliCredentialDetection[] | null;
  bannerDismissed: boolean;

  // UI state
  expandedCard: AuthProvider | null;
  apiKeyInput: string;
  apiKeyError: string | null;
  copied: boolean;

  // Auth actions
  login: (provider: AuthProvider) => Promise<void>;
  cancelLogin: (provider: AuthProvider) => Promise<void>;
  logout: (provider: AuthProvider) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  importCliCreds: (provider: AuthProvider) => Promise<{ success: boolean; error?: string }>;
  detectCliCreds: () => Promise<void>;
  getProviderState: (provider: AuthProvider) => AuthState | undefined;

  // UI actions
  expandCard: (provider: AuthProvider) => void;
  collapseCard: () => void;
  setApiKeyInput: (value: string) => void;
  submitApiKey: (provider: AuthProvider) => Promise<void>;
  dismissBanner: () => void;
  copyToClipboard: (text: string) => void;
}

function useAccountsUiState(): {
  expandedCard: AuthProvider | null;
  setExpandedCard: Dispatch<SetStateAction<AuthProvider | null>>;
  apiKeyInput: string;
  setApiKeyInput: Dispatch<SetStateAction<string>>;
  apiKeyError: string | null;
  setApiKeyError: Dispatch<SetStateAction<string | null>>;
  bannerDismissed: boolean;
  setBannerDismissed: Dispatch<SetStateAction<boolean>>;
  copied: boolean;
  setCopied: Dispatch<SetStateAction<boolean>>;
} {
  const [expandedCard, setExpandedCard] = useState<AuthProvider | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  return {
    expandedCard,
    setExpandedCard,
    apiKeyInput,
    setApiKeyInput,
    apiKeyError,
    setApiKeyError,
    bannerDismissed,
    setBannerDismissed,
    copied,
    setCopied,
  };
}

function useSubmitApiKey(
  ui: ReturnType<typeof useAccountsUiState>,
  auth: ReturnType<typeof useAuth>,
): (provider: AuthProvider) => Promise<void> {
  return useCallback(
    async (provider: AuthProvider) => {
      const key = ui.apiKeyInput.trim();
      if (!key) {
        ui.setApiKeyError('API key is required');
        return;
      }
      const result = await auth.setApiKey(provider, key);
      if (result.success) {
        ui.setExpandedCard(null);
        ui.setApiKeyInput('');
      } else {
        ui.setApiKeyError(result.error ?? 'Failed to save API key');
      }
    },
    [ui, auth],
  );
}

function useUiActions(
  ui: ReturnType<typeof useAccountsUiState>,
  auth: ReturnType<typeof useAuth>,
): Pick<
  AccountsSectionModel,
  'expandCard' | 'collapseCard' | 'submitApiKey' | 'dismissBanner' | 'copyToClipboard'
> {
  const expandCard = useCallback(
    (provider: AuthProvider) => {
      ui.setExpandedCard(provider);
      ui.setApiKeyInput('');
      ui.setApiKeyError(null);
    },
    [ui],
  );

  const collapseCard = useCallback(() => {
    ui.setExpandedCard(null);
    ui.setApiKeyInput('');
    ui.setApiKeyError(null);
  }, [ui]);

  const submitApiKey = useSubmitApiKey(ui, auth);

  const dismissBanner = useCallback(() => {
    ui.setBannerDismissed(true);
  }, [ui]);

  const copyToClipboard = useCallback(
    (text: string) => {
      void navigator.clipboard.writeText(text);
      ui.setCopied(true);
    },
    [ui],
  );

  return { expandCard, collapseCard, submitApiKey, dismissBanner, copyToClipboard };
}

function useCopyResetEffect(copied: boolean, setCopied: Dispatch<SetStateAction<boolean>>): void {
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied, setCopied]);
}

function useAutoDetectCliCreds(detectCliCreds: () => Promise<void>): void {
  useEffect(() => {
    void detectCliCreds();
  }, [detectCliCreds]);
}

export function useAccountsSectionModel(): AccountsSectionModel {
  const auth = useAuth();
  const ui = useAccountsUiState();
  const uiActions = useUiActions(ui, auth);

  useCopyResetEffect(ui.copied, ui.setCopied);
  useAutoDetectCliCreds(auth.detectCliCreds);

  return {
    states: auth.states,
    loading: auth.loading,
    githubLoginEvent: auth.githubLoginEvent,
    cliDetections: auth.cliDetections,
    bannerDismissed: ui.bannerDismissed,
    expandedCard: ui.expandedCard,
    apiKeyInput: ui.apiKeyInput,
    apiKeyError: ui.apiKeyError,
    copied: ui.copied,
    login: auth.login,
    cancelLogin: auth.cancelLogin,
    logout: auth.logout,
    openExternal: auth.openExternal,
    importCliCreds: auth.importCliCreds,
    detectCliCreds: auth.detectCliCreds,
    getProviderState: auth.getProviderState,
    setApiKeyInput: ui.setApiKeyInput,
    ...uiActions,
  };
}
