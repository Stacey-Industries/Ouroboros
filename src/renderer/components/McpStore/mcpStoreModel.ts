/**
 * mcpStoreModel.ts - State management hook for the MCP Server Store.
 *
 * Keeps search, selection, and install state for the MCP registry.
 */

import type { McpRegistryServer } from '../../types/electron';
import { useMcpStoreModelCore } from './mcpStoreModel.helpers';

export function extractShortName(registryName: string): string {
  const slashIdx = registryName.lastIndexOf('/');
  if (slashIdx >= 0) return registryName.slice(slashIdx + 1);
  const dotIdx = registryName.lastIndexOf('.');
  if (dotIdx >= 0) return registryName.slice(dotIdx + 1);
  return registryName;
}

export type McpStoreSource = 'registry' | 'npm';

export interface McpStoreModel {
  query: string;
  source: McpStoreSource;
  servers: McpRegistryServer[];
  installedNames: Set<string>;
  loading: boolean;
  error: string | null;
  selectedServer: McpRegistryServer | null;
  nextCursor: string | null;
  npmTotal: number;
  npmOffset: number;
  installInProgress: string | null;
  setQuery: (q: string) => void;
  setSource: (source: McpStoreSource) => void;
  search: () => void;
  loadMore: () => void;
  selectServer: (server: McpRegistryServer) => void;
  clearSelection: () => void;
  install: (
    server: McpRegistryServer,
    scope: 'global' | 'project',
    envOverrides?: Record<string, string>,
  ) => void;
  refreshInstalled: () => void;
}

export function useMcpStoreModel(): McpStoreModel {
  return useMcpStoreModelCore();
}
