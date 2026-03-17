/**
 * mcpStoreModel.ts — State management hook for the MCP Server Store.
 *
 * Manages search, pagination, server selection, and install flow
 * against the Official MCP Registry via the mcpStore IPC bridge.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { McpRegistryServer } from '../../types/electron';

export interface McpStoreModel {
  // State
  query: string
  servers: McpRegistryServer[]
  installedNames: Set<string>
  loading: boolean
  error: string | null
  selectedServer: McpRegistryServer | null
  nextCursor: string | null
  installInProgress: string | null

  // Actions
  setQuery: (q: string) => void
  search: () => void
  loadMore: () => void
  selectServer: (server: McpRegistryServer) => void
  clearSelection: () => void
  install: (server: McpRegistryServer, scope: 'global' | 'project') => void
  refreshInstalled: () => void
}

export function useMcpStoreModel(): McpStoreModel {
  const [query, setQueryRaw] = useState('');
  const [servers, setServers] = useState<McpRegistryServer[]>([]);
  const [installedNames, setInstalledNames] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedServer, setSelectedServer] = useState<McpRegistryServer | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [installInProgress, setInstallInProgress] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryRef = useRef(query);
  queryRef.current = query;

  // ── Search ──────────────────────────────────────────────────────────
  const executeSearch = useCallback(async (searchQuery: string, cursor?: string) => {
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

  const search = useCallback(() => {
    void executeSearch(queryRef.current);
  }, [executeSearch]);

  const loadMore = useCallback(() => {
    if (!nextCursor) return;
    void executeSearch(queryRef.current, nextCursor);
  }, [nextCursor, executeSearch]);

  // ── Debounced query setter ──────────────────────────────────────────
  const setQuery = useCallback((q: string) => {
    setQueryRaw(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void executeSearch(q);
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
  const install = useCallback((server: McpRegistryServer, scope: 'global' | 'project') => {
    if (!window.electronAPI?.mcpStore) return;
    setInstallInProgress(server.name);
    setError(null);
    void (async () => {
      try {
        const result = await window.electronAPI.mcpStore.installServer(server, scope);
        if (!result.success) {
          setError(result.error ?? 'Failed to install server');
        } else {
          setInstalledNames((prev) => new Set([...prev, server.name]));
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
    void executeSearch('');
    refreshInstalled();
  }, [executeSearch, refreshInstalled]);

  // ── Cleanup debounce on unmount ─────────────────────────────────────
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return {
    query,
    servers,
    installedNames,
    loading,
    error,
    selectedServer,
    nextCursor,
    installInProgress,
    setQuery,
    search,
    loadMore,
    selectServer,
    clearSelection,
    install,
    refreshInstalled,
  };
}
