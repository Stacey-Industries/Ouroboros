import React, { memo } from 'react';

import type { SymbolEntry } from '../../types/electron';
import { RangeHighlight } from './HighlightedText';

const ITEM_HEIGHT = 40;
const EMPTY_INDICES: ReadonlyArray<readonly [number, number]> = [];

const BADGE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  function: { bg: 'var(--interactive-accent-subtle)', text: 'var(--interactive-accent)', label: 'fn' },
  fn: { bg: 'var(--interactive-accent-subtle)', text: 'var(--interactive-accent)', label: 'fn' },
  class: { bg: 'color-mix(in srgb, var(--palette-purple) 18%, transparent)', text: 'var(--palette-purple)', label: 'cls' },
  interface: { bg: 'color-mix(in srgb, var(--status-info) 18%, transparent)', text: 'var(--status-info)', label: 'if' },
  type: { bg: 'color-mix(in srgb, var(--status-warning) 18%, transparent)', text: 'var(--status-warning)', label: 'ty' },
  const: { bg: 'var(--status-success-subtle)', text: 'var(--status-success)', label: 'co' },
  def: { bg: 'color-mix(in srgb, var(--status-warning) 18%, transparent)', text: 'var(--status-warning)', label: 'def' },
};

const DEFAULT_BADGE = { bg: 'color-mix(in srgb, var(--text-muted) 18%, transparent)', text: 'var(--text-muted)' };

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
  return relativePath.includes('/') ? relativePath.slice(0, relativePath.lastIndexOf('/')) : '';
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
    backgroundColor: isSelected ? 'var(--interactive-accent)' : 'transparent',
    color: isSelected ? 'var(--text-on-accent)' : 'var(--text-primary)',
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
      <SymbolPath
        path={dirPart || entry.relativePath}
        indices={highlightedPathIndices}
        isSelected={isSelected}
      />
      <LineNumber line={entry.line} isSelected={isSelected} />
    </div>
  );
});

function TypeBadge({
  badge,
  isSelected,
}: {
  badge: { bg: string; text: string; label: string };
  isSelected: boolean;
}): React.ReactElement {
  return (
    <span
      style={{
        flexShrink: 0,
        fontSize: '10px',
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        padding: '1px 5px',
        borderRadius: '3px',
        backgroundColor: isSelected ? 'var(--surface-hover)' : badge.bg,
        color: isSelected ? 'var(--text-on-accent)' : badge.text,
        letterSpacing: '0.02em',
        minWidth: '26px',
        textAlign: 'center',
      }}
    >
      {badge.label}
    </span>
  );
}

function SymbolName({
  name,
  indices,
}: {
  name: string;
  indices: ReadonlyArray<readonly [number, number]>;
}): React.ReactElement {
  return (
    <span
      style={{
        flexShrink: 0,
        fontSize: '13px',
        fontWeight: 500,
        fontFamily: 'var(--font-mono)',
        whiteSpace: 'nowrap',
      }}
    >
      <RangeHighlight text={name} indices={indices} />
    </span>
  );
}

function SymbolPath({
  path,
  indices,
  isSelected,
}: {
  path: string;
  indices: ReadonlyArray<readonly [number, number]>;
  isSelected: boolean;
}): React.ReactElement {
  return (
    <span
      style={{
        flex: 1,
        minWidth: 0,
        fontSize: '11px',
        color: isSelected ? 'color-mix(in srgb, var(--text-on-accent) 60%, transparent)' : 'var(--text-faint)',
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

function LineNumber({
  line,
  isSelected,
}: {
  line: number;
  isSelected: boolean;
}): React.ReactElement {
  return (
    <span
      style={{
        flexShrink: 0,
        fontSize: '11px',
        color: isSelected ? 'color-mix(in srgb, var(--text-on-accent) 50%, transparent)' : 'var(--text-faint)',
        fontFamily: 'var(--font-mono)',
      }}
    >
      :{line}
    </span>
  );
}
