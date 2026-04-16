/**
 * ThreadSearch.tsx — Debounced full-text search UI over chat threads.
 *
 * Renders a controlled input with 200ms debounce. Results show title-or-snippet,
 * tags, and timestamp. Clicking a result dispatches agent-ide:open-thread with
 * { threadId, messageId } — the listener is added in a later phase.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { AgentChatSearchResult } from '../../types/electron-agent-chat.d';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ThreadSearchProps {
  onClose?: () => void;
}

interface ResultCardProps {
  result: AgentChatSearchResult;
  isSelected: boolean;
  onSelect: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dispatchOpenThread(threadId: string, messageId?: string): void {
  window.dispatchEvent(
    new CustomEvent('agent-ide:open-thread', { detail: { threadId, messageId } }),
  );
}

function resultCardClassName(isSelected: boolean): string {
  return [
    'cursor-pointer rounded px-3 py-2 text-sm transition-colors',
    isSelected
      ? 'bg-interactive-selection text-text-semantic-primary'
      : 'hover:bg-surface-hover text-text-semantic-secondary',
  ].join(' ');
}

function renderSnippet(snippet?: string): React.ReactNode {
  if (!snippet) return null;
  return (
    <p className="mt-0.5 truncate text-xs text-text-semantic-muted">
      {snippet.replace(/<\/?b>/g, '')}
    </p>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ResultCard({ result, isSelected, onSelect }: ResultCardProps): React.ReactElement {
  const handleClick = useCallback(() => {
    onSelect();
    dispatchOpenThread(result.threadId, result.messageId);
  }, [result.threadId, result.messageId, onSelect]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );

  return (
    <div role="option" aria-selected={isSelected} tabIndex={0}
      onClick={handleClick} onKeyDown={handleKey} className={resultCardClassName(isSelected)}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium text-text-semantic-primary">{result.threadId}</span>
      </div>
      {renderSnippet(result.snippet)}
    </div>
  );
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

interface SearchState {
  query: string;
  results: AgentChatSearchResult[];
  loading: boolean;
  selectedIdx: number;
}

function useSearchRunner(
  setState: React.Dispatch<React.SetStateAction<SearchState>>,
): (q: string) => void {
  const reqIdRef = useRef(0);
  return useCallback((q: string) => {
    if (!q.trim()) {
      setState((s) => ({ ...s, results: [], loading: false }));
      return;
    }
    const id = ++reqIdRef.current;
    setState((s) => ({ ...s, loading: true }));
    void window.electronAPI.agentChat.searchThreads({ query: q, limit: 30 })
      .then((res) => {
        if (reqIdRef.current !== id) return;
        setState((s) => ({ ...s, results: res.results ?? [], selectedIdx: 0 }));
      })
      .catch(() => {
        if (reqIdRef.current !== id) return;
        setState((s) => ({ ...s, results: [] }));
      })
      .finally(() => {
        if (reqIdRef.current === id) setState((s) => ({ ...s, loading: false }));
      });
  }, [setState]);
}

function useDebouncedChange(
  setState: React.Dispatch<React.SetStateAction<SearchState>>,
  runSearch: (q: string) => void,
): (e: React.ChangeEvent<HTMLInputElement>) => void {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((e) => {
    const val = e.target.value;
    setState((s) => ({ ...s, query: val }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(val), 200);
  }, [setState, runSearch]);
}

function useKeyHandler(
  state: SearchState,
  setState: React.Dispatch<React.SetStateAction<SearchState>>,
  onClose?: () => void,
): (e: React.KeyboardEvent) => void {
  return useCallback((e) => {
    if (e.key === 'Escape') { onClose?.(); return; }
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
  }, [onClose, state.results, state.selectedIdx, setState]);
}

// ── Main component ────────────────────────────────────────────────────────────

export function ThreadSearch({ onClose }: ThreadSearchProps): React.ReactElement {
  const [state, setState] = useState<SearchState>({ query: '', results: [], loading: false, selectedIdx: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const runSearch = useSearchRunner(setState);
  const handleChange = useDebouncedChange(setState, runSearch);
  const handleKeyDown = useKeyHandler(state, setState, onClose);
  const onSelect = useCallback((i: number) => setState((s) => ({ ...s, selectedIdx: i })), []);

  return (
    <div className="flex flex-col gap-2 p-2">
      <input ref={inputRef} type="search" placeholder="Search threads..."
        value={state.query} onChange={handleChange} onKeyDown={handleKeyDown}
        className={['w-full rounded border border-border-semantic bg-surface-inset px-3 py-1.5',
          'text-sm text-text-semantic-primary placeholder:text-text-semantic-faint',
          'outline-none focus:border-border-accent'].join(' ')} />
      {state.loading && <p className="px-1 text-xs text-text-semantic-muted">Searching...</p>}
      {!state.loading && state.query.trim() && state.results.length === 0 && (
        <p className="px-1 text-xs text-text-semantic-muted">No results</p>
      )}
      {state.results.length > 0 && (
        <div role="listbox" className="flex flex-col gap-0.5">
          {state.results.map((r, i) => (
            <ResultCard key={`${r.threadId}-${i}`} result={r}
              isSelected={i === state.selectedIdx} onSelect={() => onSelect(i)} />
          ))}
        </div>
      )}
    </div>
  );
}
