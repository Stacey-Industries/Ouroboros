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

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RESULTS = 15;
const MAX_RECENT_SHOWN = 5;

// ─── Fuse.js config ──────────────────────────────────────────────────────────

const FUSE_OPTIONS: Fuse.IFuseOptions<Command> = {
  keys: [
    { name: 'label', weight: 0.7 },
    { name: 'category', weight: 0.3 },
  ],
  threshold: 0.45,
  distance: 100,
  minMatchCharLength: 1,
  includeScore: true,
  includeMatches: true,
};

// ─── Category display labels ──────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  app: 'App',
  file: 'File',
  view: 'View',
  terminal: 'Terminal',
  git: 'Git',
  extension: 'Extensions',
};

function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat;
}

// ─── Helper: build CommandMatch list from empty query ────────────────────────

function buildRecentMatches(commands: Command[], recentIds: string[]): CommandMatch[] {
  // Flatten to leaf commands for recent lookup
  const allLeaves = flattenLeaves(commands);
  const visible = recentIds
    .map((id) => allLeaves.find((c) => c.id === id))
    .filter((c): c is Command => c !== undefined && (c.when === undefined || c.when()));

  return visible.slice(0, MAX_RECENT_SHOWN).map((command) => ({
    command,
    matchIndices: [],
    score: 0,
  }));
}

/** Recursively collect all leaf commands (commands without children). */
function flattenLeaves(commands: Command[]): Command[] {
  const result: Command[] = [];
  for (const cmd of commands) {
    if (Array.isArray(cmd.children) && cmd.children.length > 0) {
      result.push(...flattenLeaves(cmd.children));
    } else {
      result.push(cmd);
    }
  }
  return result;
}

/** Flatten all commands including parent nodes (for Fuse search across everything). */
function flattenAll(commands: Command[]): Command[] {
  const result: Command[] = [];
  for (const cmd of commands) {
    result.push(cmd);
    if (Array.isArray(cmd.children) && cmd.children.length > 0) {
      result.push(...flattenAll(cmd.children));
    }
  }
  return result;
}

// ─── Helper: build CommandMatch list from fuse results ───────────────────────

function buildFuseMatches(
  fuse: Fuse<Command>,
  query: string,
): CommandMatch[] {
  const results = fuse.search(query, { limit: MAX_RESULTS });

  return results
    .filter((r) => r.item.when === undefined || r.item.when())
    .map((r) => {
      const labelMatch = r.matches?.find((m) => m.key === 'label');
      const matchIndices: number[] = [];
      if (labelMatch?.indices) {
        for (const [start, end] of labelMatch.indices) {
          for (let i = start; i <= end; i++) {
            matchIndices.push(i);
          }
        }
      }
      return {
        command: r.item,
        matchIndices,
        score: r.score ?? 0,
      };
    });
}

// ─── Category grouping for flat list ─────────────────────────────────────────

interface GroupedSection {
  category: string;
  matches: CommandMatch[];
}

/**
 * Group a flat list of CommandMatch by category.
 * Only adds headers when 2+ distinct categories are present.
 */
function groupByCategory(matches: CommandMatch[]): GroupedSection[] {
  const map = new Map<string, CommandMatch[]>();
  const order: string[] = [];

  for (const m of matches) {
    const cat = m.command.category ?? '';
    if (!map.has(cat)) {
      map.set(cat, []);
      order.push(cat);
    }
    map.get(cat)!.push(m);
  }

  return order.map((cat) => ({ category: cat, matches: map.get(cat)! }));
}

// ─── Breadcrumb bar ───────────────────────────────────────────────────────────

interface BreadcrumbBarProps {
  stack: Command[];
  onBack: () => void;
}

function BreadcrumbBar({ stack, onBack }: BreadcrumbBarProps): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '0 14px',
        height: '32px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-tertiary)',
        fontSize: '11px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-muted)',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* Back button */}
      <button
        onClick={onBack}
        aria-label="Go back"
        title="Escape to go back"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          padding: '2px 4px',
          borderRadius: '3px',
          flexShrink: 0,
        }}
      >
        ←
      </button>

      {/* Root label */}
      <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}>Command Palette</span>

      {stack.map((cmd, i) => (
        <React.Fragment key={cmd.id}>
          <span style={{ opacity: 0.4, flexShrink: 0 }}>›</span>
          <span
            style={{
              color: i === stack.length - 1 ? 'var(--text-secondary)' : 'var(--text-faint)',
              flexShrink: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {cmd.label}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Overlay ─────────────────────────────────────────────────────────────────

interface OverlayProps {
  isVisible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

function Overlay({ isVisible, onClose, children }: OverlayProps): React.ReactElement | null {
  if (!isVisible) return null;

  return (
    <div
      aria-modal="true"
      role="dialog"
      aria-label="Command Palette"
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
        animation: 'cp-overlay-in 120ms ease',
      }}
    >
      {/* Palette card — stop propagation so clicks inside don't close */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '520px',
          borderRadius: '8px',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          animation: 'cp-card-in 120ms ease',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── CategoryHeader ───────────────────────────────────────────────────────────

function CategoryHeader({ label }: { label: string }): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      style={{
        padding: '6px 16px 2px',
        fontSize: '10px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        color: 'var(--text-faint)',
        fontFamily: 'var(--font-mono)',
        userSelect: 'none',
      }}
    >
      {label}
    </div>
  );
}

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
  // Stack of parent commands we've navigated into (breadcrumb)
  const [navStack, setNavStack] = useState<Command[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Current level's command list: root or a submenu's children
  const currentLevelCommands = useMemo<Command[]>(() => {
    if (navStack.length === 0) return commands;
    const parent = navStack[navStack.length - 1];
    return parent.children ?? [];
  }, [commands, navStack]);

  // Build fuse index — re-index only when current level's command list changes.
  // In a submenu we search the children; at root we flatten all for global search.
  const fuseCommands = useMemo<Command[]>(() => {
    if (navStack.length > 0) {
      // Inside a submenu: search only that level (no further nesting expected)
      return currentLevelCommands;
    }
    // At root: flatten all commands (including nested leaves) for global search
    return flattenAll(commands);
  }, [commands, currentLevelCommands, navStack.length]);

  const fuse = useMemo(
    () => new Fuse(fuseCommands, FUSE_OPTIONS),
    [fuseCommands],
  );

  // Derive visible matches
  const matches = useMemo<CommandMatch[]>(() => {
    const trimmed = query.trim();
    if (trimmed === '') {
      if (navStack.length > 0) {
        // Inside a submenu — show all children
        return currentLevelCommands
          .filter((c) => c.when === undefined || c.when())
          .map((command) => ({ command, matchIndices: [], score: 0 }));
      }
      // Root — show recent commands
      return buildRecentMatches(commands, recentIds);
    }
    return buildFuseMatches(fuse, trimmed);
  }, [query, fuse, commands, recentIds, navStack.length, currentLevelCommands]);

  // Group matches by category (only at root level with no query — submenu shows flat)
  const grouped = useMemo<GroupedSection[]>(() => {
    return groupByCategory(matches);
  }, [matches]);

  const showCategoryHeaders = useMemo(
    () => query.trim() !== '' && grouped.length >= 2 && navStack.length === 0,
    [query, grouped.length, navStack.length],
  );

  // Build flat index list for keyboard navigation (category headers are non-interactive)
  // matches[] is already in the right order; grouped only rearranges for rendering
  const flatMatches = matches;

  // Reset state on open/close
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setNavStack([]);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Clamp selectedIndex when match list changes
  useEffect(() => {
    setSelectedIndex((prev) =>
      flatMatches.length === 0 ? 0 : Math.min(prev, flatMatches.length - 1),
    );
  }, [flatMatches.length]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    // Items with data-idx attribute (skips category headers)
    const item = list.querySelector(`[data-idx="${selectedIndex}"]`) as HTMLElement | null;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const navigateInto = useCallback((command: Command): void => {
    setNavStack((prev) => [...prev, command]);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const navigateBack = useCallback((): void => {
    setNavStack((prev) => prev.slice(0, -1));
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const handleExecute = useCallback(
    async (command: Command): Promise<void> => {
      // If command has children, navigate into the submenu
      if (Array.isArray(command.children) && command.children.length > 0) {
        navigateInto(command);
        return;
      }
      onClose();
      await onExecute(command);
    },
    [onClose, onExecute, navigateInto],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            flatMatches.length === 0 ? 0 : (prev + 1) % flatMatches.length,
          );
          break;

        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) =>
            flatMatches.length === 0
              ? 0
              : (prev - 1 + flatMatches.length) % flatMatches.length,
          );
          break;

        case 'ArrowRight':
          // Navigate into submenu if currently selected item has children
          if (flatMatches[selectedIndex] !== undefined) {
            const cmd = flatMatches[selectedIndex].command;
            if (Array.isArray(cmd.children) && cmd.children.length > 0) {
              e.preventDefault();
              navigateInto(cmd);
            }
          }
          break;

        case 'Enter':
          e.preventDefault();
          if (flatMatches[selectedIndex] !== undefined) {
            void handleExecute(flatMatches[selectedIndex].command);
          }
          break;

        case 'Escape':
          e.preventDefault();
          if (navStack.length > 0) {
            // Escape goes back one level, not close
            navigateBack();
          } else {
            onClose();
          }
          break;
      }
    },
    [flatMatches, selectedIndex, handleExecute, navStack.length, navigateBack, navigateInto, onClose],
  );

  const handleMouseEnter = useCallback(
    (command: Command): void => {
      const idx = flatMatches.findIndex((m) => m.command.id === command.id);
      if (idx !== -1) setSelectedIndex(idx);
    },
    [flatMatches],
  );

  const emptyLabel =
    query.trim() === ''
      ? navStack.length > 0
        ? 'No commands in this menu'
        : recentIds.length === 0
          ? 'Type to search commands'
          : 'No recent commands'
      : 'No commands matched';

  const footerEscHint = navStack.length > 0 ? 'esc back' : 'esc close';

  return (
    <>
      {/* Keyframe animations injected inline once */}
      <style>{`
        @keyframes cp-overlay-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes cp-card-in {
          from { opacity: 0; transform: scale(0.97) translateY(-4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      <Overlay isVisible={isOpen} onClose={onClose}>
        {/* ── Breadcrumb (only shown when inside a submenu) ── */}
        {navStack.length > 0 && (
          <BreadcrumbBar stack={navStack} onBack={navigateBack} />
        )}

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
            &gt;
          </span>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={isOpen}
            aria-autocomplete="list"
            aria-controls="cp-listbox"
            aria-activedescendant={
              flatMatches[selectedIndex] !== undefined
                ? `cp-item-${flatMatches[selectedIndex].command.id}`
                : undefined
            }
            placeholder={navStack.length > 0
              ? `Search in ${navStack[navStack.length - 1].label}…`
              : 'Type a command…'}
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
        </div>

        {/* ── Results list ── */}
        <div
          id="cp-listbox"
          role="listbox"
          aria-label="Commands"
          ref={listRef}
          style={{
            maxHeight: '360px',
            overflowY: 'auto',
            padding: '4px 0',
          }}
        >
          {flatMatches.length === 0 ? (
            <div
              style={{
                padding: '16px 14px',
                fontSize: '13px',
                color: 'var(--text-muted)',
                textAlign: 'center',
              }}
            >
              {emptyLabel}
            </div>
          ) : showCategoryHeaders ? (
            // ── Grouped view with category headers ──
            grouped.map((section) => (
              <div key={section.category}>
                <CategoryHeader label={categoryLabel(section.category)} />
                {section.matches.map((match) => {
                  const idx = flatMatches.findIndex((m) => m.command.id === match.command.id);
                  return (
                    <div key={match.command.id} data-idx={idx}>
                      <CommandItem
                        command={match.command}
                        isSelected={idx === selectedIndex}
                        matchIndices={match.matchIndices}
                        onSelect={handleExecute}
                        onMouseEnter={handleMouseEnter}
                      />
                    </div>
                  );
                })}
              </div>
            ))
          ) : (
            // ── Flat view ──
            flatMatches.map((match, idx) => (
              <div key={match.command.id} data-idx={idx}>
                <CommandItem
                  command={match.command}
                  isSelected={idx === selectedIndex}
                  matchIndices={match.matchIndices}
                  onSelect={handleExecute}
                  onMouseEnter={handleMouseEnter}
                />
              </div>
            ))
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
          <span>↵ execute</span>
          <span>{footerEscHint}</span>
          {navStack.length === 0 && <span>→ open submenu</span>}
        </div>
      </Overlay>
    </>
  );
}
