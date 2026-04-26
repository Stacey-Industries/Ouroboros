import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  FILE_ICON_THEMES_CHANGED_EVENT,
  PRODUCT_ICON_THEMES_CHANGED_EVENT,
  VSX_EXTENSIONS_CHANGED_EVENT,
} from '../../hooks/appEventNames';
import { EXTENSION_THEMES_CHANGED_EVENT } from '../../hooks/useExtensionThemes';
import type {
  InstalledVsxExtension,
  VsxExtensionDetail,
  VsxExtensionSummary,
} from '../../types/electron';
import type { ExtensionStoreSource } from './extensionStoreModel';
import { useExtensionStoreInventoryState } from './extensionStoreModel.inventoryState';
import { useExtensionStoreSearchState } from './extensionStoreModel.searchState';

type ExtensionStoreApi = NonNullable<NonNullable<typeof window.electronAPI>['extensionStore']>;
type ExtensionDetailResult = { success: boolean; error?: string; extension?: VsxExtensionDetail };
type ExtensionInstallResult = {
  success: boolean;
  error?: string;
  installed?: InstalledVsxExtension;
};
type ExtensionStatusResult = { success: boolean; error?: string };
type SearchArgs = {
  api: ExtensionStoreApi | undefined;
  source: ExtensionStoreSource;
  query: string;
  category: string | null;
  offset: number;
  append: boolean;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setExtensions: Dispatch<SetStateAction<VsxExtensionSummary[]>>;
  setTotalSize: (size: number) => void;
  setOffset: (offset: number) => void;
};
type DetailArgs = {
  api: ExtensionStoreApi | undefined;
  source: ExtensionStoreSource;
  namespace: string;
  name: string;
  setSelectedExtension: (extension: VsxExtensionDetail | null) => void;
  setError: (error: string | null) => void;
};
type InstallArgs = {
  api: ExtensionStoreApi | undefined;
  source: ExtensionStoreSource;
  namespace: string;
  name: string;
  setInstallInProgress: (id: string | null) => void;
  setInstalledMap: Dispatch<SetStateAction<Map<string, InstalledVsxExtension>>>;
  setError: (error: string | null) => void;
};
type UninstallArgs = {
  api: ExtensionStoreApi | undefined; id: string;
  setInstalledMap: Dispatch<SetStateAction<Map<string, InstalledVsxExtension>>>;
  setDisabledIds: Dispatch<SetStateAction<Set<string>>>;
  setError: (error: string | null) => void;
};
type ToggleArgs = {
  api: ExtensionStoreApi | undefined; id: string; isDisabled: boolean;
  setDisabledIds: Dispatch<SetStateAction<Set<string>>>;
  setError: (error: string | null) => void;
};
type RefreshArgs = { api: ExtensionStoreApi | undefined; setInstalledMap: Dispatch<SetStateAction<Map<string, InstalledVsxExtension>>>; };

export function getExtensionStoreApi(): ExtensionStoreApi | undefined {
  return window.electronAPI?.extensionStore;
}

export function notifyExtensionChange(): void {
  window.dispatchEvent(new CustomEvent(EXTENSION_THEMES_CHANGED_EVENT));
  window.dispatchEvent(new CustomEvent(FILE_ICON_THEMES_CHANGED_EVENT));
  window.dispatchEvent(new CustomEvent(PRODUCT_ICON_THEMES_CHANGED_EVENT));
  window.dispatchEvent(new CustomEvent(VSX_EXTENSIONS_CHANGED_EVENT));
}

function buildSearchQuery(query: string, category: string | null): string {
  const trimmed = query.trim();
  return [trimmed, category].filter(Boolean).join(' ');
}

function fetchExtensionSearchResult(
  api: ExtensionStoreApi,
  {
    source,
    query,
    category,
    offset,
  }: { source: ExtensionStoreSource; query: string; category: string | null; offset: number },
) {
  return source === 'marketplace'
    ? api.searchMarketplace(query.trim(), offset, category ?? undefined)
    : api.search(buildSearchQuery(query, category), offset);
}

export async function runExtensionSearch(args: SearchArgs): Promise<void> {
  const {
    api, source, query, category, offset, append,
    setLoading, setError, setExtensions, setTotalSize, setOffset,
  } = args;
  if (!api) return;
  if (!append) setLoading(true);
  setError(null);
  try {
    const result = await fetchExtensionSearchResult(api, { source, query, category, offset });
    if (result.success && result.extensions) {
      setExtensions((prev) =>
        append ? [...prev, ...result.extensions!] : (result.extensions ?? []),
      );
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

export async function runExtensionDetails(args: DetailArgs): Promise<void> {
  const { api, source, namespace, name, setSelectedExtension, setError } = args;
  if (!api) return;
  try {
    const result: ExtensionDetailResult =
      source === 'marketplace'
        ? await api.getMarketplaceDetails(namespace, name)
        : await api.getDetails(namespace, name);
    if (result.success && result.extension) setSelectedExtension(result.extension);
    else setError(result.error ?? 'Failed to load extension details');
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to load extension details');
  }
}

export async function runExtensionInstall(args: InstallArgs): Promise<void> {
  const { api, source, namespace, name, setInstallInProgress, setInstalledMap, setError } = args;
  if (!api) return;
  const id = `${namespace}.${name}`;
  setInstallInProgress(id);
  setError(null);
  try {
    const result: ExtensionInstallResult =
      source === 'marketplace'
        ? await api.installMarketplace(namespace, name)
        : await api.install(namespace, name);
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

export async function runExtensionUninstall(args: UninstallArgs): Promise<void> {
  const { api, id, setInstalledMap, setDisabledIds, setError } = args;
  if (!api) return;
  setError(null);
  try {
    const result: ExtensionStatusResult = await api.uninstall(id);
    if (!result.success) {
      setError(result.error ?? 'Failed to uninstall extension');
    } else {
      setInstalledMap((prev) => { const next = new Map(prev); next.delete(id); return next; });
      setDisabledIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      notifyExtensionChange();
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to uninstall extension');
  }
}

export async function runExtensionToggle(args: ToggleArgs): Promise<void> {
  const { api, id, isDisabled, setDisabledIds, setError } = args;
  if (!api) return;
  try {
    const result: ExtensionStatusResult = isDisabled
      ? await api.enableContributions(id)
      : await api.disableContributions(id);
    if (result.success) {
      setDisabledIds((prev) => {
        const next = new Set(prev);
        if (isDisabled) next.delete(id);
        else next.add(id);
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

export async function runRefreshInstalled(args: RefreshArgs): Promise<void> {
  const { api, setInstalledMap } = args;
  if (!api) return;
  try {
    const result = await api.getInstalled();
    if (result.success && result.extensions)
      setInstalledMap(new Map(result.extensions.map((ext) => [ext.id, ext])));
  } catch {
    // Installed badge state is non-critical.
  }
}

// Re-exported from sibling modules — public API preserved for existing callers.
export { useExtensionStoreInventoryState } from './extensionStoreModel.inventoryState';
export { useExtensionStoreSearchState } from './extensionStoreModel.searchState';

export function useExtensionStoreSelectionState({
  sourceRef,
  setError,
}: {
  sourceRef: MutableRefObject<ExtensionStoreSource>;
  setError: (error: string | null) => void;
}) {
  const [selectedExtension, setSelectedExtension] = useState<VsxExtensionDetail | null>(null);
  const selectExtension = useCallback(
    (namespace: string, name: string) => {
      void runExtensionDetails({
        api: getExtensionStoreApi(),
        source: sourceRef.current,
        namespace,
        name,
        setSelectedExtension,
        setError,
      });
    },
    [setError, sourceRef],
  );
  const clearSelection = useCallback(() => setSelectedExtension(null), []);
  return { selectedExtension, selectExtension, clearSelection };
}

export function useExtensionStoreBootstrap({
  search,
  refreshInstalled,
  setError,
}: {
  search: () => void;
  refreshInstalled: () => void;
  setError: (error: string | null) => void;
}): void {
  useEffect(() => {
    if (!getExtensionStoreApi()) {
      setError('Extension Store API not available. Restart the app to load new features.');
      return;
    }
    search();
    refreshInstalled();
  }, [refreshInstalled, search, setError]);
}

type ModelParts = {
  source: ExtensionStoreSource;
  error: string | null;
  searchState: ReturnType<typeof import('./extensionStoreModel.searchState').useExtensionStoreSearchState>;
  selectionState: ReturnType<typeof useExtensionStoreSelectionState>;
  inventoryState: ReturnType<typeof import('./extensionStoreModel.inventoryState').useExtensionStoreInventoryState>;
  setSource: (s: ExtensionStoreSource) => void;
};

function buildExtensionStoreModel(parts: ModelParts): import('./extensionStoreModel').ExtensionStoreModel {
  const { source, error, searchState, selectionState, inventoryState, setSource } = parts;
  return {
    query: searchState.query, source, extensions: searchState.extensions,
    installedMap: inventoryState.installedMap, disabledIds: inventoryState.disabledIds,
    loading: searchState.loading, error, selectedExtension: selectionState.selectedExtension,
    totalSize: searchState.totalSize, offset: searchState.offset,
    installInProgress: inventoryState.installInProgress, categoryFilter: searchState.categoryFilter,
    setQuery: searchState.setQuery, setSource, search: searchState.search,
    loadMore: searchState.loadMore, selectExtension: selectionState.selectExtension,
    clearSelection: selectionState.clearSelection, install: inventoryState.install,
    uninstall: inventoryState.uninstall, toggleEnabled: inventoryState.toggleEnabled,
    refreshInstalled: inventoryState.refreshInstalled, setCategoryFilter: searchState.setCategoryFilter,
  };
}

export function useExtensionStoreModelCore(): import('./extensionStoreModel').ExtensionStoreModel {
  const [source, setSourceRaw] = useState<ExtensionStoreSource>('openvsx');
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const searchState = useExtensionStoreSearchState({ sourceRef, setError });
  const selectionState = useExtensionStoreSelectionState({ sourceRef, setError });
  const inventoryState = useExtensionStoreInventoryState({ sourceRef, setError });
  const setSource = useCallback(
    (nextSource: ExtensionStoreSource) => {
      setSourceRaw(nextSource);
      sourceRef.current = nextSource;
      searchState.resetResults();
      selectionState.clearSelection();
      setError(null);
      searchState.search();
    },
    [searchState, selectionState],
  );
  useExtensionStoreBootstrap({
    search: searchState.search,
    refreshInstalled: inventoryState.refreshInstalled,
    setError,
  });
  return buildExtensionStoreModel({ source, error, searchState, selectionState, inventoryState, setSource });
}
