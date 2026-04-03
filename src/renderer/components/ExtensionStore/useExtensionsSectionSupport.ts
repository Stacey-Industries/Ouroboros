import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect } from 'react';

import type { ExtensionInfo } from '../../types/electron';

const ACTION_ERROR_TIMEOUT_MS = 4000;

export interface ExtensionsState {
  actionError: string | null;
  error: string | null;
  extLog: string[];
  extensionsList: ExtensionInfo[];
  isInstalling: boolean;
  isOpening: boolean;
  isSnippetOpen: boolean;
  loading: boolean;
  logLoading: boolean;
  selectedExtension: ExtensionInfo | null;
  selectedExtensionName: string | null;
  setActionError: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setExtLog: Dispatch<SetStateAction<string[]>>;
  setExtensionsList: Dispatch<SetStateAction<ExtensionInfo[]>>;
  setIsInstalling: Dispatch<SetStateAction<boolean>>;
  setIsOpening: Dispatch<SetStateAction<boolean>>;
  setIsSnippetOpen: Dispatch<SetStateAction<boolean>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setLogLoading: Dispatch<SetStateAction<boolean>>;
  setSelectedExtensionName: Dispatch<SetStateAction<string | null>>;
}

export interface ExtensionLoaders {
  fetchExtensions: () => Promise<void>;
  fetchLog: (name: string) => Promise<void>;
}

export interface ExtensionStatusActions {
  forceActivate: (name: string) => Promise<void>;
  toggleExtension: (name: string, currentlyEnabled: boolean) => Promise<void>;
  uninstallExtension: (name: string) => Promise<void>;
}

export interface ExtensionUtilityActions {
  installFromFolder: () => Promise<void>;
  openExtensionsFolder: () => Promise<void>;
  selectExtension: (name: string) => void;
  toggleSnippet: () => void;
}

interface ExtensionsEffectOptions {
  actionError: string | null;
  fetchExtensions: () => Promise<void>;
  fetchLog: (name: string) => Promise<void>;
  selectedExtensionName: string | null;
  setActionError: Dispatch<SetStateAction<string | null>>;
}

export function useExtensionsSideEffects({
  actionError,
  fetchExtensions,
  fetchLog,
  selectedExtensionName,
  setActionError,
}: ExtensionsEffectOptions): void {
  useEffect(() => {
    void fetchExtensions();
  }, [fetchExtensions]);

  useEffect(() => {
    if (selectedExtensionName) {
      void fetchLog(selectedExtensionName);
    }
  }, [fetchLog, selectedExtensionName]);

  useEffect(() => {
    if (!actionError) return undefined;
    const timeoutId = window.setTimeout(() => setActionError(null), ACTION_ERROR_TIMEOUT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [actionError, setActionError]);
}

export function useExtensionStatusActions(
  state: ExtensionsState,
  loaders: ExtensionLoaders,
): ExtensionStatusActions {
  const toggleExtension = useToggleExtensionAction(state, loaders.fetchExtensions);
  const forceActivate = useForceActivateAction(state, loaders);
  const uninstallExtension = useUninstallExtensionAction(state, loaders.fetchExtensions);

  return { forceActivate, toggleExtension, uninstallExtension };
}

export function useExtensionUtilityActions(
  state: ExtensionsState,
  fetchExtensions: () => Promise<void>,
): ExtensionUtilityActions {
  const installFromFolder = useInstallFromFolderAction(state, fetchExtensions);
  const openExtensionsFolder = useOpenExtensionsFolderAction(state);
  const selectExtension = useSelectExtensionAction(state.setSelectedExtensionName);
  const toggleSnippet = useToggleSnippetAction(state.setIsSnippetOpen);

  return { installFromFolder, openExtensionsFolder, selectExtension, toggleSnippet };
}

export function handleExtensionListResult(
  result: { error?: string; extensions?: ExtensionInfo[]; success: boolean },
  setExtensionsList: Dispatch<SetStateAction<ExtensionInfo[]>>,
  setError: Dispatch<SetStateAction<string | null>>,
): void {
  if (result.success && result.extensions) {
    setExtensionsList(result.extensions);
    return;
  }
  setError(result.error ?? 'Failed to list extensions');
}

export function getErrorMessage(errorValue: unknown, fallback: string): string {
  return errorValue instanceof Error ? errorValue.message : fallback;
}

export function hasElectronApi(): boolean {
  return 'electronAPI' in window;
}

function useToggleExtensionAction(
  state: ExtensionsState,
  fetchExtensions: () => Promise<void>,
): (name: string, currentlyEnabled: boolean) => Promise<void> {
  return useCallback(async (name: string, currentlyEnabled: boolean) => {
    if (!hasElectronApi()) return;
    state.setActionError(null);
    try {
      const result = currentlyEnabled
        ? await window.electronAPI.extensions.disable(name)
        : await window.electronAPI.extensions.enable(name);
      if (!result.success) state.setActionError(result.error ?? 'Operation failed');
      await fetchExtensions();
    } catch (errorValue) {
      state.setActionError(getErrorMessage(errorValue, 'Operation failed'));
    }
  }, [fetchExtensions, state]);
}

function useForceActivateAction(
  state: ExtensionsState,
  loaders: ExtensionLoaders,
): (name: string) => Promise<void> {
  return useCallback(async (name: string) => {
    if (!hasElectronApi()) return;
    state.setActionError(null);
    try {
      const result = await window.electronAPI.extensions.activate(name);
      if (!result.success) state.setActionError(result.error ?? 'Failed to activate');
      await loaders.fetchExtensions();
      if (state.selectedExtensionName === name) await loaders.fetchLog(name);
    } catch (errorValue) {
      state.setActionError(getErrorMessage(errorValue, 'Failed to activate'));
    }
  }, [loaders, state]);
}

function useUninstallExtensionAction(
  state: ExtensionsState,
  fetchExtensions: () => Promise<void>,
): (name: string) => Promise<void> {
  return useCallback(async (name: string) => {
    if (!hasElectronApi()) return;
    if (!window.confirm(`Uninstall extension "${name}"? This will delete its files.`)) return;
    state.setActionError(null);
    try {
      const result = await window.electronAPI.extensions.uninstall(name);
      if (!result.success) state.setActionError(result.error ?? 'Failed to uninstall');
      if (state.selectedExtensionName === name) {
        clearSelectedExtension(state.setSelectedExtensionName, state.setExtLog);
      }
      await fetchExtensions();
    } catch (errorValue) {
      state.setActionError(getErrorMessage(errorValue, 'Failed to uninstall'));
    }
  }, [fetchExtensions, state]);
}

function useInstallFromFolderAction(
  state: ExtensionsState,
  fetchExtensions: () => Promise<void>,
): () => Promise<void> {
  return useCallback(async () => {
    if (!hasElectronApi()) return;
    state.setIsInstalling(true);
    state.setActionError(null);
    try {
      const folderResult = await window.electronAPI.files.selectFolder();
      if (!folderResult.success || folderResult.cancelled || !folderResult.path) return;
      const result = await window.electronAPI.extensions.install(folderResult.path);
      if (!result.success) state.setActionError(result.error ?? 'Failed to install extension');
      await fetchExtensions();
    } catch (errorValue) {
      state.setActionError(getErrorMessage(errorValue, 'Failed to install'));
    } finally {
      state.setIsInstalling(false);
    }
  }, [fetchExtensions, state]);
}

function useOpenExtensionsFolderAction(
  state: ExtensionsState,
): () => Promise<void> {
  return useCallback(async () => {
    if (!hasElectronApi()) return;
    state.setIsOpening(true);
    state.setActionError(null);
    try {
      const result = await window.electronAPI.extensions.openFolder();
      if (!result.success) {
        state.setActionError(result.error ?? 'Failed to open extensions folder.');
      }
    } catch (errorValue) {
      state.setActionError(getErrorMessage(errorValue, 'Failed to open extensions folder.'));
    } finally {
      state.setIsOpening(false);
    }
  }, [state]);
}

function useSelectExtensionAction(
  setSelectedExtensionName: Dispatch<SetStateAction<string | null>>,
): (name: string) => void {
  return useCallback((name: string) => {
    setSelectedExtensionName((currentName) => (currentName === name ? null : name));
  }, [setSelectedExtensionName]);
}

function useToggleSnippetAction(
  setIsSnippetOpen: Dispatch<SetStateAction<boolean>>,
): () => void {
  return useCallback(() => {
    setIsSnippetOpen((currentValue) => !currentValue);
  }, [setIsSnippetOpen]);
}

function clearSelectedExtension(
  setSelectedExtensionName: Dispatch<SetStateAction<string | null>>,
  setExtLog: Dispatch<SetStateAction<string[]>>,
): void {
  setSelectedExtensionName(null);
  setExtLog([]);
}
