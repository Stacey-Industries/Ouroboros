import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { MCP_SERVERS_CHANGED_EVENT } from '../../hooks/appEventNames';
import type { McpRegistryServer } from '../../types/electron';
import { extractShortName, type McpStoreSource } from './mcpStoreModel';
import { useMcpStoreSearchState } from './mcpStoreModel.searchState';

type McpStoreApi = NonNullable<NonNullable<typeof window.electronAPI>['mcpStore']>;
type McpStatusResult = { success: boolean; error?: string };

function createInstalledNameSet(names: string[]): Set<string> {
  return new Set(names);
}

async function runMcpInstall({
  api,
  server,
  scope,
  envOverrides,
  setInstallInProgress,
  setInstalledNames,
  setError,
}: {
  api: McpStoreApi | undefined;
  server: McpRegistryServer;
  scope: 'global' | 'project';
  envOverrides?: Record<string, string>;
  setInstallInProgress: (name: string | null) => void;
  setInstalledNames: Dispatch<SetStateAction<Set<string>>>;
  setError: (error: string | null) => void;
}): Promise<void> {
  if (!api) return;
  setInstallInProgress(server.name);
  setError(null);
  try {
    const result: McpStatusResult = await api.installServer(server, scope, envOverrides);
    if (!result.success) setError(result.error ?? 'Failed to install server');
    else {
      setInstalledNames((prev) => {
        const next = new Set(prev);
        next.add(extractShortName(server.name));
        return next;
      });
      window.dispatchEvent(new CustomEvent(MCP_SERVERS_CHANGED_EVENT));
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to install server');
  } finally {
    setInstallInProgress(null);
  }
}

async function runRefreshInstalled({
  api,
  setInstalledNames,
}: {
  api: McpStoreApi | undefined;
  setInstalledNames: Dispatch<SetStateAction<Set<string>>>;
}): Promise<void> {
  if (!api) return;
  try {
    const result = await api.getInstalledServerNames();
    if (result.success && result.names) setInstalledNames(createInstalledNameSet(result.names));
  } catch {
    // Badge state is non-critical.
  }
}

export { useMcpStoreSearchState } from './mcpStoreModel.searchState';

export function useMcpStoreSelectionState() {
  const [selectedServer, setSelectedServer] = useState<McpRegistryServer | null>(null);
  const selectServer = useCallback((server: McpRegistryServer) => setSelectedServer(server), []);
  const clearSelection = useCallback(() => setSelectedServer(null), []);
  return { selectedServer, selectServer, clearSelection };
}

export function useMcpStoreInstallState({ setError }: { setError: (error: string | null) => void }) {
  const [installedNames, setInstalledNames] = useState<Set<string>>(new Set());
  const [installInProgress, setInstallInProgress] = useState<string | null>(null);
  const install = useCallback(
    (
      server: McpRegistryServer,
      scope: 'global' | 'project',
      envOverrides?: Record<string, string>,
    ) => {
      void runMcpInstall({
        api: getMcpStoreApi(),
        server,
        scope,
        envOverrides,
        setInstallInProgress,
        setInstalledNames,
        setError,
      });
    },
    [setError],
  );
  const refreshInstalled = useCallback(() => {
    void runRefreshInstalled({ api: getMcpStoreApi(), setInstalledNames });
  }, []);
  return { installedNames, installInProgress, install, refreshInstalled };
}

export function useMcpStoreBootstrap({
  search,
  refreshInstalled,
  setError,
}: {
  search: () => void;
  refreshInstalled: () => void;
  setError: (error: string | null) => void;
}): void {
  useEffect(() => {
    if (!getMcpStoreApi()) {
      setError('MCP Store API not available. Restart the app to load new features.');
      return;
    }
    search();
    refreshInstalled();
  }, [refreshInstalled, search, setError]);
}

type ModelParts = {
  source: McpStoreSource; error: string | null;
  searchState: ReturnType<typeof useMcpStoreSearchState>;
  selectionState: ReturnType<typeof useMcpStoreSelectionState>;
  installState: ReturnType<typeof useMcpStoreInstallState>;
  setSource: (s: McpStoreSource) => void;
};

function buildMcpStoreModel(parts: ModelParts): import('./mcpStoreModel').McpStoreModel {
  const { source, error, searchState, selectionState, installState, setSource } = parts;
  return {
    query: searchState.query, source, servers: searchState.servers,
    installedNames: installState.installedNames, loading: searchState.loading, error,
    selectedServer: selectionState.selectedServer, nextCursor: searchState.nextCursor,
    npmTotal: searchState.npmTotal, npmOffset: searchState.npmOffset,
    installInProgress: installState.installInProgress,
    setQuery: searchState.setQuery, setSource, search: searchState.search,
    loadMore: searchState.loadMore, selectServer: selectionState.selectServer,
    clearSelection: selectionState.clearSelection, install: installState.install,
    refreshInstalled: installState.refreshInstalled,
  };
}

export function useMcpStoreModelCore(): import('./mcpStoreModel').McpStoreModel {
  const [source, setSourceRaw] = useState<McpStoreSource>('registry');
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const searchState = useMcpStoreSearchState({ sourceRef, setError });
  const selectionState = useMcpStoreSelectionState();
  const installState = useMcpStoreInstallState({ setError });
  const setSource = useCallback((nextSource: McpStoreSource) => {
    setSourceRaw(nextSource);
    sourceRef.current = nextSource;
    searchState.resetResults();
    selectionState.clearSelection();
    setError(null);
    searchState.search();
  }, [searchState, selectionState]);
  useMcpStoreBootstrap({ search: searchState.search, refreshInstalled: installState.refreshInstalled, setError });
  return buildMcpStoreModel({ source, error, searchState, selectionState, installState, setSource });
}

function getMcpStoreApi(): McpStoreApi | undefined {
  return window.electronAPI?.mcpStore;
}
