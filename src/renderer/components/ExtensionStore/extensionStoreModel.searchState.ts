import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { VsxExtensionSummary } from '../../types/electron';
import type { ExtensionStoreSource } from './extensionStoreModel';
import { getExtensionStoreApi, runExtensionSearch } from './extensionStoreModel.helpers';

type SearchStateArgs = {
  sourceRef: MutableRefObject<ExtensionStoreSource>;
  setError: (error: string | null) => void;
};

type SearchSetters = {
  sourceRef: MutableRefObject<ExtensionStoreSource>;
  setError: (error: string | null) => void;
  setLoading: (v: boolean) => void;
  setExtensions: Dispatch<SetStateAction<VsxExtensionSummary[]>>;
  setTotalSize: (v: number) => void;
  setOffset: (v: number) => void;
};

function useExecuteSearch(setters: SearchSetters) {
  const { sourceRef, setError, setLoading, setExtensions, setTotalSize, setOffset } = setters;
  return useCallback(
    (searchQuery: string, searchCategory: string | null, searchOffset = 0, append = false) => {
      void runExtensionSearch({
        api: getExtensionStoreApi(),
        source: sourceRef.current,
        query: searchQuery,
        category: searchCategory,
        offset: searchOffset,
        append,
        setLoading,
        setError,
        setExtensions,
        setTotalSize,
        setOffset,
      });
    },
    [setError, sourceRef, setLoading, setExtensions, setTotalSize, setOffset],
  );
}

type MutatorArgs = {
  executeSearch: (q: string, cat: string | null, offset?: number, append?: boolean) => void;
  queryRef: MutableRefObject<string>;
  categoryRef: MutableRefObject<string | null>;
  setQueryRaw: (q: string) => void;
  setCategoryFilterRaw: (c: string | null) => void;
  setOffset: (v: number) => void;
  setExtensions: Dispatch<SetStateAction<VsxExtensionSummary[]>>;
  setTotalSize: (v: number) => void;
  setLoading: (v: boolean) => void;
};

function useSearchMutators(args: MutatorArgs) {
  const {
    executeSearch, queryRef, categoryRef,
    setQueryRaw, setCategoryFilterRaw, setOffset,
    setExtensions, setTotalSize, setLoading,
  } = args;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);
  const setQuery = useCallback((nextQuery: string) => {
    setQueryRaw(nextQuery);
    queryRef.current = nextQuery;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => executeSearch(nextQuery, categoryRef.current), 300);
  }, [executeSearch, queryRef, categoryRef, setQueryRaw]);
  const setCategoryFilter = useCallback((nextCategory: string | null) => {
    setCategoryFilterRaw(nextCategory);
    categoryRef.current = nextCategory;
    setOffset(0);
    executeSearch(queryRef.current, nextCategory);
  }, [executeSearch, queryRef, categoryRef, setCategoryFilterRaw, setOffset]);
  const resetResults = useCallback(() => {
    setExtensions([]);
    setTotalSize(0);
    setOffset(0);
    setLoading(false);
  }, [setExtensions, setTotalSize, setOffset, setLoading]);
  return { setQuery, setCategoryFilter, resetResults };
}

export function useExtensionStoreSearchState({ sourceRef, setError }: SearchStateArgs) {
  const [query, setQueryRaw] = useState('');
  const [extensions, setExtensions] = useState<VsxExtensionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalSize, setTotalSize] = useState(0);
  const [offset, setOffset] = useState(0);
  const [categoryFilter, setCategoryFilterRaw] = useState<string | null>(null);
  const queryRef = useRef(query);
  const categoryRef = useRef(categoryFilter);
  queryRef.current = query;
  categoryRef.current = categoryFilter;
  const executeSearch = useExecuteSearch({
    sourceRef, setError, setLoading, setExtensions, setTotalSize, setOffset,
  });
  const search = useCallback(
    () => executeSearch(queryRef.current, categoryRef.current),
    [executeSearch],
  );
  const loadMore = useCallback(() => {
    const next = offset + 20;
    if (next < totalSize) executeSearch(queryRef.current, categoryRef.current, next, true);
  }, [executeSearch, offset, totalSize]);
  const { setQuery, setCategoryFilter, resetResults } = useSearchMutators({
    executeSearch, queryRef, categoryRef,
    setQueryRaw, setCategoryFilterRaw, setOffset,
    setExtensions, setTotalSize, setLoading,
  });
  return {
    query, extensions, loading, totalSize, offset, categoryFilter,
    setQuery, search, loadMore, setCategoryFilter, resetResults,
  };
}
