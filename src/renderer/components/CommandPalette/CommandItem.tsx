import React, { memo } from 'react';

import { ProductIcon } from '../shared/ProductIcon';
import { CharHighlight } from './HighlightedText';
import type { Command } from './types';

// ─── CommandItem ──────────────────────────────────────────────────────────────

export interface CommandItemProps {
  command: Command;
  isSelected: boolean;
  matchIndices: number[];
  onSelect: (command: Command) => void;
  onMouseEnter: (command: Command) => void;
}

export const CommandItem = memo(function CommandItem({
  command,
  isSelected,
  matchIndices,
  onSelect,
  onMouseEnter,
}: CommandItemProps): React.ReactElement {
  const hasChildren = Array.isArray(command.children) && command.children.length > 0;

  return (
    <div
      role="option"
      aria-selected={isSelected}
      aria-haspopup={hasChildren ? 'menu' : undefined}
      onClick={() => onSelect(command)}
      onMouseEnter={() => onMouseEnter(command)}
      style={itemStyle(isSelected)}
    >
      {(command.productIconId !== undefined || command.icon !== undefined) && (
        <ItemIcon
          icon={command.icon}
          productIconId={command.productIconId}
          isSelected={isSelected}
        />
      )}
      <ItemLabel command={command} isSelected={isSelected} matchIndices={matchIndices} />
      <RightIndicator command={command} isSelected={isSelected} hasChildren={hasChildren} />
    </div>
  );
});

// ─── Sub-components ──────────────────────────────────────────────────────────

function ItemIcon({
  icon,
  productIconId,
  isSelected,
}: {
  icon?: string;
  productIconId?: string;
  isSelected: boolean;
}): React.ReactElement {
  const style: React.CSSProperties = {
    flexShrink: 0,
    width: '18px',
    fontSize: '12px',
    textAlign: 'center',
    opacity: isSelected ? 0.85 : 0.7,
    fontFamily: 'var(--font-mono)',
  };

  if (productIconId) {
    return (
      <span style={style}>
        <ProductIcon
          iconId={productIconId}
          size={12}
          fallback={<span>{icon ?? '•'}</span>}
        />
      </span>
    );
  }

  return (
    <span style={style}>
      {icon}
    </span>
  );
}

function ItemLabel({
  command,
  isSelected,
  matchIndices,
}: {
  command: Command;
  isSelected: boolean;
  matchIndices: number[];
}): React.ReactElement {
  return (
    <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: '6px' }}>
      {command.category !== undefined && (
        <span
          style={{
            flexShrink: 0,
            fontSize: '11px',
            opacity: isSelected ? 0.7 : 0.45,
            fontFamily: 'var(--font-mono)',
            whiteSpace: 'nowrap',
          }}
        >
          {command.category}
        </span>
      )}
      <span
        style={{
          fontSize: '13px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        <CharHighlight text={command.label} matchIndices={isSelected ? [] : matchIndices} />
      </span>
    </span>
  );
}

function RightIndicator({
  command,
  isSelected,
  hasChildren,
}: {
  command: Command;
  isSelected: boolean;
  hasChildren: boolean;
}): React.ReactElement | null {
  if (hasChildren) {
    return (
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          fontSize: '13px',
          fontFamily: 'var(--font-mono)',
          opacity: isSelected ? 0.7 : 0.4,
          color: isSelected ? 'var(--text-on-accent)' : 'var(--text-muted)',
        }}
      >
        &rarr;
      </span>
    );
  }
  if (command.shortcut !== undefined) {
    return <kbd style={kbdStyle(isSelected)}>{command.shortcut}</kbd>;
  }
  return null;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function itemStyle(isSelected: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 12px',
    cursor: 'pointer',
    borderRadius: '4px',
    margin: '0 4px',
    backgroundColor: isSelected ? 'var(--interactive-accent)' : 'transparent',
    color: isSelected ? 'var(--text-on-accent)' : 'var(--text-primary)',
    transition: 'background-color 80ms ease',
    userSelect: 'none',
    minWidth: 0,
  };
}

function kbdStyle(isSelected: boolean): React.CSSProperties {
  return {
    flexShrink: 0,
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    padding: '1px 5px',
    borderRadius: '3px',
    backgroundColor: isSelected ? 'rgba(0,0,0,0.15)' : 'var(--surface-raised)',
    color: isSelected ? 'var(--text-on-accent)' : 'var(--text-muted)',
    border: `1px solid ${isSelected ? 'rgba(0,0,0,0.2)' : 'var(--border-default)'}`,
    whiteSpace: 'nowrap',
  };
}
