import React, { memo } from 'react';
import type { Command } from './types';

// ─── Match highlight ──────────────────────────────────────────────────────────

interface HighlightedTextProps {
  text: string;
  matchIndices: number[];
}

const HighlightedText = memo(function HighlightedText({
  text,
  matchIndices,
}: HighlightedTextProps): React.ReactElement {
  if (matchIndices.length === 0) {
    return <span>{text}</span>;
  }

  const indexSet = new Set(matchIndices);
  const parts: React.ReactElement[] = [];
  let i = 0;

  while (i < text.length) {
    if (indexSet.has(i)) {
      // Collect consecutive matched chars into one <mark> span
      let end = i;
      while (end < text.length && indexSet.has(end)) {
        end++;
      }
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
      while (end < text.length && !indexSet.has(end)) {
        end++;
      }
      parts.push(<span key={i}>{text.slice(i, end)}</span>);
      i = end;
    }
  }

  return <>{parts}</>;
});

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
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '7px 12px',
        cursor: 'pointer',
        borderRadius: '4px',
        margin: '0 4px',
        backgroundColor: isSelected ? 'var(--accent)' : 'transparent',
        color: isSelected ? 'var(--bg)' : 'var(--text)',
        transition: 'background-color 80ms ease',
        userSelect: 'none',
        minWidth: 0,
      }}
    >
      {/* Icon */}
      {command.icon !== undefined && (
        <span
          style={{
            flexShrink: 0,
            width: '18px',
            fontSize: '12px',
            textAlign: 'center',
            opacity: isSelected ? 0.85 : 0.7,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {command.icon}
        </span>
      )}

      {/* Category + Label */}
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
          <HighlightedText
            text={command.label}
            matchIndices={isSelected ? [] : matchIndices}
          />
        </span>
      </span>

      {/* Right-side indicator: submenu arrow OR keyboard shortcut */}
      {hasChildren ? (
        <span
          aria-hidden="true"
          style={{
            flexShrink: 0,
            fontSize: '13px',
            fontFamily: 'var(--font-mono)',
            opacity: isSelected ? 0.7 : 0.4,
            color: isSelected ? 'var(--bg)' : 'var(--text-muted)',
          }}
        >
          →
        </span>
      ) : command.shortcut !== undefined ? (
        <kbd
          style={{
            flexShrink: 0,
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            padding: '1px 5px',
            borderRadius: '3px',
            backgroundColor: isSelected
              ? 'rgba(0,0,0,0.15)'
              : 'var(--bg-tertiary)',
            color: isSelected ? 'var(--bg)' : 'var(--text-muted)',
            border: `1px solid ${isSelected ? 'rgba(0,0,0,0.2)' : 'var(--border)'}`,
            whiteSpace: 'nowrap',
          }}
        >
          {command.shortcut}
        </kbd>
      ) : null}
    </div>
  );
});
