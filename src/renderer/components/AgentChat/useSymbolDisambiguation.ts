/**
 * useSymbolDisambiguation.ts — Resolves bare @symbol:name queries via
 * graph:searchGraph and produces a SymbolGraphNode[] for the autocomplete list.
 *
 * The existing @symbol:filePath::name::line pin format is unchanged.
 * This hook is purely additive: it handles the case where the user types
 * "@symbol:functionName" (no "::" separator) and needs a disambiguation list.
 *
 * Debounced at 200 ms to avoid hammering the main process while typing.
 */

import { useEffect, useRef, useState } from 'react';

import type { SymbolGraphNode } from './MentionAutocomplete';

const DEBOUNCE_MS = 200;
const MAX_SYMBOL_RESULTS = 15;

// ── Public API ────────────────────────────────────────────────────────────────

export interface UseSymbolDisambiguationOptions {
  query: string;
  enabled: boolean;
}

export interface UseSymbolDisambiguationResult {
  symbolResults: SymbolGraphNode[];
  loading: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function extractBareSymbolQuery(query: string): string | null {
  if (!query.startsWith('symbol:')) return null;
  const name = query.slice('symbol:'.length).trim();
  if (!name || name.includes('::')) return null;
  return name;
}

function toSymbolGraphNode(item: {
  node: { name: string; type: string; filePath: string; line: number; endLine?: number };
}): SymbolGraphNode {
  return { name: item.node.name, type: item.node.type, filePath: item.node.filePath, line: item.node.line, endLine: item.node.endLine };
}

// ── Fetch helper (extracted to keep hook under 40 lines) ──────────────────────

function searchAndUpdate(
  bareName: string,
  cancelled: { current: boolean },
  setResults: (r: SymbolGraphNode[]) => void,
  setLoading: (v: boolean) => void,
): void {
  window.electronAPI.graph
    .searchGraph(bareName, MAX_SYMBOL_RESULTS)
    .then((result) => {
      if (cancelled.current) return;
      setResults(result.success && result.results ? result.results.map(toSymbolGraphNode) : []);
    })
    .catch(() => { if (!cancelled.current) setResults([]); })
    .finally(() => { if (!cancelled.current) setLoading(false); });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSymbolDisambiguation({ query, enabled }: UseSymbolDisambiguationOptions): UseSymbolDisambiguationResult {
  const [symbolResults, setSymbolResults] = useState<SymbolGraphNode[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelRef = useRef(false);
  const lastQueryRef = useRef('');

  useEffect(() => {
    const bareName = enabled ? extractBareSymbolQuery(query) : null;
    if (!bareName) {
      setSymbolResults([]);
      setLoading(false);
      lastQueryRef.current = '';
      return;
    }
    if (bareName === lastQueryRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    cancelRef.current = false;
    setLoading(true);
    timerRef.current = setTimeout(() => {
      lastQueryRef.current = bareName;
      searchAndUpdate(bareName, cancelRef, setSymbolResults, setLoading);
    }, DEBOUNCE_MS);
    return () => {
      cancelRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, enabled]);

  return { symbolResults, loading };
}
