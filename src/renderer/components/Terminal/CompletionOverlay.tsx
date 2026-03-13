/**
 * CompletionOverlay — floating Tab completion popup for the terminal.
 *
 * Renders a small dropdown above the cursor showing file paths, git branches,
 * git subcommands, and common CLI completions. Keyboard-navigable.
 */

import React, { useEffect, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Completion {
  value: string
  type: 'file' | 'dir' | 'branch' | 'cmd' | 'git-subcmd'
}

export interface CompletionOverlayProps {
  completions: Completion[]
  selectedIndex: number
  visible: boolean
  position: { x: number; y: number }
  onSelect: (value: string) => void
  onNavigate: (delta: number) => void
  onDismiss: () => void
}

// ─── Badge config ─────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<Completion['type'], string> = {
  file: 'file', dir: 'dir', branch: 'branch', cmd: 'cmd', 'git-subcmd': 'git',
}

const TYPE_COLORS: Record<Completion['type'], string> = {
  file: 'var(--text-muted, #888)', dir: 'var(--accent, #58a6ff)',
  branch: 'var(--git-added, #3fb950)', cmd: 'var(--text-secondary, #aaa)',
  'git-subcmd': 'var(--text-secondary, #aaa)',
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CompletionItem({ completion, isSelected, onClick, onHover }: {
  completion: Completion; isSelected: boolean; onClick: () => void; onHover: () => void
}): React.ReactElement {
  const color = TYPE_COLORS[completion.type]
  return (
    <div
      onClick={onClick}
      onMouseEnter={onHover}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '3px 8px', height: 24, cursor: 'pointer',
        backgroundColor: isSelected ? 'var(--bg-tertiary, #2a2a2a)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--accent, #58a6ff)' : '2px solid transparent',
        color: isSelected ? 'var(--text, #e0e0e0)' : 'var(--text-muted, #888)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      <span style={{
        fontSize: 9, fontFamily: 'var(--font-ui, sans-serif)',
        padding: '1px 4px', borderRadius: 2, border: `1px solid ${color}`,
        color, opacity: 0.9, flexShrink: 0,
        letterSpacing: '0.03em', textTransform: 'uppercase', lineHeight: '14px',
      }}>
        {TYPE_LABELS[completion.type]}
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{completion.value}</span>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

const MAX_VISIBLE = 8
const ITEM_HEIGHT = 24

export function CompletionOverlay({
  completions, selectedIndex, visible, position, onSelect, onNavigate,
}: CompletionOverlayProps): React.ReactElement | null {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!listRef.current) return
    const item = listRef.current.children[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!visible || completions.length === 0) return null

  return (
    <div
      ref={listRef}
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: 'absolute', left: position.x, bottom: Math.abs(position.y),
        zIndex: 50, minWidth: 200, maxWidth: 420,
        maxHeight: MAX_VISIBLE * ITEM_HEIGHT + 2, overflowY: 'auto',
        backgroundColor: 'var(--bg-secondary, #1e1e1e)',
        border: '1px solid var(--border, #333)', borderRadius: 4,
        boxShadow: '0 -4px 16px rgba(0,0,0,0.45)',
        fontFamily: 'var(--font-mono, monospace)', fontSize: 12,
        userSelect: 'none',
      }}
    >
      {completions.map((c, i) => (
        <CompletionItem
          key={`${c.type}:${c.value}:${i}`}
          completion={c}
          isSelected={i === selectedIndex}
          onClick={() => onSelect(c.value)}
          onHover={() => onNavigate(i - selectedIndex)}
        />
      ))}
      <div style={{
        padding: '3px 8px', borderTop: '1px solid var(--border, #333)',
        color: 'var(--text-muted, #666)', fontSize: 10,
        fontFamily: 'var(--font-ui, sans-serif)', whiteSpace: 'nowrap',
      }}>
        Tab/Enter to select · Esc to dismiss
      </div>
    </div>
  )
}
