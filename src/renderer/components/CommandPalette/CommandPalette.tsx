import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Fuse from 'fuse.js';
import type { Command, CommandMatch } from './types';
import { CommandItem } from './CommandItem';
import { BreadcrumbBar } from './BreadcrumbBar';
import { PaletteOverlay, CategoryHeader, PaletteFooter } from './PaletteOverlay';
import {
  FUSE_OPTIONS,
  categoryLabel,
  flattenAll,
  buildRecentMatches,
  buildFuseMatches,
  groupByCategory,
} from './commandSearch';

// ─── Animation styles (injected once) ────────────────────────────────────────

const PALETTE_KEYFRAMES = `
  @keyframes cp-overlay-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes cp-card-in { from { opacity: 0; transform: scale(0.97) translateY(-4px); } to { opacity: 1; transform: scale(1) translateY(0); } }
`;

// ─── CommandPalette ───────────────────────────────────────────────────────────

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
  recentIds: string[];
  onExecute: (command: Command) => Promise<void>;
}

export function CommandPalette({
  isOpen,
  onClose,
  commands,
  recentIds,
  onExecute,
}: CommandPaletteProps): React.ReactElement | null {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [navStack, setNavStack] = useState<Command[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const currentLevelCommands = useMemo<Command[]>(() => {
    if (navStack.length === 0) return commands;
    return navStack[navStack.length - 1].children ?? [];
  }, [commands, navStack]);

  const fuseCommands = useMemo<Command[]>(
    () => (navStack.length > 0 ? currentLevelCommands : flattenAll(commands)),
    [commands, currentLevelCommands, navStack.length],
  );

  const fuse = useMemo(() => new Fuse(fuseCommands, FUSE_OPTIONS), [fuseCommands]);

  const matches = useMemo<CommandMatch[]>(() => {
    const trimmed = query.trim();
    if (trimmed !== '') return buildFuseMatches(fuse, trimmed);
    if (navStack.length > 0) {
      return currentLevelCommands
        .filter((c) => c.when === undefined || c.when())
        .map((command) => ({ command, matchIndices: [], score: 0 }));
    }
    return buildRecentMatches(commands, recentIds);
  }, [query, fuse, commands, recentIds, navStack.length, currentLevelCommands]);

  const grouped = useMemo(() => groupByCategory(matches), [matches]);
  const showHeaders = query.trim() !== '' && grouped.length >= 2 && navStack.length === 0;

  useResetOnOpen(isOpen, inputRef, setQuery, setSelectedIndex, setNavStack);
  useClampIndex(matches.length, setSelectedIndex);
  useScrollIntoView(listRef, selectedIndex);

  const navigateInto = useCallback((cmd: Command) => {
    setNavStack((prev) => [...prev, cmd]);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const navigateBack = useCallback(() => {
    setNavStack((prev) => prev.slice(0, -1));
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const handleExecute = useCallback(async (command: Command) => {
    if (Array.isArray(command.children) && command.children.length > 0) {
      navigateInto(command);
      return;
    }
    onClose();
    await onExecute(command);
  }, [onClose, onExecute, navigateInto]);

  const handleKeyDown = useKeyboardNav(matches, selectedIndex, setSelectedIndex, handleExecute, navigateInto, navigateBack, navStack.length, onClose);

  const handleMouseEnter = useCallback((command: Command) => {
    const idx = matches.findIndex((m) => m.command.id === command.id);
    if (idx !== -1) setSelectedIndex(idx);
  }, [matches]);

  const emptyLabel = getEmptyLabel(query, navStack.length, recentIds.length);
  const footerHints = navStack.length > 0
    ? ['↑↓ navigate', '↵ execute', 'esc back']
    : ['↑↓ navigate', '↵ execute', 'esc close', '→ open submenu'];

  return (
    <>
      <style>{PALETTE_KEYFRAMES}</style>
      <PaletteOverlay isVisible={isOpen} onClose={onClose}>
        {navStack.length > 0 && <BreadcrumbBar stack={navStack} onBack={navigateBack} />}
        <SearchInput
          inputRef={inputRef}
          isOpen={isOpen}
          query={query}
          placeholder={navStack.length > 0 ? `Search in ${navStack[navStack.length - 1].label}…` : 'Type a command…'}
          selectedId={matches[selectedIndex]?.command.id}
          onQueryChange={(v) => { setQuery(v); setSelectedIndex(0); }}
          onKeyDown={handleKeyDown}
        />
        <ResultsList
          listRef={listRef}
          matches={matches}
          grouped={grouped}
          showHeaders={showHeaders}
          selectedIndex={selectedIndex}
          emptyLabel={emptyLabel}
          onExecute={handleExecute}
          onMouseEnter={handleMouseEnter}
        />
        <PaletteFooter hints={footerHints} />
      </PaletteOverlay>
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SearchInput({ inputRef, isOpen, query, placeholder, selectedId, onQueryChange, onKeyDown }: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  isOpen: boolean;
  query: string;
  placeholder: string;
  selectedId?: string;
  onQueryChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 14px', borderBottom: '1px solid var(--border)', height: '46px' }}>
      <span style={{ fontSize: '14px', color: 'var(--text-muted)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>&gt;</span>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-controls="cp-listbox"
        aria-activedescendant={selectedId ? `cp-item-${selectedId}` : undefined}
        placeholder={placeholder}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={onKeyDown}
        style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', color: 'var(--text)', fontFamily: 'var(--font-ui)', caretColor: 'var(--accent)' }}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
    </div>
  );
}

function ResultsList({ listRef, matches, grouped, showHeaders, selectedIndex, emptyLabel, onExecute, onMouseEnter }: {
  listRef: React.RefObject<HTMLDivElement | null>;
  matches: CommandMatch[];
  grouped: ReturnType<typeof groupByCategory>;
  showHeaders: boolean;
  selectedIndex: number;
  emptyLabel: string;
  onExecute: (cmd: Command) => void;
  onMouseEnter: (cmd: Command) => void;
}): React.ReactElement {
  return (
    <div id="cp-listbox" role="listbox" aria-label="Commands" ref={listRef} style={{ maxHeight: '360px', overflowY: 'auto', padding: '4px 0' }}>
      {matches.length === 0 ? (
        <div style={{ padding: '16px 14px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>{emptyLabel}</div>
      ) : showHeaders ? (
        grouped.map((section) => (
          <div key={section.category}>
            <CategoryHeader label={categoryLabel(section.category)} />
            {section.matches.map((match) => {
              const idx = matches.findIndex((m) => m.command.id === match.command.id);
              return (
                <div key={match.command.id} data-idx={idx}>
                  <CommandItem command={match.command} isSelected={idx === selectedIndex} matchIndices={match.matchIndices} onSelect={onExecute} onMouseEnter={onMouseEnter} />
                </div>
              );
            })}
          </div>
        ))
      ) : (
        matches.map((match, idx) => (
          <div key={match.command.id} data-idx={idx}>
            <CommandItem command={match.command} isSelected={idx === selectedIndex} matchIndices={match.matchIndices} onSelect={onExecute} onMouseEnter={onMouseEnter} />
          </div>
        ))
      )}
    </div>
  );
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useResetOnOpen(
  isOpen: boolean,
  inputRef: React.RefObject<HTMLInputElement | null>,
  setQuery: (v: string) => void,
  setSelectedIndex: (v: number) => void,
  setNavStack: (v: Command[]) => void,
): void {
  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setSelectedIndex(0);
    setNavStack([]);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps
}

function useClampIndex(length: number, setSelectedIndex: React.Dispatch<React.SetStateAction<number>>): void {
  useEffect(() => {
    setSelectedIndex((prev) => (length === 0 ? 0 : Math.min(prev, length - 1)));
  }, [length, setSelectedIndex]);
}

function useScrollIntoView(listRef: React.RefObject<HTMLDivElement | null>, selectedIndex: number): void {
  useEffect(() => {
    const item = listRef.current?.querySelector(`[data-idx="${selectedIndex}"]`) as HTMLElement | null;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, listRef]);
}

function useKeyboardNav(
  matches: CommandMatch[],
  selectedIndex: number,
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>,
  handleExecute: (cmd: Command) => void,
  navigateInto: (cmd: Command) => void,
  navigateBack: () => void,
  stackDepth: number,
  onClose: () => void,
): (e: React.KeyboardEvent<HTMLInputElement>) => void {
  return useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const len = matches.length;
    const handlers: Record<string, () => void> = {
      ArrowDown: () => setSelectedIndex((p) => (len === 0 ? 0 : (p + 1) % len)),
      ArrowUp: () => setSelectedIndex((p) => (len === 0 ? 0 : (p - 1 + len) % len)),
      Enter: () => { if (matches[selectedIndex]) void handleExecute(matches[selectedIndex].command); },
      Escape: () => {
        if (stackDepth > 0) navigateBack();
        else onClose();
      },
      ArrowRight: () => {
        const cmd = matches[selectedIndex]?.command;
        if (cmd && Array.isArray(cmd.children) && cmd.children.length > 0) navigateInto(cmd);
      },
    };
    const handler = handlers[e.key];
    if (handler) { e.preventDefault(); handler(); }
  }, [matches, selectedIndex, setSelectedIndex, handleExecute, navigateInto, navigateBack, stackDepth, onClose]);
}

function getEmptyLabel(query: string, stackDepth: number, recentCount: number): string {
  if (query.trim() !== '') return 'No commands matched';
  if (stackDepth > 0) return 'No commands in this menu';
  return recentCount === 0 ? 'Type to search commands' : 'No recent commands';
}
