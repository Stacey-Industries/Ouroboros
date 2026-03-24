/**
 * useProviderApiKeysModel.ts — State model for the ProviderApiKeysSection.
 *
 * Manages which API key card is expanded, the current input value, and
 * submission errors. Delegates auth state and actions to useAuth().
 */

import { useCallback, useState } from 'react';

import { useAuth } from '../../hooks/useAuth';
import type { AuthProvider, AuthState } from '../../types/electron';

export interface ProviderApiKeysModel {
  // UI state
  expandedKey: 'anthropic' | 'openai' | null;
  apiKeyInput: string;
  apiKeyError: string | null;

  // UI actions
  expandKey: (provider: 'anthropic' | 'openai') => void;
  collapseKey: () => void;
  setApiKeyInput: (value: string) => void;
  submitKey: (provider: 'anthropic' | 'openai') => Promise<void>;
  removeKey: (provider: 'anthropic' | 'openai') => Promise<void>;

  // Auth state delegation
  getProviderState: (provider: AuthProvider) => AuthState | undefined;
}

function useApiKeysUiState(): {
  expandedKey: 'anthropic' | 'openai' | null;
  setExpandedKey: (v: 'anthropic' | 'openai' | null) => void;
  apiKeyInput: string;
  setApiKeyInput: (v: string) => void;
  apiKeyError: string | null;
  setApiKeyError: (v: string | null) => void;
} {
  const [expandedKey, setExpandedKey] = useState<'anthropic' | 'openai' | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  return {
    expandedKey,
    setExpandedKey,
    apiKeyInput,
    setApiKeyInput,
    apiKeyError,
    setApiKeyError,
  };
}

function useExpandCollapseActions(
  ui: ReturnType<typeof useApiKeysUiState>,
): Pick<ProviderApiKeysModel, 'expandKey' | 'collapseKey'> {
  const expandKey = useCallback(
    (provider: 'anthropic' | 'openai') => {
      ui.setExpandedKey(provider);
      ui.setApiKeyInput('');
      ui.setApiKeyError(null);
    },
    [ui],
  );

  const collapseKey = useCallback(() => {
    ui.setExpandedKey(null);
    ui.setApiKeyInput('');
    ui.setApiKeyError(null);
  }, [ui]);

  return { expandKey, collapseKey };
}

function useSubmitKey(
  ui: ReturnType<typeof useApiKeysUiState>,
  auth: ReturnType<typeof useAuth>,
): (provider: 'anthropic' | 'openai') => Promise<void> {
  return useCallback(
    async (provider: 'anthropic' | 'openai') => {
      const key = ui.apiKeyInput.trim();
      if (!key) {
        ui.setApiKeyError('API key is required');
        return;
      }
      const result = await auth.setApiKey(provider, key);
      if (result.success) {
        ui.setExpandedKey(null);
        ui.setApiKeyInput('');
        ui.setApiKeyError(null);
      } else {
        ui.setApiKeyError(result.error ?? 'Failed to save API key');
      }
    },
    [ui, auth],
  );
}

function useApiKeysActions(
  ui: ReturnType<typeof useApiKeysUiState>,
  auth: ReturnType<typeof useAuth>,
): Pick<ProviderApiKeysModel, 'expandKey' | 'collapseKey' | 'submitKey' | 'removeKey'> {
  const { expandKey, collapseKey } = useExpandCollapseActions(ui);
  const submitKey = useSubmitKey(ui, auth);
  const removeKey = useCallback(
    async (provider: 'anthropic' | 'openai') => {
      await auth.logout(provider);
    },
    [auth],
  );

  return { expandKey, collapseKey, submitKey, removeKey };
}

export function useProviderApiKeysModel(): ProviderApiKeysModel {
  const auth = useAuth();
  const ui = useApiKeysUiState();
  const actions = useApiKeysActions(ui, auth);

  return {
    expandedKey: ui.expandedKey,
    apiKeyInput: ui.apiKeyInput,
    apiKeyError: ui.apiKeyError,
    setApiKeyInput: ui.setApiKeyInput,
    getProviderState: auth.getProviderState,
    ...actions,
  };
}
