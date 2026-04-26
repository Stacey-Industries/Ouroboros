/**
 * ThreadSearch.tsx — Debounced full-text search UI over chat threads.
 *
 * Renders a controlled input with 200ms debounce. Results show title-or-snippet,
 * tags, and timestamp. Clicking a result dispatches agent-ide:open-thread with
 * { threadId, messageId } — the listener is added in a later phase.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { AgentChatSearchResult } from '../../types/electron-agent-chat.d';
import { dispatchOpenThread, ThreadSearchBody } from './ThreadSearch.parts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ThreadSearchProps {
  onClose?: () => void;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

interface SearchState {
  query: string;
  results: AgentChatSearchResult[];
  hasMore: boolean;
  loading: boolean;
  selectedIdx: number;
}

function useSearchRunner(
  setState: React.Dispatch<React.SetStateAction<SearchState>>,
): (q: string) => void {
  const reqIdRef = useRef(0);
  return useCallback(
    (q: string) => {
      if (!q.trim()) {
        setState((s) => ({ ...s, results: [], hasMore: false, loading: false }));
        return;
      }
      const id = ++reqIdRef.current;
      setState((s) => ({ ...s, loading: true }));
      void window.electronAPI.agentChat
        .searchThreads({ query: q, limit: 30 })
        .then((res) => {
          if (reqIdRef.current !== id) return;
          setState((s) => ({
            ...s,
            results: res.results ?? [],
            hasMore: res.hasMore ?? false,
            selectedIdx: 0,
          }));
        })
        .catch(() => {
          if (reqIdRef.current !== id) return;
          setState((s) => ({ ...s, results: [], hasMore: false }));
        })
        .finally(() => {
          if (reqIdRef.current === id) setState((s) => ({ ...s, loading: false }));
        });
    },
    [setState],
  );
}

function useDebouncedChange(
  setState: React.Dispatch<React.SetStateAction<SearchState>>,
  runSearch: (q: string) => void,
): (e: React.ChangeEvent<HTMLInputElement>) => void {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    (e) => {
      const val = e.target.value;
      setState((s) => ({ ...s, query: val }));
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => runSearch(val), 200);
    },
    [setState, runSearch],
  );
}

function useKeyHandler(
  state: SearchState,
  setState: React.Dispatch<React.SetStateAction<SearchState>>,
  onClose?: () => void,
): (e: React.KeyboardEvent) => void {
  return useCallback(
    (e) => {
      if (e.key === 'Escape') {
        onClose?.();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setState((s) => ({ ...s, selectedIdx: Math.min(s.selectedIdx + 1, s.results.length - 1) }));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setState((s) => ({ ...s, selectedIdx: Math.max(s.selectedIdx - 1, 0) }));
      } else if (e.key === 'Enter' && state.results[state.selectedIdx]) {
        const r = state.results[state.selectedIdx];
        dispatchOpenThread(r.threadId, r.messageId);
        onClose?.();
      }
    },
    [onClose, state.results, state.selectedIdx, setState],
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ThreadSearch({ onClose }: ThreadSearchProps): React.ReactElement {
  const [state, setState] = useState<SearchState>({
    query: '',
    results: [],
    hasMore: false,
    loading: false,
    selectedIdx: 0,
  });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const runSearch = useSearchRunner(setState);
  const handleChange = useDebouncedChange(setState, runSearch);
  const handleKeyDown = useKeyHandler(state, setState, onClose);
  const onSelect = useCallback((i: number) => setState((s) => ({ ...s, selectedIdx: i })), []);

  return (
    <ThreadSearchBody
      query={state.query}
      loading={state.loading}
      hasMore={state.hasMore}
      results={state.results}
      selectedIdx={state.selectedIdx}
      inputRef={inputRef}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onSelect={onSelect}
    />
  );
}
