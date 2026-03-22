/**
 * mcpStoreModel.ts — State management hook for the MCP Server Store.
 *
 * Manages search, pagination, server selection, and install flow
 * against the Official MCP Registry and npm registry via the mcpStore IPC bridge.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { MCP_SERVERS_CHANGED_EVENT } from '../../hooks/appEventNames';
import type { McpRegistryServer } from '../../types/electron';

/** Extract short name from registry name: "io.github.user/server-name" → "server-name" */
export function extractShortName(registryName: string): string {
  const slashIdx = registryName.lastIndexOf('/');
  if (slashIdx >= 0) return registryName.slice(slashIdx + 1);
  const dotIdx = registryName.lastIndexOf('.');
  if (dotIdx >= 0) return registryName.slice(dotIdx + 1);
  return registryName;
}

export type McpStoreSource = 'registry' | 'npm';

export interface McpStoreModel {
  // State
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

  // Actions
  setQuery: (q: string) => void
  setSource: (source: McpStoreSource) => void
  search: () => void
  loadMore: () => void
  selectServer: (server: McpRegistryServer) => void
  clearSelection: () => void
  install: (server: McpRegistryServer, scope: 'global' | 'project', envOverrides?: Record<string, string>) => void
  refreshInstalled: () => void
}

export function useMcpStoreModel(): McpStoreModel {
  const [query, setQueryRaw] = useState('');
  const [source, setSourceRaw] = useState<McpStoreSource>('registry');
  const [servers, setServers] = useState<McpRegistryServer[]>([]);
  const [installedNames, setInstalledNames] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedServer, setSelectedServer] = useState<McpRegistryServer | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [npmTotal, setNpmTotal] = useState(0);
  const [npmOffset, setNpmOffset] = useState(0);
  const [installInProgress, setInstallInProgress] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryRef = useRef(query);
  const sourceRef = useRef(source);
  const npmOffsetRef = useRef(npmOffset);
  queryRef.current = query;
  sourceRef.current = source;
  npmOffsetRef.current = npmOffset;

  // ── Registry Search ────────────────────────────────────────────────
  const executeRegistrySearch = useCallback(async (searchQuery: string, cursor?: string) => {
    if (!window.electronAPI?.mcpStore) return;
    if (!cursor) setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.mcpStore.search(searchQuery, cursor);
      if (result.success && result.servers) {
        if (cursor) {
          setServers((prev) => [...prev, ...result.servers!]);
        } else {
          setServers(result.servers);
        }
        setNextCursor(result.nextCursor ?? null);
      } else {
        setError(result.error ?? 'Failed to search MCP servers');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search MCP servers');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── npm Search ─────────────────────────────────────────────────────
  const executeNpmSearch = useCallback(async (searchQuery: string, offset: number = 0) => {
    if (!window.electronAPI?.mcpStore?.searchNpm) return;
    if (offset === 0) setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.mcpStore.searchNpm(searchQuery, offset);
      if (result.success && result.servers) {
        if (offset > 0) {
          setServers((prev) => [...prev, ...result.servers!]);
        } else {
          setServers(result.servers);
        }
        setNpmTotal(result.total ?? 0);
        setNpmOffset(offset + (result.servers?.length ?? 0));
      } else {
        setError(result.error ?? 'Failed to search npm');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search npm');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Unified search ─────────────────────────────────────────────────
  const executeSearch = useCallback((searchQuery: string) => {
    if (sourceRef.current === 'npm') {
      void executeNpmSearch(searchQuery, 0);
    } else {
      void executeRegistrySearch(searchQuery);
    }
  }, [executeRegistrySearch, executeNpmSearch]);

  const search = useCallback(() => {
    executeSearch(queryRef.current);
  }, [executeSearch]);

  const loadMore = useCallback(() => {
    if (sourceRef.current === 'npm') {
      void executeNpmSearch(queryRef.current, npmOffsetRef.current);
    } else if (nextCursor) {
      void executeRegistrySearch(queryRef.current, nextCursor);
    }
  }, [nextCursor, executeRegistrySearch, executeNpmSearch]);

  // ── Source switching ───────────────────────────────────────────────
  const setSource = useCallback((s: McpStoreSource) => {
    setSourceRaw(s);
    setServers([]);
    setNextCursor(null);
    setNpmOffset(0);
    setNpmTotal(0);
    setSelectedServer(null);
    setError(null);
    // Re-search with current query in new source
    sourceRef.current = s;
    if (s === 'npm') {
      void executeNpmSearch(queryRef.current, 0);
    } else {
      void executeRegistrySearch(queryRef.current);
    }
  }, [executeRegistrySearch, executeNpmSearch]);

  // ── Debounced query setter ──────────────────────────────────────────
  const setQuery = useCallback((q: string) => {
    setQueryRaw(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      executeSearch(q);
    }, 300);
  }, [executeSearch]);

  // ── Selection ───────────────────────────────────────────────────────
  const selectServer = useCallback((server: McpRegistryServer) => {
    setSelectedServer(server);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedServer(null);
  }, []);

  // ── Install ─────────────────────────────────────────────────────────
  const install = useCallback((server: McpRegistryServer, scope: 'global' | 'project', envOverrides?: Record<string, string>) => {
    if (!window.electronAPI?.mcpStore) return;
    setInstallInProgress(server.name);
    setError(null);
    void (async () => {
      try {
        const result = await window.electronAPI.mcpStore.installServer(server, scope, envOverrides);
        if (!result.success) {
          setError(result.error ?? 'Failed to install server');
        } else {
          // Config stores the short name (e.g. "server-name" from "io.github.user/server-name")
          const shortName = extractShortName(server.name);
          setInstalledNames((prev) => new Set([...prev, shortName]));
          // Notify MCP settings section to refresh its server list
          window.dispatchEvent(new CustomEvent(MCP_SERVERS_CHANGED_EVENT));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to install server');
      } finally {
        setInstallInProgress(null);
      }
    })();
  }, []);

  // ── Installed names ─────────────────────────────────────────────────
  const refreshInstalled = useCallback(() => {
    if (!window.electronAPI?.mcpStore) return;
    void (async () => {
      try {
        const result = await window.electronAPI.mcpStore.getInstalledServerNames();
        if (result.success && result.names) {
          setInstalledNames(new Set(result.names));
        }
      } catch {
        // Silently ignore — badge state is non-critical
      }
    })();
  }, []);

  // ── Initial load ────────────────────────────────────────────────────
  useEffect(() => {
    if (!window.electronAPI?.mcpStore) {
      setError('MCP Store API not available. Restart the app to load new features.');
      return;
    }
    void executeRegistrySearch('');
    refreshInstalled();
  }, [executeRegistrySearch, refreshInstalled]);

  // ── Cleanup debounce on unmount ─────────────────────────────────────
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return {
    query,
    source,
    servers,
    installedNames,
    loading,
    error,
    selectedServer,
    nextCursor,
    npmTotal,
    npmOffset,
    installInProgress,
    setQuery,
    setSource,
    search,
    loadMore,
    selectServer,
    clearSelection,
    install,
    refreshInstalled,
  };
}
