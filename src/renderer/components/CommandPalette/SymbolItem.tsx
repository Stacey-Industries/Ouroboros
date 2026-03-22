import React, { memo } from 'react';
import { RangeHighlight } from './HighlightedText';
import type { SymbolEntry } from '../../types/electron';

const ITEM_HEIGHT = 40;
const EMPTY_INDICES: ReadonlyArray<readonly [number, number]> = [];

const BADGE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  function:  { bg: 'rgba(88, 166, 255, 0.18)',  text: '#58a6ff', label: 'fn'  },
  fn:        { bg: 'rgba(88, 166, 255, 0.18)',  text: '#58a6ff', label: 'fn'  },
  class:     { bg: 'rgba(188, 140, 255, 0.18)', text: '#bc8cff', label: 'cls' },
  interface: { bg: 'rgba(56, 201, 187, 0.18)',  text: '#38c9bb', label: 'if'  },
  type:      { bg: 'rgba(255, 166, 77, 0.18)',  text: '#ffa64d', label: 'ty'  },
  const:     { bg: 'rgba(63, 185, 80, 0.18)',   text: '#3fb950', label: 'co'  },
  def:       { bg: 'rgba(255, 197, 61, 0.18)',  text: '#ffc53d', label: 'def' },
};

const DEFAULT_BADGE = { bg: 'rgba(140, 140, 140, 0.18)', text: '#8c8c8c' };

export interface SymbolItemProps {
  entry: SymbolEntry;
  isSelected: boolean;
  nameIndices: ReadonlyArray<readonly [number, number]>;
  pathIndices: ReadonlyArray<readonly [number, number]>;
  onClick: () => void;
  onMouseEnter: () => void;
}

function getBadge(type: string): { bg: string; text: string; label: string } {
  return BADGE_COLORS[type] ?? { ...DEFAULT_BADGE, label: type.slice(0, 3) };
}

function getDirectoryPart(relativePath: string): string {
  return relativePath.includes('/')
    ? relativePath.slice(0, relativePath.lastIndexOf('/'))
    : '';
}

function getItemStyle(isSelected: boolean): React.CSSProperties {
  return {
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
    color: isSelected ? 'var(--text-on-accent)' : 'var(--text)',
    transition: 'background-color 80ms ease',
    userSelect: 'none',
    minWidth: 0,
  };
}

export const SymbolItem = memo(function SymbolItem({
  entry,
  isSelected,
  nameIndices,
  pathIndices,
  onClick,
  onMouseEnter,
}: SymbolItemProps): React.ReactElement {
  const badge = getBadge(entry.type);
  const dirPart = getDirectoryPart(entry.relativePath);
  const highlightedNameIndices = isSelected ? EMPTY_INDICES : nameIndices;
  const highlightedPathIndices = isSelected ? EMPTY_INDICES : pathIndices;

  return (
    <div
      key={`${entry.filePath}:${entry.line}:${entry.name}`}
      role="option"
      aria-selected={isSelected}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={getItemStyle(isSelected)}
    >
      <TypeBadge badge={badge} isSelected={isSelected} />
      <SymbolName name={entry.name} indices={highlightedNameIndices} />
      <SymbolPath path={dirPart || entry.relativePath} indices={highlightedPathIndices} isSelected={isSelected} />
      <LineNumber line={entry.line} isSelected={isSelected} />
    </div>
  );
});

function TypeBadge({ badge, isSelected }: { badge: { bg: string; text: string; label: string }; isSelected: boolean }): React.ReactElement {
  return (
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
  );
}

function SymbolName({ name, indices }: { name: string; indices: ReadonlyArray<readonly [number, number]> }): React.ReactElement {
  return (
    <span style={{ flexShrink: 0, fontSize: '13px', fontWeight: 500, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
      <RangeHighlight text={name} indices={indices} />
    </span>
  );
}

function SymbolPath({ path, indices, isSelected }: { path: string; indices: ReadonlyArray<readonly [number, number]>; isSelected: boolean }): React.ReactElement {
  return (
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
      <RangeHighlight text={path} indices={indices} />
    </span>
  );
}

function LineNumber({ line, isSelected }: { line: number; isSelected: boolean }): React.ReactElement {
  return (
    <span
      style={{
        flexShrink: 0,
        fontSize: '11px',
        color: isSelected ? 'rgba(255,255,255,0.5)' : 'var(--text-faint)',
        fontFamily: 'var(--font-mono)',
      }}
    >
      :{line}
    </span>
  );
}
