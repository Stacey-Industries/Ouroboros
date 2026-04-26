import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { McpRegistryServer } from '../../types/electron';
import type { McpStoreSource } from './mcpStoreModel';

const SEARCH_DEBOUNCE_MS = 300;

type McpStoreApi = NonNullable<NonNullable<typeof window.electronAPI>['mcpStore']>;

type McpSearchState = {
  query: string;
  servers: McpRegistryServer[];
  loading: boolean;
  nextCursor: string | null;
  npmTotal: number;
  npmOffset: number;
};

type SearchSetters = {
  setLoading: (v: boolean) => void;
  setError: (error: string | null) => void;
  setServers: Dispatch<SetStateAction<McpRegistryServer[]>>;
  setNextCursor: (cursor: string | null) => void;
  setNpmTotal: (total: number) => void;
  setNpmOffset: (offset: number) => void;
};

type RegistrySearchArgs = Omit<SearchSetters, 'setNpmTotal' | 'setNpmOffset'> & {
  api: McpStoreApi; query: string; cursor: string | null; append: boolean;
};

async function runRegistrySearch(args: RegistrySearchArgs): Promise<void> {
  const { api, query, cursor, append, setLoading, setError, setServers, setNextCursor } = args;
  if (!append) setLoading(true);
  setError(null);
  try {
    const result = await api.search(query, cursor ?? undefined);
    if (!result.success || !result.servers) {
      setError(result.error ?? 'Failed to search MCP servers');
    } else {
      setServers((prev) => (append ? [...prev, ...result.servers!] : (result.servers ?? [])));
      setNextCursor(result.nextCursor ?? null);
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to search MCP servers');
  } finally {
    setLoading(false);
  }
}

type NpmSearchArgs = Omit<SearchSetters, 'setNextCursor'> & {
  api: McpStoreApi; query: string; offset: number; append: boolean;
};

async function runNpmSearch(args: NpmSearchArgs): Promise<void> {
  const { api, query, offset, append, setLoading, setError, setServers, setNpmTotal, setNpmOffset } = args;
  if (!append) setLoading(true);
  setError(null);
  try {
    const result = await api.searchNpm(query, offset);
    if (!result.success || !result.servers) {
      setError(result.error ?? 'Failed to search npm');
    } else {
      setServers((prev) => (append ? [...prev, ...result.servers!] : (result.servers ?? [])));
      setNpmTotal(result.total ?? 0);
      setNpmOffset(offset + result.servers.length);
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to search npm');
  } finally {
    setLoading(false);
  }
}

type UseExecuteSearchArgs = {
  sourceRef: MutableRefObject<McpStoreSource>;
  setError: (error: string | null) => void;
  setLoading: (v: boolean) => void;
  setServers: Dispatch<SetStateAction<McpRegistryServer[]>>;
  setNextCursor: (cursor: string | null) => void;
  setNpmTotal: (total: number) => void;
  setNpmOffset: (offset: number) => void;
};

function useExecuteMcpSearch(args: UseExecuteSearchArgs) {
  const { sourceRef, setError, setLoading, setServers, setNextCursor, setNpmTotal, setNpmOffset } = args;
  return useCallback(
    (searchQuery: string, append = false, cursor: string | null = null, offset = 0) => {
      const api = window.electronAPI?.mcpStore;
      if (!api) return;
      if (sourceRef.current === 'npm') {
        void runNpmSearch({ api, query: searchQuery, offset, append, setLoading, setError, setServers, setNpmTotal, setNpmOffset });
        return;
      }
      void runRegistrySearch({ api, query: searchQuery, cursor, append, setLoading, setError, setServers, setNextCursor });
    },
    [sourceRef, setError, setLoading, setServers, setNextCursor, setNpmTotal, setNpmOffset],
  );
}

type McpSearchStateArgs = {
  sourceRef: MutableRefObject<McpStoreSource>;
  setError: (error: string | null) => void;
};

export function useMcpStoreSearchState({ sourceRef, setError }: McpSearchStateArgs): McpSearchState & {
  setQuery: (q: string) => void;
  search: () => void;
  loadMore: () => void;
  resetResults: () => void;
} {
  const [query, setQueryRaw] = useState('');
  const [servers, setServers] = useState<McpRegistryServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [npmTotal, setNpmTotal] = useState(0);
  const [npmOffset, setNpmOffset] = useState(0);
  const queryRef = useRef(query);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  queryRef.current = query;

  const executeSearch = useExecuteMcpSearch({
    sourceRef, setError, setLoading, setServers, setNextCursor, setNpmTotal, setNpmOffset,
  });

  const search = useCallback(() => executeSearch(queryRef.current), [executeSearch]);
  const loadMore = useCallback(() => {
    if (sourceRef.current === 'npm') { executeSearch(queryRef.current, true, null, npmOffset); return; }
    if (nextCursor) executeSearch(queryRef.current, true, nextCursor);
  }, [executeSearch, nextCursor, npmOffset, sourceRef]);
  const setQuery = useCallback((nextQuery: string) => {
    setQueryRaw(nextQuery);
    queryRef.current = nextQuery;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => executeSearch(nextQuery), SEARCH_DEBOUNCE_MS);
  }, [executeSearch]);
  const resetResults = useCallback(() => {
    setServers([]); setNextCursor(null); setNpmTotal(0); setNpmOffset(0); setLoading(false);
  }, []);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);
  return { query, servers, loading, nextCursor, npmTotal, npmOffset, setQuery, search, loadMore, resetResults };
}
