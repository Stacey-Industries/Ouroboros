/**
 * CommandSearchOverlay — Ctrl+R command history search overlay for the terminal.
 *
 * Renders a bottom-anchored panel with a search input and filtered command list.
 */

import React, { useEffect, useRef, useState } from 'react';

interface CommandSearchProps {
  commands: string[];
  onSelect: (cmd: string) => void;
  onClose: () => void;
}

interface KeyDownContext {
  filtered: string[];
  selectedIndex: number;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  onSelect: (cmd: string) => void;
  onClose: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 30,
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '50%',
  boxShadow: '0 -4px 16px rgba(0,0,0,0.4)',
  fontFamily: 'var(--font-ui, sans-serif)',
  fontSize: 12,
};

const inputRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  flexShrink: 0,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '2px 6px',
  borderRadius: 3,
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: 12,
  outline: 'none',
};

function useFilteredCommands(commands: string[], query: string) {
  const filtered = query.trim()
    ? commands.filter((c) => c.toLowerCase().includes(query.toLowerCase()))
    : commands;
  return filtered;
}

function CommandItem({
  cmd,
  isSelected,
  onSelect,
  onHover,
}: {
  cmd: string;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
}): React.ReactElement {
  return (
    <div
      onClick={onSelect}
      onMouseEnter={onHover}
      className={
        isSelected ? 'text-text-semantic-primary bg-surface-raised' : 'text-text-semantic-muted'
      }
      style={{
        padding: '4px 12px',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 12,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        borderLeft: isSelected ? '2px solid var(--interactive-accent)' : '2px solid transparent',
      }}
    >
      {cmd}
    </div>
  );
}

function handleKeyDown(e: React.KeyboardEvent, context: KeyDownContext): void {
  const { filtered, selectedIndex, setSelectedIndex, onSelect, onClose } = context;
  if (e.key === 'Escape') {
    e.preventDefault();
    onClose();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setSelectedIndex((i) => Math.max(i - 1, 0));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (filtered[selectedIndex]) onSelect(filtered[selectedIndex]);
  }
}

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '2px 4px',
  fontSize: 14,
};

function SearchInputRow({
  inputRef,
  query,
  setQuery,
  onClose,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  setQuery: (q: string) => void;
  onClose: () => void;
}): React.ReactElement {
  return (
    <div className="border-b border-border-semantic" style={inputRowStyle}>
      <span className="text-interactive-accent" style={{ fontSize: 11, flexShrink: 0 }}>
        bck-i-search:
      </span>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="bg-surface-base text-text-semantic-primary border border-border-semantic rounded"
        style={inputStyle}
        placeholder="Type to filter history..."
      />
      <button
        onClick={onClose}
        className="text-text-semantic-muted"
        style={closeButtonStyle}
        title="Close (Esc)"
      >
        &#x2715;
      </button>
    </div>
  );
}

function SearchResultList({
  filtered,
  selectedIndex,
  setSelectedIndex,
  onSelect,
}: {
  filtered: string[];
  selectedIndex: number;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  onSelect: (cmd: string) => void;
}): React.ReactElement {
  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      {filtered.length === 0 && (
        <div className="text-text-semantic-muted" style={{ padding: '8px 12px' }}>
          No matching commands
        </div>
      )}
      {filtered.slice(0, 100).map((cmd, i) => (
        <CommandItem
          key={i}
          cmd={cmd}
          isSelected={i === selectedIndex}
          onSelect={() => onSelect(cmd)}
          onHover={() => setSelectedIndex(i)}
        />
      ))}
    </div>
  );
}

export function CommandSearchOverlay({
  commands,
  onSelect,
  onClose,
}: CommandSearchProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const filtered = useFilteredCommands(commands, query);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      className="bg-surface-panel border-t border-border-semantic"
      style={overlayStyle}
      onKeyDown={(e) =>
        handleKeyDown(e, { filtered, selectedIndex, setSelectedIndex, onSelect, onClose })
      }
    >
      <SearchInputRow inputRef={inputRef} query={query} setQuery={setQuery} onClose={onClose} />
      <SearchResultList
        filtered={filtered}
        selectedIndex={selectedIndex}
        setSelectedIndex={setSelectedIndex}
        onSelect={onSelect}
      />
      <div
        className="text-text-semantic-muted border-t border-border-semantic"
        style={{ padding: '4px 10px', fontSize: 10, flexShrink: 0 }}
      >
        Enter to paste · Arrows to navigate · Esc to close
      </div>
    </div>
  );
}
