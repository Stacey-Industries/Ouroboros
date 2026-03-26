/**
 * extensionStoreModel.ts - State management hook for the Extension Store.
 *
 * Manages search, pagination, category filtering, extension selection,
 * install/uninstall, and enable/disable flow against the Open VSX registry
 * via the extensionStore IPC bridge.
 */

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { VSX_EXTENSIONS_CHANGED_EVENT } from '../../hooks/appEventNames';
import { EXTENSION_THEMES_CHANGED_EVENT } from '../../hooks/useExtensionThemes';
import type { InstalledVsxExtension, VsxExtensionDetail, VsxExtensionSummary } from '../../types/electron';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

type ExtensionStoreApi = NonNullable<NonNullable<typeof window.electronAPI>['extensionStore']>;
type ExtensionDetailResult = { success: boolean; error?: string; extension?: VsxExtensionDetail };
type ExtensionInstallResult = { success: boolean; error?: string; installed?: InstalledVsxExtension };
type ExtensionStatusResult = { success: boolean; error?: string };
type SearchArgs = { api: ExtensionStoreApi | undefined; source: ExtensionStoreSource; query: string; category: string | null; offset: number; append: boolean; setLoading: (loading: boolean) => void; setError: (error: string | null) => void; setExtensions: Dispatch<SetStateAction<VsxExtensionSummary[]>>; setTotalSize: (size: number) => void; setOffset: (offset: number) => void };
type DetailArgs = { api: ExtensionStoreApi | undefined; source: ExtensionStoreSource; namespace: string; name: string; setSelectedExtension: (extension: VsxExtensionDetail | null) => void; setError: (error: string | null) => void };
type InstallArgs = { api: ExtensionStoreApi | undefined; source: ExtensionStoreSource; namespace: string; name: string; setInstallInProgress: (id: string | null) => void; setInstalledMap: Dispatch<SetStateAction<Map<string, InstalledVsxExtension>>>; setError: (error: string | null) => void };
type UninstallArgs = { api: ExtensionStoreApi | undefined; id: string; setInstalledMap: Dispatch<SetStateAction<Map<string, InstalledVsxExtension>>>; setDisabledIds: Dispatch<SetStateAction<Set<string>>>; setError: (error: string | null) => void };
type ToggleArgs = { api: ExtensionStoreApi | undefined; id: string; isDisabled: boolean; setDisabledIds: Dispatch<SetStateAction<Set<string>>>; setError: (error: string | null) => void };
type RefreshArgs = { api: ExtensionStoreApi | undefined; setInstalledMap: Dispatch<SetStateAction<Map<string, InstalledVsxExtension>>> };
type StoreStateArgs = { sourceRef: MutableRefObject<ExtensionStoreSource>; setError: (error: string | null) => void };

export type ExtensionStoreSource = 'openvsx' | 'marketplace';

export interface ExtensionStoreModel {
  query: string
  source: ExtensionStoreSource
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
  setQuery: (q: string) => void
  setSource: (source: ExtensionStoreSource) => void
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

function getExtensionStoreApi(): ExtensionStoreApi | undefined { return window.electronAPI?.extensionStore; }
function notifyExtensionChange(): void { window.dispatchEvent(new CustomEvent(EXTENSION_THEMES_CHANGED_EVENT)); window.dispatchEvent(new CustomEvent(VSX_EXTENSIONS_CHANGED_EVENT)); }
function buildSearchQuery(query: string, category: string | null): string { const trimmed = query.trim(); return [trimmed, category].filter(Boolean).join(' '); }
function fetchExtensionSearchResult(api: ExtensionStoreApi, { source, query, category, offset }: { source: ExtensionStoreSource; query: string; category: string | null; offset: number }) { return source === 'marketplace' ? api.searchMarketplace(query.trim(), offset, category ?? undefined) : api.search(buildSearchQuery(query, category), offset); }

async function runExtensionSearch(args: SearchArgs): Promise<void> {
  const { api, source, query, category, offset, append, setLoading, setError, setExtensions, setTotalSize, setOffset } = args;
  if (!api) return;
  if (!append) setLoading(true);
  setError(null);
  try {
    const result = await fetchExtensionSearchResult(api, { source, query, category, offset });
    if (result.success && result.extensions) {
      setExtensions((prev) => (append ? [...prev, ...result.extensions!] : result.extensions ?? []));
      setTotalSize(result.totalSize ?? 0);
      setOffset(offset);
    } else {
      setError(result.error ?? 'Failed to search extensions');
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to search extensions');
  } finally {
    setLoading(false);
  }
}

async function runExtensionDetails(args: DetailArgs): Promise<void> {
  const { api, source, namespace, name, setSelectedExtension, setError } = args;
  if (!api) return;
  try {
    const result: ExtensionDetailResult = source === 'marketplace' ? await api.getMarketplaceDetails(namespace, name) : await api.getDetails(namespace, name);
    if (result.success && result.extension) setSelectedExtension(result.extension);
    else setError(result.error ?? 'Failed to load extension details');
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to load extension details');
  }
}

async function runExtensionInstall(args: InstallArgs): Promise<void> {
  const { api, source, namespace, name, setInstallInProgress, setInstalledMap, setError } = args;
  if (!api) return;
  const id = `${namespace}.${name}`;
  setInstallInProgress(id);
  setError(null);
  try {
    const result: ExtensionInstallResult = source === 'marketplace' ? await api.installMarketplace(namespace, name) : await api.install(namespace, name);
    if (!result.success) {
      setError(result.error ?? 'Failed to install extension');
    } else if (result.installed) {
      setInstalledMap((prev) => {
        const next = new Map(prev);
        next.set(result.installed!.id, result.installed!);
        return next;
      });
      notifyExtensionChange();
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to install extension');
  } finally {
    setInstallInProgress(null);
  }
}

async function runExtensionUninstall(args: UninstallArgs): Promise<void> {
  const { api, id, setInstalledMap, setDisabledIds, setError } = args;
  if (!api) return;
  setError(null);
  try {
    const result: ExtensionStatusResult = await api.uninstall(id);
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
      notifyExtensionChange();
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to uninstall extension');
  }
}

async function runExtensionToggle(args: ToggleArgs): Promise<void> {
  const { api, id, isDisabled, setDisabledIds, setError } = args;
  if (!api) return;
  try {
    const result: ExtensionStatusResult = isDisabled ? await api.enableContributions(id) : await api.disableContributions(id);
    if (result.success) {
      setDisabledIds((prev) => {
        const next = new Set(prev);
        if (isDisabled) next.delete(id); else next.add(id);
        return next;
      });
      notifyExtensionChange();
    } else {
      setError(result.error ?? 'Failed to toggle extension');
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to toggle extension');
  }
}

async function runRefreshInstalled(args: RefreshArgs): Promise<void> {
  const { api, setInstalledMap } = args;
  if (!api) return;
  try {
    const result = await api.getInstalled();
    if (result.success && result.extensions) setInstalledMap(new Map(result.extensions.map((ext) => [ext.id, ext])));
  } catch {
    // Installed badge state is non-critical.
  }
}

function useExtensionStoreSearchState({ sourceRef, setError }: StoreStateArgs) {
  const [query, setQueryRaw] = useState('');
  const [extensions, setExtensions] = useState<VsxExtensionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalSize, setTotalSize] = useState(0);
  const [offset, setOffset] = useState(0);
  const [categoryFilter, setCategoryFilterRaw] = useState<string | null>(null);
  const queryRef = useRef(query);
  const categoryRef = useRef(categoryFilter);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  queryRef.current = query; categoryRef.current = categoryFilter;
  const executeSearch = useCallback((searchQuery: string, searchCategory: string | null, searchOffset = 0, append = false) => { void runExtensionSearch({ api: getExtensionStoreApi(), source: sourceRef.current, query: searchQuery, category: searchCategory, offset: searchOffset, append, setLoading, setError, setExtensions, setTotalSize, setOffset }); }, [setError, sourceRef]);
  const search = useCallback(() => executeSearch(queryRef.current, categoryRef.current), [executeSearch]);
  const loadMore = useCallback(() => { const nextOffset = offset + PAGE_SIZE; if (nextOffset < totalSize) executeSearch(queryRef.current, categoryRef.current, nextOffset, true); }, [executeSearch, offset, totalSize]);
  const setQuery = useCallback((nextQuery: string) => { setQueryRaw(nextQuery); queryRef.current = nextQuery; if (debounceRef.current) clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => executeSearch(nextQuery, categoryRef.current), SEARCH_DEBOUNCE_MS); }, [executeSearch]);
  const setCategoryFilter = useCallback((nextCategory: string | null) => { setCategoryFilterRaw(nextCategory); categoryRef.current = nextCategory; setOffset(0); executeSearch(queryRef.current, nextCategory); }, [executeSearch]);
  const resetResults = useCallback(() => { setExtensions([]); setTotalSize(0); setOffset(0); setLoading(false); }, []);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);
  return { query, extensions, loading, totalSize, offset, categoryFilter, setQuery, search, loadMore, setCategoryFilter, resetResults };
}

function useExtensionStoreSelectionState({ sourceRef, setError }: StoreStateArgs) {
  const [selectedExtension, setSelectedExtension] = useState<VsxExtensionDetail | null>(null);
  const selectExtension = useCallback((namespace: string, name: string) => { void runExtensionDetails({ api: getExtensionStoreApi(), source: sourceRef.current, namespace, name, setSelectedExtension, setError }); }, [setError, sourceRef]);
  const clearSelection = useCallback(() => setSelectedExtension(null), []);
  return { selectedExtension, selectExtension, clearSelection };
}

function useExtensionStoreInventoryState({ sourceRef, setError }: StoreStateArgs) {
  const [installedMap, setInstalledMap] = useState<Map<string, InstalledVsxExtension>>(new Map());
  const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());
  const [installInProgress, setInstallInProgress] = useState<string | null>(null);
  const install = useCallback((namespace: string, name: string) => { void runExtensionInstall({ api: getExtensionStoreApi(), source: sourceRef.current, namespace, name, setInstallInProgress, setInstalledMap, setError }); }, [setError, sourceRef]);
  const uninstall = useCallback((id: string) => { void runExtensionUninstall({ api: getExtensionStoreApi(), id, setInstalledMap, setDisabledIds, setError }); }, [setError]);
  const toggleEnabled = useCallback((id: string) => { void runExtensionToggle({ api: getExtensionStoreApi(), id, isDisabled: disabledIds.has(id), setDisabledIds, setError }); }, [disabledIds, setError]);
  const refreshInstalled = useCallback(() => { void runRefreshInstalled({ api: getExtensionStoreApi(), setInstalledMap }); }, []);
  return { installedMap, disabledIds, installInProgress, install, uninstall, toggleEnabled, refreshInstalled };
}

export function useExtensionStoreModel(): ExtensionStoreModel {
  const [source, setSourceRaw] = useState<ExtensionStoreSource>('openvsx');
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const { query, extensions, loading, totalSize, offset, categoryFilter, setQuery, search, loadMore, setCategoryFilter, resetResults } = useExtensionStoreSearchState({ sourceRef, setError });
  const { selectedExtension, selectExtension, clearSelection } = useExtensionStoreSelectionState({ sourceRef, setError });
  const { installedMap, disabledIds, installInProgress, install, uninstall, toggleEnabled, refreshInstalled } = useExtensionStoreInventoryState({ sourceRef, setError });
  const setSource = useCallback((nextSource: ExtensionStoreSource) => { setSourceRaw(nextSource); sourceRef.current = nextSource; resetResults(); clearSelection(); setError(null); search(); }, [clearSelection, resetResults, search]);
  useEffect(() => {
    if (!getExtensionStoreApi()) { setError('Extension Store API not available. Restart the app to load new features.'); return; }
    search();
    refreshInstalled();
  }, [refreshInstalled, search]);
  return { query, source, extensions, installedMap, disabledIds, loading, error, selectedExtension, totalSize, offset, installInProgress, categoryFilter, setQuery, setSource, search, loadMore, selectExtension, clearSelection, install, uninstall, toggleEnabled, refreshInstalled, setCategoryFilter };
}
