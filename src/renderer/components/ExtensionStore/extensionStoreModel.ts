/**
 * extensionStoreModel.ts - State management hook for the Extension Store.
 *
 * Keeps search, selection, and install state for the Open VSX store.
 */

import type {
  InstalledVsxExtension,
  VsxExtensionDetail,
  VsxExtensionSummary,
} from '../../types/electron';
import { useExtensionStoreModelCore } from './extensionStoreModel.helpers';

export type ExtensionStoreSource = 'openvsx' | 'marketplace';

export interface ExtensionStoreModel {
  query: string;
  source: ExtensionStoreSource;
  extensions: VsxExtensionSummary[];
  installedMap: Map<string, InstalledVsxExtension>;
  disabledIds: Set<string>;
  loading: boolean;
  error: string | null;
  selectedExtension: VsxExtensionDetail | null;
  totalSize: number;
  offset: number;
  installInProgress: string | null;
  categoryFilter: string | null;
  setQuery: (q: string) => void;
  setSource: (source: ExtensionStoreSource) => void;
  search: () => void;
  loadMore: () => void;
  selectExtension: (ns: string, name: string) => void;
  clearSelection: () => void;
  install: (ns: string, name: string) => void;
  uninstall: (id: string) => void;
  toggleEnabled: (id: string) => void;
  refreshInstalled: () => void;
  setCategoryFilter: (cat: string | null) => void;
}

export function useExtensionStoreModel(): ExtensionStoreModel {
  return useExtensionStoreModelCore();
}
