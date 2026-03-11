import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Fuse from 'fuse.js';
import type { SymbolEntry } from '../../types/electron';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_RESULTS = 30;
const ITEM_HEIGHT = 40;
const MAX_VISIBLE = 12;

// ─── Symbol type badge colors ────────────────────────────────────────────────

const BADGE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  function:  { bg: 'rgba(88, 166, 255, 0.18)',  text: '#58a6ff', label: 'fn'  },
  fn:        { bg: 'rgba(88, 166, 255, 0.18)',  text: '#58a6ff', label: 'fn'  },
  class:     { bg: 'rgba(188, 140, 255, 0.18)', text: '#bc8cff', label: 'cls' },
  interface: { bg: 'rgba(56, 201, 187, 0.18)',  text: '#38c9bb', label: 'if'  },
  type:      { bg: 'rgba(255, 166, 77, 0.18)',  text: '#ffa64d', label: 'ty'  },
  const:     { bg: 'rgba(63, 185, 80, 0.18)',   text: '#3fb950', label: 'co'  },
  def:       { bg: 'rgba(255, 197, 61, 0.18)',  text: '#ffc53d', label: 'def' },
};

function getBadge(type: string): { bg: string; text: string; label: string } {
  return BADGE_COLORS[type] ?? { bg: 'rgba(140, 140, 140, 0.18)', text: '#8c8c8c', label: type.slice(0, 3) };
}

// ─── Fuse.js config ─────────────────────────────────────────────────────────

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

// ─── Match highlight helper ─────────────────────────────────────────────────

interface HighlightedTextProps {
  text: string;
  indices: ReadonlyArray<readonly [number, number]>;
}

function HighlightedText({ text, indices }: HighlightedTextProps): React.ReactElement {
  if (indices.length === 0) return <>{text}</>;

  const indexSet = new Set<number>();
  for (const [start, end] of indices) {
    for (let i = start; i <= end; i++) {
      indexSet.add(i);
    }
  }

  const parts: React.ReactElement[] = [];
  let i = 0;
  while (i < text.length) {
    if (indexSet.has(i)) {
      let end = i;
      while (end < text.length && indexSet.has(end)) end++;
      parts.push(
        <mark
          key={i}
          style={{
            background: 'transparent',
            color: 'var(--accent)',
            fontWeight: 600,
          }}
        >
          {text.slice(i, end)}
        </mark>,
      );
      i = end;
    } else {
      let end = i;
      while (end < text.length && !indexSet.has(end)) end++;
      parts.push(<span key={i}>{text.slice(i, end)}</span>);
      i = end;
    }
  }

  return <>{parts}</>;
}

// ─── SymbolSearch ────────────────────────────────────────────────────────────

export interface SymbolSearchProps {
  isOpen: boolean;
  onClose: () => void;
  projectRoot: string | null;
}

/** Cache keyed by project root so re-opening is instant. */
const symbolCache = new Map<string, SymbolEntry[]>();

export function SymbolSearch({
  isOpen,
  onClose,
  projectRoot,
}: SymbolSearchProps): React.ReactElement | null {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [allSymbols, setAllSymbols] = useState<SymbolEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Load symbols when opened (use cache when possible) ───────────────────

  useEffect(() => {
    if (!isOpen || !projectRoot) return;

    // Serve from cache if available
    const cached = symbolCache.get(projectRoot);
    if (cached) {
      setAllSymbols(cached);
      return;
    }

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

    return () => {
      cancelled = true;
    };
  }, [isOpen, projectRoot]);

  // ── Invalidate cache when project root changes ───────────────────────────

  const prevRootRef = useRef<string | null>(null);
  useEffect(() => {
    if (projectRoot !== prevRootRef.current) {
      if (prevRootRef.current !== null) {
        symbolCache.delete(prevRootRef.current);
        setAllSymbols([]);
      }
      prevRootRef.current = projectRoot;
    }
  }, [projectRoot]);

  // ── Reset state on open ─────────────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // ── Fuse index ──────────────────────────────────────────────────────────

  const fuse = useMemo(() => new Fuse(allSymbols, FUSE_OPTIONS), [allSymbols]);

  // ── Derive matches ──────────────────────────────────────────────────────

  const matches = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed === '') {
      return allSymbols.slice(0, MAX_RESULTS).map((entry) => ({
        entry,
        nameIndices: [] as ReadonlyArray<readonly [number, number]>,
        pathIndices: [] as ReadonlyArray<readonly [number, number]>,
      }));
    }

    const results = fuse.search(trimmed, { limit: MAX_RESULTS });
    return results.map((r) => {
      const nameMatch = r.matches?.find((m) => m.key === 'name');
      const pathMatch = r.matches?.find((m) => m.key === 'relativePath');
      return {
        entry: r.item,
        nameIndices: (nameMatch?.indices ?? []) as ReadonlyArray<readonly [number, number]>,
        pathIndices: (pathMatch?.indices ?? []) as ReadonlyArray<readonly [number, number]>,
      };
    });
  }, [query, fuse, allSymbols]);

  // ── Clamp selection ─────────────────────────────────────────────────────

  useEffect(() => {
    setSelectedIndex((prev) =>
      matches.length === 0 ? 0 : Math.min(prev, matches.length - 1),
    );
  }, [matches.length]);

  // ── Scroll selected item into view ──────────────────────────────────────

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // ── Select handler: dispatch DOM event to open file at line ──────────────

  const handleSelect = useCallback(
    (entry: SymbolEntry) => {
      onClose();
      window.dispatchEvent(
        new CustomEvent('agent-ide:open-file', {
          detail: { filePath: entry.filePath, line: entry.line },
        }),
      );
    },
    [onClose],
  );

  // ── Keyboard handler ────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            matches.length === 0 ? 0 : (prev + 1) % matches.length,
          );
          break;

        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) =>
            matches.length === 0 ? 0 : (prev - 1 + matches.length) % matches.length,
          );
          break;

        case 'Enter':
          e.preventDefault();
          if (matches[selectedIndex] !== undefined) {
            handleSelect(matches[selectedIndex].entry);
          }
          break;

        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [matches, selectedIndex, handleSelect, onClose],
  );

  // ── Render ──────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes ss-overlay-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes ss-card-in {
          from { opacity: 0; transform: scale(0.97) translateY(-4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      <div
        aria-modal="true"
        role="dialog"
        aria-label="Symbol Search"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: '15vh',
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          animation: 'ss-overlay-in 120ms ease',
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: '620px',
            borderRadius: '8px',
            overflow: 'hidden',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
            animation: 'ss-card-in 120ms ease',
          }}
        >
          {/* ── Search input ── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '0 14px',
              borderBottom: '1px solid var(--border)',
              height: '46px',
            }}
          >
            <span
              style={{
                fontSize: '14px',
                color: 'var(--text-muted)',
                flexShrink: 0,
                fontFamily: 'var(--font-mono)',
              }}
            >
              @
            </span>
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={isOpen}
              aria-autocomplete="list"
              aria-controls="ss-listbox"
              placeholder="Go to symbol..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: '14px',
                color: 'var(--text)',
                fontFamily: 'var(--font-ui)',
                caretColor: 'var(--accent)',
              }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            {isLoading && (
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  flexShrink: 0,
                }}
              >
                scanning...
              </span>
            )}
          </div>

          {/* ── Results list ── */}
          <div
            id="ss-listbox"
            role="listbox"
            aria-label="Symbols"
            ref={listRef}
            style={{
              maxHeight: `${ITEM_HEIGHT * MAX_VISIBLE}px`,
              overflowY: 'auto',
              padding: '4px 0',
            }}
          >
            {matches.length === 0 ? (
              <div
                style={{
                  padding: '16px 14px',
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                }}
              >
                {!projectRoot
                  ? 'No project open'
                  : loadError
                    ? `Error: ${loadError}`
                    : isLoading
                      ? 'Scanning for symbols...'
                      : query.trim()
                        ? 'No symbols matched'
                        : 'No symbols found'}
              </div>
            ) : (
              matches.map((match, idx) => {
                const { entry, nameIndices, pathIndices } = match;
                const badge = getBadge(entry.type);
                const isSelected = idx === selectedIndex;

                // Directory part of the relative path for display
                const dirPart = entry.relativePath.includes('/')
                  ? entry.relativePath.slice(0, entry.relativePath.lastIndexOf('/'))
                  : '';

                return (
                  <div
                    key={`${entry.filePath}:${entry.line}:${entry.name}`}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(entry)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 12px',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      margin: '0 4px',
                      height: `${ITEM_HEIGHT}px`,
                      boxSizing: 'border-box',
                      backgroundColor: isSelected ? 'var(--accent)' : 'transparent',
                      color: isSelected ? 'var(--bg)' : 'var(--text)',
                      transition: 'background-color 80ms ease',
                      userSelect: 'none',
                      minWidth: 0,
                    }}
                  >
                    {/* Symbol type badge */}
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                        padding: '1px 5px',
                        borderRadius: '3px',
                        backgroundColor: isSelected ? 'rgba(0,0,0,0.2)' : badge.bg,
                        color: isSelected ? 'rgba(255,255,255,0.85)' : badge.text,
                        letterSpacing: '0.02em',
                        minWidth: '26px',
                        textAlign: 'center',
                      }}
                    >
                      {badge.label}
                    </span>

                    {/* Symbol name */}
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: '13px',
                        fontWeight: 500,
                        fontFamily: 'var(--font-mono)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <HighlightedText
                        text={entry.name}
                        indices={isSelected ? [] : nameIndices}
                      />
                    </span>

                    {/* File path + line number (dimmed) */}
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: '11px',
                        color: isSelected ? 'rgba(255,255,255,0.6)' : 'var(--text-faint)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      <HighlightedText
                        text={dirPart || entry.relativePath}
                        indices={isSelected ? [] : pathIndices}
                      />
                    </span>

                    {/* Line number */}
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: '11px',
                        color: isSelected ? 'rgba(255,255,255,0.5)' : 'var(--text-faint)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      :{entry.line}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* ── Footer hint ── */}
          <div
            style={{
              display: 'flex',
              gap: '14px',
              padding: '6px 14px',
              borderTop: '1px solid var(--border)',
              fontSize: '11px',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span>↑↓ navigate</span>
            <span>↵ open</span>
            <span>esc close</span>
            {allSymbols.length > 0 && (
              <span style={{ marginLeft: 'auto' }}>{allSymbols.length} symbols</span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
