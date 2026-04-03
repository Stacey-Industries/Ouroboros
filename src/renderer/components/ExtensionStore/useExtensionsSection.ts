import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useMemo, useState } from 'react';

import type { ExtensionInfo } from '../../types/electron';
import type { Command } from '../CommandPalette/types';
import { useCommandRegistry } from '../CommandPalette/useCommandRegistry';
import {
  type ExtensionLoaders,
  type ExtensionsState,
  getErrorMessage,
  handleExtensionListResult,
  hasElectronApi,
  useExtensionsSideEffects,
  useExtensionStatusActions,
  useExtensionUtilityActions,
} from './useExtensionsSectionSupport';

export interface ExtensionsSectionModel {
  actionError: string | null;
  error: string | null;
  extLog: string[];
  extensionCommands: Command[];
  extensionsList: ExtensionInfo[];
  isInstalling: boolean;
  isOpening: boolean;
  isSnippetOpen: boolean;
  loading: boolean;
  logLoading: boolean;
  selectedExtension: ExtensionInfo | null;
  selectedExtensionName: string | null;
  fetchExtensions: () => Promise<void>;
  fetchLog: (name: string) => Promise<void>;
  forceActivate: (name: string) => Promise<void>;
  installFromFolder: () => Promise<void>;
  openExtensionsFolder: () => Promise<void>;
  selectExtension: (name: string) => void;
  toggleExtension: (name: string, currentlyEnabled: boolean) => Promise<void>;
  toggleSnippet: () => void;
  uninstallExtension: (name: string) => Promise<void>;
}

export function useExtensionsSectionModel(): ExtensionsSectionModel {
  const extensionCommands = useExtensionCommands();
  const state = useExtensionsState();
  const loaders = useExtensionLoaders(state);
  const statusActions = useExtensionStatusActions(state, loaders);
  const utilityActions = useExtensionUtilityActions(state, loaders.fetchExtensions);

  useExtensionsSideEffects({
    actionError: state.actionError,
    fetchExtensions: loaders.fetchExtensions,
    fetchLog: loaders.fetchLog,
    selectedExtensionName: state.selectedExtensionName,
    setActionError: state.setActionError,
  });

  return {
    actionError: state.actionError,
    error: state.error,
    extLog: state.extLog,
    extensionCommands,
    extensionsList: state.extensionsList,
    isInstalling: state.isInstalling,
    isOpening: state.isOpening,
    isSnippetOpen: state.isSnippetOpen,
    loading: state.loading,
    logLoading: state.logLoading,
    selectedExtension: state.selectedExtension,
    selectedExtensionName: state.selectedExtensionName,
    fetchExtensions: loaders.fetchExtensions,
    fetchLog: loaders.fetchLog,
    forceActivate: statusActions.forceActivate,
    installFromFolder: utilityActions.installFromFolder,
    openExtensionsFolder: utilityActions.openExtensionsFolder,
    selectExtension: utilityActions.selectExtension,
    toggleExtension: statusActions.toggleExtension,
    toggleSnippet: utilityActions.toggleSnippet,
    uninstallExtension: statusActions.uninstallExtension,
  };
}

function useExtensionCommands(): Command[] {
  const { commands } = useCommandRegistry();
  return useMemo(
    () => commands.filter((command) => command.category === 'extension'),
    [commands],
  );
}

function useExtensionsState(): ExtensionsState {
  const [extensionsList, setExtensionsList] = useState<ExtensionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedExtensionName, setSelectedExtensionName] = useState<string | null>(null);
  const [extLog, setExtLog] = useState<string[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSnippetOpen, setIsSnippetOpen] = useState(false);
  const selectedExtension = useMemo(
    () => extensionsList.find((extension) => extension.name === selectedExtensionName) ?? null,
    [extensionsList, selectedExtensionName],
  );

  return {
    actionError,
    error,
    extLog,
    extensionsList,
    isInstalling,
    isOpening,
    isSnippetOpen,
    loading,
    logLoading,
    selectedExtension,
    selectedExtensionName,
    setActionError,
    setError,
    setExtLog,
    setExtensionsList,
    setIsInstalling,
    setIsOpening,
    setIsSnippetOpen,
    setLoading,
    setLogLoading,
    setSelectedExtensionName,
  };
}

function useExtensionLoaders(state: ExtensionsState): ExtensionLoaders {
  const fetchExtensions = useFetchExtensions(
    state.setLoading,
    state.setError,
    state.setExtensionsList,
  );
  const fetchLog = useFetchExtensionLog(state.setLogLoading, state.setExtLog);
  return useMemo(() => ({ fetchExtensions, fetchLog }), [fetchExtensions, fetchLog]);
}

function useFetchExtensions(
  setLoading: Dispatch<SetStateAction<boolean>>,
  setError: Dispatch<SetStateAction<string | null>>,
  setExtensionsList: Dispatch<SetStateAction<ExtensionInfo[]>>,
): () => Promise<void> {
  return useCallback(async () => {
    if (!hasElectronApi()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.extensions.list();
      handleExtensionListResult(result, setExtensionsList, setError);
    } catch (errorValue) {
      setError(getErrorMessage(errorValue, 'Failed to list extensions'));
    } finally {
      setLoading(false);
    }
  }, [setError, setExtensionsList, setLoading]);
}

function useFetchExtensionLog(
  setLogLoading: Dispatch<SetStateAction<boolean>>,
  setExtLog: Dispatch<SetStateAction<string[]>>,
): (name: string) => Promise<void> {
  return useCallback(async (name: string) => {
    if (!hasElectronApi()) return;
    setLogLoading(true);
    try {
      const result = await window.electronAPI.extensions.getLog(name);
      setExtLog(result.success && result.log ? result.log : ['Failed to load log.']);
    } catch {
      setExtLog(['Failed to load log.']);
    } finally {
      setLogLoading(false);
    }
  }, [setExtLog, setLogLoading]);
}
