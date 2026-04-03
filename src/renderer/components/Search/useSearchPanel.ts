/**
 * useSearchPanel — search state and IPC hook for the project-wide search panel.
 *
 * Debounces 300ms after last keystroke. Uses a request-ID pattern to ignore
 * responses from stale (superseded) requests.
 */

import { useCallback, useRef, useState } from 'react';

import type { SearchOptions, SearchResultItem } from '../../types/electron-runtime-apis';

export interface SearchPanelState {
  query: string;
  options: SearchOptions;
  results: SearchResultItem[];
  groupedResults: Map<string, SearchResultItem[]>;
  isSearching: boolean;
  error: string | null;
  truncated: boolean;
}

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;
const DEFAULT_MAX_RESULTS = 500;

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  isRegex: false,
  caseSensitive: false,
  wholeWord: false,
  maxResults: DEFAULT_MAX_RESULTS,
};

export function buildGroupedResults(results: SearchResultItem[]): Map<string, SearchResultItem[]> {
  const grouped = new Map<string, SearchResultItem[]>();
  for (const item of results) {
    const existing = grouped.get(item.filePath);
    if (existing) {
      existing.push(item);
    } else {
      grouped.set(item.filePath, [item]);
    }
  }
  return grouped;
}

interface UseSearchPanelReturn {
  state: SearchPanelState;
  setQuery: (q: string) => void;
  setOption: <K extends keyof SearchOptions>(key: K, value: SearchOptions[K]) => void;
  setIncludeGlob: (glob: string) => void;
  setExcludeGlob: (glob: string) => void;
  clearResults: () => void;
}

// ── State setter bundle ───────────────────────────────────────────────────────

interface SearchSetters {
  setResults: React.Dispatch<React.SetStateAction<SearchResultItem[]>>;
  setGroupedResults: React.Dispatch<React.SetStateAction<Map<string, SearchResultItem[]>>>;
  setIsSearching: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setTruncated: React.Dispatch<React.SetStateAction<boolean>>;
  setQueryState: React.Dispatch<React.SetStateAction<string>>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function applySearchResponse(
  res: Awaited<ReturnType<typeof window.electronAPI.files.search>>,
  s: SearchSetters,
): void {
  s.setIsSearching(false);
  if (!res.success) {
    s.setError(res.error ?? 'Search failed');
    s.setResults([]);
    s.setGroupedResults(new Map());
    return;
  }
  const items = res.results ?? [];
  s.setResults(items);
  s.setGroupedResults(buildGroupedResults(items));
  s.setTruncated(res.truncated ?? false);
}

function resetSearch(s: Pick<SearchSetters, 'setResults' | 'setGroupedResults' | 'setError' | 'setTruncated' | 'setIsSearching'>): void {
  s.setResults([]);
  s.setGroupedResults(new Map());
  s.setError(null);
  s.setTruncated(false);
  s.setIsSearching(false);
}

// ── useRunSearch ──────────────────────────────────────────────────────────────

function useRunSearch(
  projectRoot: string,
  requestIdRef: React.MutableRefObject<number>,
  s: SearchSetters,
): (q: string, opts: SearchOptions) => void {
  return useCallback((q: string, opts: SearchOptions) => {
    if (q.length < MIN_QUERY_LENGTH || !projectRoot) {
      resetSearch(s);
      return;
    }
    requestIdRef.current += 1;
    const thisId = requestIdRef.current;
    s.setIsSearching(true);
    s.setError(null);
    void window.electronAPI.files.search(projectRoot, q, opts).then((res) => {
      if (thisId !== requestIdRef.current) return;
      applySearchResponse(res, s);
    }).catch((err: unknown) => {
      if (thisId !== requestIdRef.current) return;
      s.setIsSearching(false);
      s.setError(err instanceof Error ? err.message : 'Search failed');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectRoot]);
}

// ── useScheduleSearch ─────────────────────────────────────────────────────────

function useScheduleSearch(
  debounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  runSearch: (q: string, opts: SearchOptions) => void,
): (q: string, opts: SearchOptions) => void {
  return useCallback((q: string, opts: SearchOptions) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      runSearch(q, opts);
    }, DEBOUNCE_MS);
  }, [debounceRef, runSearch]);
}

// ── useGlobSetters ────────────────────────────────────────────────────────────

function useGlobSetters(
  query: string,
  setOptions: React.Dispatch<React.SetStateAction<SearchOptions>>,
  scheduleSearch: (q: string, opts: SearchOptions) => void,
): { setIncludeGlob: (v: string) => void; setExcludeGlob: (v: string) => void } {
  const setIncludeGlob = useCallback((glob: string) => {
    setOptions((prev) => {
      const next = { ...prev, includeGlob: glob || undefined };
      scheduleSearch(query, next);
      return next;
    });
  }, [query, scheduleSearch, setOptions]);

  const setExcludeGlob = useCallback((glob: string) => {
    setOptions((prev) => {
      const next = { ...prev, excludeGlob: glob || undefined };
      scheduleSearch(query, next);
      return next;
    });
  }, [query, scheduleSearch, setOptions]);

  return { setIncludeGlob, setExcludeGlob };
}

// ── Main hook ─────────────────────────────────────────────────────────────────

export function useSearchPanel(projectRoot: string): UseSearchPanelReturn {
  const [query, setQueryState] = useState('');
  const [options, setOptions] = useState<SearchOptions>(DEFAULT_SEARCH_OPTIONS);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [groupedResults, setGroupedResults] = useState<Map<string, SearchResultItem[]>>(new Map());
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const s: SearchSetters = { setResults, setGroupedResults, setIsSearching, setError, setTruncated, setQueryState };

  const runSearch = useRunSearch(projectRoot, requestIdRef, s);
  const scheduleSearch = useScheduleSearch(debounceRef, runSearch);
  const { setIncludeGlob, setExcludeGlob } = useGlobSetters(query, setOptions, scheduleSearch);

  const setQuery = useCallback((q: string) => {
    setQueryState(q);
    scheduleSearch(q, options);
  }, [options, scheduleSearch]);

  const setOption = useCallback(<K extends keyof SearchOptions>(key: K, value: SearchOptions[K]) => {
    setOptions((prev) => {
      const next = { ...prev, [key]: value };
      scheduleSearch(query, next);
      return next;
    });
  }, [query, scheduleSearch]);

  const clearResults = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestIdRef.current += 1;
    setQueryState('');
    resetSearch(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    state: { query, options, results, groupedResults, isSearching, error, truncated },
    setQuery, setOption, setIncludeGlob, setExcludeGlob, clearResults,
  };
}
