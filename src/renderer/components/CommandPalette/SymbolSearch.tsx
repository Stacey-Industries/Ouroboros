import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Fuse from 'fuse.js';
import type { SymbolEntry } from '../../types/electron';
import { PaletteAnimations } from './paletteAnimations';
import { PickerOverlay, PickerInput } from './PickerOverlay';
import { PaletteFooter } from './PaletteOverlay';
import { SymbolItem } from './SymbolItem';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_RESULTS = 30;
const ITEM_HEIGHT = 40;
const MAX_VISIBLE = 12;

const FUSE_OPTIONS: Fuse.IFuseOptions<SymbolEntry> = {
  keys: [
    { name: 'name', weight: 0.7 },
    { name: 'relativePath', weight: 0.3 },
  ],
  threshold: 0.4,
  distance: 200,
  minMatchCharLength: 1,
  includeScore: true,
  includeMatches: true,
};

type MatchResult = {
  entry: SymbolEntry;
  nameIndices: ReadonlyArray<readonly [number, number]>;
  pathIndices: ReadonlyArray<readonly [number, number]>;
};

/** Cache keyed by project root so re-opening is instant. */
const symbolCache = new Map<string, SymbolEntry[]>();

// ─── SymbolSearch ────────────────────────────────────────────────────────────

export interface SymbolSearchProps {
  isOpen: boolean;
  onClose: () => void;
  projectRoot: string | null;
}

export function SymbolSearch({ isOpen, onClose, projectRoot }: SymbolSearchProps): React.ReactElement | null {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [allSymbols, setAllSymbols] = useState<SymbolEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useLoadSymbols(isOpen, projectRoot, setAllSymbols, setIsLoading, setLoadError);
  useCacheInvalidation(projectRoot, setAllSymbols);
  useResetOnOpen(isOpen, inputRef, setQuery, setSelectedIndex);

  const fuse = useMemo(() => new Fuse(allSymbols, FUSE_OPTIONS), [allSymbols]);
  const matches = useSymbolMatches(query, fuse, allSymbols);

  useClampIndex(matches.length, setSelectedIndex);
  useScrollIntoView(listRef, selectedIndex);

  const handleSelect = useCallback((entry: SymbolEntry) => {
    onClose();
    window.dispatchEvent(new CustomEvent('agent-ide:open-file', { detail: { filePath: entry.filePath, line: entry.line } }));
  }, [onClose]);

  const handleKeyDown = usePickerKeyboard(matches, selectedIndex, setSelectedIndex, handleSelect, onClose);

  const handleQueryChange = useCallback((v: string) => {
    setQuery(v);
    setSelectedIndex(0);
  }, []);

  if (!isOpen) return null;

  const emptyLabel = getEmptyLabel(projectRoot, loadError, isLoading, query);
  const footerHints = ['↑↓ navigate', '↵ open', 'esc close'];

  return (
    <>
      <PaletteAnimations prefix="ss" />
      <PickerOverlay label="Symbol Search" animPrefix="ss" maxWidth="620px" onClose={onClose}>
        <PickerInput
          inputRef={inputRef}
          prefix="@"
          placeholder="Go to symbol..."
          value={query}
          isOpen={isOpen}
          controlsId="ss-listbox"
          onChange={handleQueryChange}
          onKeyDown={handleKeyDown}
          statusText={isLoading ? 'scanning...' : undefined}
        />
        <SymbolList
          listRef={listRef}
          matches={matches}
          selectedIndex={selectedIndex}
          emptyLabel={emptyLabel}
          onSelect={handleSelect}
          onHover={setSelectedIndex}
        />
        <PaletteFooter hints={allSymbols.length > 0 ? [...footerHints, `${allSymbols.length} symbols`] : footerHints} />
      </PickerOverlay>
    </>
  );
}

// ─── SymbolList sub-component ────────────────────────────────────────────────

function SymbolList({ listRef, matches, selectedIndex, emptyLabel, onSelect, onHover }: {
  listRef: React.RefObject<HTMLDivElement | null>;
  matches: MatchResult[];
  selectedIndex: number;
  emptyLabel: string;
  onSelect: (entry: SymbolEntry) => void;
  onHover: (idx: number) => void;
}): React.ReactElement {
  return (
    <div id="ss-listbox" role="listbox" aria-label="Symbols" ref={listRef} style={{ maxHeight: `${ITEM_HEIGHT * MAX_VISIBLE}px`, overflowY: 'auto', padding: '4px 0' }}>
      {matches.length === 0 ? (
        <div style={{ padding: '16px 14px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>{emptyLabel}</div>
      ) : (
        matches.map((match, idx) => (
          <SymbolItem
            key={`${match.entry.filePath}:${match.entry.line}:${match.entry.name}`}
            entry={match.entry}
            isSelected={idx === selectedIndex}
            nameIndices={match.nameIndices}
            pathIndices={match.pathIndices}
            onClick={() => onSelect(match.entry)}
            onMouseEnter={() => onHover(idx)}
          />
        ))
      )}
    </div>
  );
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useLoadSymbols(
  isOpen: boolean,
  projectRoot: string | null,
  setAllSymbols: (s: SymbolEntry[]) => void,
  setIsLoading: (v: boolean) => void,
  setLoadError: (v: string | null) => void,
): void {
  useEffect(() => {
    if (!isOpen || !projectRoot) return;
    const cached = symbolCache.get(projectRoot);
    if (cached) { setAllSymbols(cached); return; }

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    window.electronAPI.symbol.search(projectRoot)
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.symbols) {
          symbolCache.set(projectRoot, result.symbols);
          setAllSymbols(result.symbols);
        } else {
          setLoadError(result.error ?? 'Failed to scan symbols');
        }
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(String(err));
        setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [isOpen, projectRoot, setAllSymbols, setIsLoading, setLoadError]);
}

function useCacheInvalidation(projectRoot: string | null, setAllSymbols: (s: SymbolEntry[]) => void): void {
  const prevRootRef = useRef<string | null>(null);
  useEffect(() => {
    if (projectRoot !== prevRootRef.current) {
      if (prevRootRef.current !== null) {
        symbolCache.delete(prevRootRef.current);
        setAllSymbols([]);
      }
      prevRootRef.current = projectRoot;
    }
  }, [projectRoot, setAllSymbols]);
}

function useResetOnOpen(isOpen: boolean, inputRef: React.RefObject<HTMLInputElement | null>, setQuery: (v: string) => void, setSelectedIndex: (v: number) => void): void {
  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setSelectedIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps
}

function useSymbolMatches(query: string, fuse: Fuse<SymbolEntry>, allSymbols: SymbolEntry[]): MatchResult[] {
  return useMemo(() => {
    const trimmed = query.trim();
    if (trimmed === '') {
      return allSymbols.slice(0, MAX_RESULTS).map((entry) => ({
        entry,
        nameIndices: [] as ReadonlyArray<readonly [number, number]>,
        pathIndices: [] as ReadonlyArray<readonly [number, number]>,
      }));
    }
    return fuse.search(trimmed, { limit: MAX_RESULTS }).map((r) => ({
      entry: r.item,
      nameIndices: (r.matches?.find((m) => m.key === 'name')?.indices ?? []) as ReadonlyArray<readonly [number, number]>,
      pathIndices: (r.matches?.find((m) => m.key === 'relativePath')?.indices ?? []) as ReadonlyArray<readonly [number, number]>,
    }));
  }, [query, fuse, allSymbols]);
}

function useClampIndex(length: number, setSelectedIndex: React.Dispatch<React.SetStateAction<number>>): void {
  useEffect(() => {
    setSelectedIndex((prev) => (length === 0 ? 0 : Math.min(prev, length - 1)));
  }, [length, setSelectedIndex]);
}

function useScrollIntoView(listRef: React.RefObject<HTMLDivElement | null>, selectedIndex: number): void {
  useEffect(() => {
    const item = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, listRef]);
}

function usePickerKeyboard(
  matches: MatchResult[],
  selectedIndex: number,
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>,
  handleSelect: (entry: SymbolEntry) => void,
  onClose: () => void,
): (e: React.KeyboardEvent<HTMLInputElement>) => void {
  return useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const len = matches.length;
    const handlers: Record<string, () => void> = {
      ArrowDown: () => setSelectedIndex((p) => (len === 0 ? 0 : (p + 1) % len)),
      ArrowUp: () => setSelectedIndex((p) => (len === 0 ? 0 : (p - 1 + len) % len)),
      Enter: () => { if (matches[selectedIndex]) handleSelect(matches[selectedIndex].entry); },
      Escape: () => onClose(),
    };
    const handler = handlers[e.key];
    if (handler) { e.preventDefault(); handler(); }
  }, [matches, selectedIndex, setSelectedIndex, handleSelect, onClose]);
}

function getEmptyLabel(projectRoot: string | null, loadError: string | null, isLoading: boolean, query: string): string {
  if (!projectRoot) return 'No project open';
  if (loadError) return `Error: ${loadError}`;
  if (isLoading) return 'Scanning for symbols...';
  if (query.trim()) return 'No symbols matched';
  return 'No symbols found';
}
