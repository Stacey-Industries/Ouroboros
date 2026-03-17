/**
 * extensionStoreModel.ts — State management hook for the Extension Store.
 *
 * Manages search, pagination, category filtering, extension selection,
 * install/uninstall, and enable/disable flow against the Open VSX registry
 * via the extensionStore IPC bridge.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  VsxExtensionSummary,
  VsxExtensionDetail,
  InstalledVsxExtension,
} from '../../types/electron';

export interface ExtensionStoreModel {
  // State
  query: string
  extensions: VsxExtensionSummary[]
  installedMap: Map<string, InstalledVsxExtension>
  disabledIds: Set<string>
  loading: boolean
  error: string | null
  selectedExtension: VsxExtensionDetail | null
  totalSize: number
  offset: number
  installInProgress: string | null
  categoryFilter: string | null

  // Actions
  setQuery: (q: string) => void
  search: () => void
  loadMore: () => void
  selectExtension: (ns: string, name: string) => void
  clearSelection: () => void
  install: (ns: string, name: string) => void
  uninstall: (id: string) => void
  toggleEnabled: (id: string) => void
  refreshInstalled: () => void
  setCategoryFilter: (cat: string | null) => void
}

const PAGE_SIZE = 20;

export function useExtensionStoreModel(): ExtensionStoreModel {
  const [query, setQueryRaw] = useState('');
  const [extensions, setExtensions] = useState<VsxExtensionSummary[]>([]);
  const [installedMap, setInstalledMap] = useState<Map<string, InstalledVsxExtension>>(new Map());
  const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedExtension, setSelectedExtension] = useState<VsxExtensionDetail | null>(null);
  const [totalSize, setTotalSize] = useState(0);
  const [offset, setOffset] = useState(0);
  const [installInProgress, setInstallInProgress] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilterRaw] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryRef = useRef(query);
  queryRef.current = query;
  const categoryRef = useRef(categoryFilter);
  categoryRef.current = categoryFilter;

  // ── Build effective search query ────────────────────────────────────
  const buildSearchQuery = useCallback((q: string, cat: string | null): string => {
    const parts: string[] = [];
    if (q.trim()) parts.push(q.trim());
    if (cat) parts.push(cat);
    return parts.join(' ');
  }, []);

  // ── Search ──────────────────────────────────────────────────────────
  const executeSearch = useCallback(async (searchQuery: string, cat: string | null, searchOffset?: number) => {
    if (!window.electronAPI?.extensionStore) return;
    const isLoadMore = searchOffset !== undefined && searchOffset > 0;
    if (!isLoadMore) setLoading(true);
    setError(null);
    try {
      const effectiveQuery = buildSearchQuery(searchQuery, cat);
      const result = await window.electronAPI.extensionStore.search(effectiveQuery, searchOffset ?? 0);
      if (result.success && result.extensions) {
        if (isLoadMore) {
          setExtensions((prev) => [...prev, ...result.extensions!]);
        } else {
          setExtensions(result.extensions);
        }
        setTotalSize(result.totalSize ?? 0);
        setOffset(searchOffset ?? 0);
      } else {
        setError(result.error ?? 'Failed to search extensions');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search extensions');
    } finally {
      setLoading(false);
    }
  }, [buildSearchQuery]);

  const search = useCallback(() => {
    void executeSearch(queryRef.current, categoryRef.current);
  }, [executeSearch]);

  const loadMore = useCallback(() => {
    const nextOffset = offset + PAGE_SIZE;
    if (nextOffset >= totalSize) return;
    void executeSearch(queryRef.current, categoryRef.current, nextOffset);
  }, [offset, totalSize, executeSearch]);

  // ── Debounced query setter ──────────────────────────────────────────
  const setQuery = useCallback((q: string) => {
    setQueryRaw(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setOffset(0);
      void executeSearch(q, categoryRef.current);
    }, 300);
  }, [executeSearch]);

  // ── Category filter ─────────────────────────────────────────────────
  const setCategoryFilter = useCallback((cat: string | null) => {
    setCategoryFilterRaw(cat);
    setOffset(0);
    void executeSearch(queryRef.current, cat);
  }, [executeSearch]);

  // ── Selection ───────────────────────────────────────────────────────
  const selectExtension = useCallback((ns: string, name: string) => {
    if (!window.electronAPI?.extensionStore) return;
    void (async () => {
      try {
        const result = await window.electronAPI.extensionStore.getDetails(ns, name);
        if (result.success && result.extension) {
          setSelectedExtension(result.extension);
        } else {
          setError(result.error ?? 'Failed to load extension details');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load extension details');
      }
    })();
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedExtension(null);
  }, []);

  // ── Install ─────────────────────────────────────────────────────────
  const install = useCallback((ns: string, name: string) => {
    if (!window.electronAPI?.extensionStore) return;
    const id = `${ns}.${name}`;
    setInstallInProgress(id);
    setError(null);
    void (async () => {
      try {
        const result = await window.electronAPI.extensionStore.install(ns, name);
        if (!result.success) {
          setError(result.error ?? 'Failed to install extension');
        } else if (result.installed) {
          setInstalledMap((prev) => {
            const next = new Map(prev);
            next.set(result.installed!.id, result.installed!);
            return next;
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to install extension');
      } finally {
        setInstallInProgress(null);
      }
    })();
  }, []);

  // ── Uninstall ───────────────────────────────────────────────────────
  const uninstall = useCallback((id: string) => {
    if (!window.electronAPI?.extensionStore) return;
    setError(null);
    void (async () => {
      try {
        const result = await window.electronAPI.extensionStore.uninstall(id);
        if (!result.success) {
          setError(result.error ?? 'Failed to uninstall extension');
        } else {
          setInstalledMap((prev) => {
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
          setDisabledIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to uninstall extension');
      }
    })();
  }, []);

  // ── Toggle enabled/disabled ─────────────────────────────────────────
  const toggleEnabled = useCallback((id: string) => {
    if (!window.electronAPI?.extensionStore) return;
    const isDisabled = disabledIds.has(id);
    void (async () => {
      try {
        const result = isDisabled
          ? await window.electronAPI.extensionStore.enableContributions(id)
          : await window.electronAPI.extensionStore.disableContributions(id);
        if (result.success) {
          setDisabledIds((prev) => {
            const next = new Set(prev);
            if (isDisabled) {
              next.delete(id);
            } else {
              next.add(id);
            }
            return next;
          });
        } else {
          setError(result.error ?? 'Failed to toggle extension');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to toggle extension');
      }
    })();
  }, [disabledIds]);

  // ── Refresh installed ───────────────────────────────────────────────
  const refreshInstalled = useCallback(() => {
    if (!window.electronAPI?.extensionStore) return;
    void (async () => {
      try {
        const result = await window.electronAPI.extensionStore.getInstalled();
        if (result.success && result.extensions) {
          const map = new Map<string, InstalledVsxExtension>();
          const disabled = new Set<string>();
          for (const ext of result.extensions) {
            map.set(ext.id, ext);
            // Extensions that were explicitly disabled will be tracked
            // by the main process; for now we populate from the installed list
          }
          setInstalledMap(map);
          // Preserve existing disabled state — main process tracks this
          // and it's already reflected in the current disabledIds
        }
      } catch {
        // Silently ignore — installed badge state is non-critical
      }
    })();
  }, []);

  // ── Initial load ────────────────────────────────────────────────────
  useEffect(() => {
    if (!window.electronAPI?.extensionStore) {
      setError('Extension Store API not available. Restart the app to load new features.');
      return;
    }
    void executeSearch('', null);
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
    extensions,
    installedMap,
    disabledIds,
    loading,
    error,
    selectedExtension,
    totalSize,
    offset,
    installInProgress,
    categoryFilter,
    setQuery,
    search,
    loadMore,
    selectExtension,
    clearSelection,
    install,
    uninstall,
    toggleEnabled,
    refreshInstalled,
    setCategoryFilter,
  };
}
