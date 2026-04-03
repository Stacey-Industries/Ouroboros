/**
 * mcpStoreModel.ts - State management hook for the MCP Server Store.
 *
 * Manages search, pagination, server selection, and install flow
 * against the Official MCP Registry and npm registry via the mcpStore IPC bridge.
 */

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { MCP_SERVERS_CHANGED_EVENT } from '../../hooks/appEventNames';
import type { McpRegistryServer } from '../../types/electron';

const SEARCH_DEBOUNCE_MS = 300;

type McpStoreApi = NonNullable<NonNullable<typeof window.electronAPI>['mcpStore']>;
type McpSearchResult = { success: boolean; error?: string; servers?: McpRegistryServer[]; nextCursor?: string; total?: number };
type McpStatusResult = { success: boolean; error?: string };

export function extractShortName(registryName: string): string {
  const slashIdx = registryName.lastIndexOf('/');
  if (slashIdx >= 0) return registryName.slice(slashIdx + 1);
  const dotIdx = registryName.lastIndexOf('.');
  if (dotIdx >= 0) return registryName.slice(dotIdx + 1);
  return registryName;
}

export type McpStoreSource = 'registry' | 'npm';

export interface McpStoreModel {
  query: string
  source: McpStoreSource
  servers: McpRegistryServer[]
  installedNames: Set<string>
  loading: boolean
  error: string | null
  selectedServer: McpRegistryServer | null
  nextCursor: string | null
  npmTotal: number
  npmOffset: number
  installInProgress: string | null
  setQuery: (q: string) => void
  setSource: (source: McpStoreSource) => void
  search: () => void
  loadMore: () => void
  selectServer: (server: McpRegistryServer) => void
  clearSelection: () => void
  install: (server: McpRegistryServer, scope: 'global' | 'project', envOverrides?: Record<string, string>) => void
  refreshInstalled: () => void
}

function getMcpStoreApi(): McpStoreApi | undefined {
  return window.electronAPI?.mcpStore;
}

function createInstalledNameSet(names: string[]): Set<string> {
  return new Set(names);
}

function applyRegistrySearchResult({
  result,
  append,
  setServers,
  setNextCursor,
  setError,
}: {
  result: McpSearchResult
  append: boolean
  setServers: Dispatch<SetStateAction<McpRegistryServer[]>>
  setNextCursor: (cursor: string | null) => void
  setError: (error: string | null) => void
}): void {
  if (!result.success || !result.servers) {
    setError(result.error ?? 'Failed to search MCP servers');
    return;
  }
  setServers((prev) => (append ? [...prev, ...result.servers!] : result.servers ?? []));
  setNextCursor(result.nextCursor ?? null);
}

function applyNpmSearchResult({
  result,
  append,
  offset,
  setServers,
  setNpmTotal,
  setNpmOffset,
  setError,
}: {
  result: McpSearchResult
  append: boolean
  offset: number
  setServers: Dispatch<SetStateAction<McpRegistryServer[]>>
  setNpmTotal: (total: number) => void
  setNpmOffset: (offset: number) => void
  setError: (error: string | null) => void
}): void {
  if (!result.success || !result.servers) {
    setError(result.error ?? 'Failed to search npm');
    return;
  }
  setServers((prev) => (append ? [...prev, ...result.servers!] : result.servers ?? []));
  setNpmTotal(result.total ?? 0);
  setNpmOffset(offset + result.servers.length);
}

async function runRegistrySearch({
  api,
  query,
  cursor,
  append,
  setLoading,
  setError,
  setServers,
  setNextCursor,
}: {
  api: McpStoreApi | undefined
  query: string
  cursor: string | null
  append: boolean
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setServers: Dispatch<SetStateAction<McpRegistryServer[]>>
  setNextCursor: (cursor: string | null) => void
}): Promise<void> {
  if (!api) return;
  if (!append) setLoading(true);
  setError(null);
  try {
    applyRegistrySearchResult({ result: await api.search(query, cursor ?? undefined), append, setServers, setNextCursor, setError });
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to search MCP servers');
  } finally {
    setLoading(false);
  }
}

async function runNpmSearch({
  api,
  query,
  offset,
  append,
  setLoading,
  setError,
  setServers,
  setNpmTotal,
  setNpmOffset,
}: {
  api: McpStoreApi | undefined
  query: string
  offset: number
  append: boolean
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setServers: Dispatch<SetStateAction<McpRegistryServer[]>>
  setNpmTotal: (total: number) => void
  setNpmOffset: (offset: number) => void
}): Promise<void> {
  if (!api) return;
  if (!append) setLoading(true);
  setError(null);
  try {
    applyNpmSearchResult({ result: await api.searchNpm(query, offset), append, offset, setServers, setNpmTotal, setNpmOffset, setError });
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to search npm');
  } finally {
    setLoading(false);
  }
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
  api: McpStoreApi | undefined
  server: McpRegistryServer
  scope: 'global' | 'project'
  envOverrides?: Record<string, string>
  setInstallInProgress: (name: string | null) => void
  setInstalledNames: Dispatch<SetStateAction<Set<string>>>
  setError: (error: string | null) => void
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
  api: McpStoreApi | undefined
  setInstalledNames: Dispatch<SetStateAction<Set<string>>>
}): Promise<void> {
  if (!api) return;
  try {
    const result = await api.getInstalledServerNames();
    if (result.success && result.names) setInstalledNames(createInstalledNameSet(result.names));
  } catch {
    // Badge state is non-critical.
  }
}

function useMcpStoreSearchState({
  sourceRef,
  setError,
}: {
  sourceRef: MutableRefObject<McpStoreSource>
  setError: (error: string | null) => void
}) {
  const [query, setQueryRaw] = useState(''); const [servers, setServers] = useState<McpRegistryServer[]>([]); const [loading, setLoading] = useState(false); const [nextCursor, setNextCursor] = useState<string | null>(null); const [npmTotal, setNpmTotal] = useState(0); const [npmOffset, setNpmOffset] = useState(0);
  const queryRef = useRef(query); const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null); queryRef.current = query;
  const executeSearch = useCallback((searchQuery: string, append = false, cursor: string | null = null, offset = 0) => { const api = getMcpStoreApi(); if (sourceRef.current === 'npm') { void runNpmSearch({ api, query: searchQuery, offset, append, setLoading, setError, setServers, setNpmTotal, setNpmOffset }); return; } void runRegistrySearch({ api, query: searchQuery, cursor, append, setLoading, setError, setServers, setNextCursor }); }, [setError, sourceRef]);
  const search = useCallback(() => executeSearch(queryRef.current), [executeSearch]);
  const loadMore = useCallback(() => { if (sourceRef.current === 'npm') { executeSearch(queryRef.current, true, null, npmOffset); return; } if (nextCursor) executeSearch(queryRef.current, true, nextCursor); }, [executeSearch, nextCursor, npmOffset, sourceRef]);
  const setQuery = useCallback((nextQuery: string) => { setQueryRaw(nextQuery); queryRef.current = nextQuery; if (debounceRef.current) clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => executeSearch(nextQuery), SEARCH_DEBOUNCE_MS); }, [executeSearch]);
  const resetResults = useCallback(() => { setServers([]); setNextCursor(null); setNpmTotal(0); setNpmOffset(0); setLoading(false); }, []);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);
  return { query, servers, loading, nextCursor, npmTotal, npmOffset, setQuery, search, loadMore, resetResults };
}

function useMcpStoreSelectionState() {
  const [selectedServer, setSelectedServer] = useState<McpRegistryServer | null>(null);
  const selectServer = useCallback((server: McpRegistryServer) => setSelectedServer(server), []);
  const clearSelection = useCallback(() => setSelectedServer(null), []);
  return { selectedServer, selectServer, clearSelection };
}

function useMcpStoreInstallState({
  setError,
}: {
  setError: (error: string | null) => void
}) {
  const [installedNames, setInstalledNames] = useState<Set<string>>(new Set());
  const [installInProgress, setInstallInProgress] = useState<string | null>(null);
  const install = useCallback((server: McpRegistryServer, scope: 'global' | 'project', envOverrides?: Record<string, string>) => {
    void runMcpInstall({ api: getMcpStoreApi(), server, scope, envOverrides, setInstallInProgress, setInstalledNames, setError });
  }, [setError]);
  const refreshInstalled = useCallback(() => {
    void runRefreshInstalled({ api: getMcpStoreApi(), setInstalledNames });
  }, []);
  return { installedNames, installInProgress, install, refreshInstalled };
}

export function useMcpStoreModel(): McpStoreModel {
  const [source, setSourceRaw] = useState<McpStoreSource>('registry');
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const { query, servers, loading, nextCursor, npmTotal, npmOffset, setQuery, search, loadMore, resetResults } = useMcpStoreSearchState({ sourceRef, setError });
  const { selectedServer, selectServer, clearSelection } = useMcpStoreSelectionState();
  const { installedNames, installInProgress, install, refreshInstalled } = useMcpStoreInstallState({ setError });
  const setSource = useCallback((nextSource: McpStoreSource) => {
    setSourceRaw(nextSource);
    sourceRef.current = nextSource;
    resetResults();
    clearSelection();
    setError(null);
    search();
  }, [clearSelection, resetResults, search]);
  useEffect(() => {
    if (!getMcpStoreApi()) {
      setError('MCP Store API not available. Restart the app to load new features.');
      return;
    }
    search();
    refreshInstalled();
  }, [refreshInstalled, search]);
  return { query, source, servers, installedNames, loading, error, selectedServer, nextCursor, npmTotal, npmOffset, installInProgress, setQuery, setSource, search, loadMore, selectServer, clearSelection, install, refreshInstalled };
}
