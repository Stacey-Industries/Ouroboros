/**
 * CompletionOverlay â€” floating Tab completion popup for the terminal.
 *
 * Renders a small dropdown above the cursor showing file paths, git branches,
 * git subcommands, and common CLI completions. Keyboard-navigable.
 */

import React, { useEffect, useRef } from 'react';

export interface Completion {
  value: string;
  type: 'file' | 'dir' | 'branch' | 'cmd' | 'git-subcmd';
}

export interface CompletionOverlayProps {
  completions: Completion[];
  selectedIndex: number;
  visible: boolean;
  position: { x: number; y: number };
  onSelect: (value: string) => void;
  onNavigate: (delta: number) => void;
  onDismiss: () => void;
}

const MAX_VISIBLE = 8;
const ITEM_HEIGHT = 24;

const TYPE_LABELS: Record<Completion['type'], string> = {
  file: 'file',
  dir: 'dir',
  branch: 'branch',
  cmd: 'cmd',
  'git-subcmd': 'git',
};

const TYPE_COLORS: Record<Completion['type'], string> = {
  file: 'var(--text-muted, #888)',
  dir: 'var(--interactive-accent)',
  branch: 'var(--git-added, var(--status-success))',
  cmd: 'var(--text-secondary, #aaa)',
  'git-subcmd': 'var(--text-secondary, #aaa)',
};

function useSelectedItemScroll(
  listRef: React.RefObject<HTMLDivElement | null>,
  selectedIndex: number,
): void {
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [listRef, selectedIndex]);
}

export function CompletionOverlay({
  completions,
  selectedIndex,
  visible,
  position,
  onSelect,
  onNavigate,
}: CompletionOverlayProps): React.ReactElement | null {
  const listRef = useRef<HTMLDivElement>(null);

  useSelectedItemScroll(listRef, selectedIndex);

  if (!visible || completions.length === 0) return null;

  return (
    <CompletionOverlayBody
      listRef={listRef}
      completions={completions}
      position={position}
      selectedIndex={selectedIndex}
      onSelect={onSelect}
      onNavigate={onNavigate}
    />
  );
}

function CompletionOverlayBody({
  listRef,
  completions,
  position,
  selectedIndex,
  onSelect,
  onNavigate,
}: {
  listRef: React.RefObject<HTMLDivElement | null>;
  completions: Completion[];
  position: { x: number; y: number };
  selectedIndex: number;
  onSelect: (value: string) => void;
  onNavigate: (delta: number) => void;
}): React.ReactElement {
  return (
    <div
      ref={listRef}
      onMouseDown={(e) => e.preventDefault()}
      className="bg-surface-panel border border-border-semantic"
      style={getOverlayStyle(position)}
    >
      {completions.map((completion, index) => (
        <CompletionItem
          key={`${completion.type}:${completion.value}:${index}`}
          completion={completion}
          isSelected={index === selectedIndex}
          onClick={() => onSelect(completion.value)}
          onHover={() => onNavigate(index - selectedIndex)}
        />
      ))}
      <CompletionHint />
    </div>
  );
}

function getOverlayStyle(position: { x: number; y: number }): React.CSSProperties {
  return {
    position: 'absolute',
    left: position.x,
    bottom: Math.abs(position.y),
    zIndex: 50,
    minWidth: 200,
    maxWidth: 420,
    maxHeight: MAX_VISIBLE * ITEM_HEIGHT + 2,
    overflowY: 'auto',
    borderRadius: 4,
    boxShadow: '0 -4px 16px rgba(0,0,0,0.45)',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 12,
    userSelect: 'none',
  };
}

function CompletionItem({
  completion,
  isSelected,
  onClick,
  onHover,
}: {
  completion: Completion;
  isSelected: boolean;
  onClick: () => void;
  onHover: () => void;
}): React.ReactElement {
  const color = TYPE_COLORS[completion.type];

  return (
    <div
      onClick={onClick}
      onMouseEnter={onHover}
      className={
        isSelected ? 'bg-surface-raised text-text-semantic-primary' : 'text-text-semantic-muted'
      }
      style={getCompletionItemStyle(isSelected)}
    >
      <CompletionTypeBadge type={completion.type} color={color} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{completion.value}</span>
    </div>
  );
}

function getCompletionItemStyle(isSelected: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 8px',
    height: 24,
    cursor: 'pointer',
    borderLeft: isSelected ? '2px solid var(--interactive-accent)' : '2px solid transparent',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };
}

function CompletionTypeBadge({
  type,
  color,
}: {
  type: Completion['type'];
  color: string;
}): React.ReactElement {
  return (
    <span
      style={{
        fontSize: 9,
        fontFamily: 'var(--font-ui, sans-serif)',
        padding: '1px 4px',
        borderRadius: 2,
        border: `1px solid ${color}`,
        color,
        opacity: 0.9,
        flexShrink: 0,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
        lineHeight: '14px',
      }}
    >
      {TYPE_LABELS[type]}
    </span>
  );
}

function CompletionHint(): React.ReactElement {
  return (
    <div
      className="text-text-semantic-muted border-t border-border-semantic"
      style={{
        padding: '3px 8px',
        fontSize: 10,
        fontFamily: 'var(--font-ui, sans-serif)',
        whiteSpace: 'nowrap',
      }}
    >
      Tab/Enter to select · Esc to dismiss
    </div>
  );
}
