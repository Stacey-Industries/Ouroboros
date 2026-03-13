/**
 * CommandSearchOverlay — Ctrl+R command history search overlay for the terminal.
 *
 * Renders a bottom-anchored panel with a search input and filtered command list.
 */

import React, { useRef, useState, useEffect } from 'react'

interface CommandSearchProps {
  commands: string[]
  onSelect: (cmd: string) => void
  onClose: () => void
}

interface KeyDownContext {
  filtered: string[]
  selectedIndex: number
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>
  onSelect: (cmd: string) => void
  onClose: () => void
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30,
  display: 'flex', flexDirection: 'column', maxHeight: '50%',
  backgroundColor: 'var(--bg-secondary, #1e1e1e)',
  borderTop: '1px solid var(--border, #333)',
  boxShadow: '0 -4px 16px rgba(0,0,0,0.4)',
  fontFamily: 'var(--font-ui, sans-serif)', fontSize: 12,
}

const inputRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '6px 10px',
  borderBottom: '1px solid var(--border, #333)',
  flexShrink: 0,
}

const inputStyle: React.CSSProperties = {
  flex: 1, padding: '2px 6px', borderRadius: 3,
  border: '1px solid var(--border, #444)',
  backgroundColor: 'var(--bg, #0d0d0d)',
  color: 'var(--text, #e0e0e0)',
  fontFamily: 'var(--font-mono, monospace)', fontSize: 12,
  outline: 'none',
}

function useFilteredCommands(commands: string[], query: string) {
  const filtered = query.trim()
    ? commands.filter((c) => c.toLowerCase().includes(query.toLowerCase()))
    : commands
  return filtered
}

function CommandItem({ cmd, isSelected, onSelect, onHover }: {
  cmd: string; isSelected: boolean; onSelect: () => void; onHover: () => void
}): React.ReactElement {
  return (
    <div
      onClick={onSelect}
      onMouseEnter={onHover}
      style={{
        padding: '4px 12px', cursor: 'pointer',
        fontFamily: 'var(--font-mono, monospace)', fontSize: 12,
        color: isSelected ? 'var(--text, #e0e0e0)' : 'var(--text-muted, #888)',
        backgroundColor: isSelected ? 'var(--bg-tertiary, #2a2a2a)' : 'transparent',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        borderLeft: isSelected ? '2px solid var(--accent, #58a6ff)' : '2px solid transparent',
      }}
    >
      {cmd}
    </div>
  )
}

function handleKeyDown(e: React.KeyboardEvent, context: KeyDownContext): void {
  const { filtered, selectedIndex, setSelectedIndex, onSelect, onClose } = context
  if (e.key === 'Escape') { e.preventDefault(); onClose() }
  else if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1)) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)) }
  else if (e.key === 'Enter') { e.preventDefault(); if (filtered[selectedIndex]) onSelect(filtered[selectedIndex]) }
}

export function CommandSearchOverlay({ commands, onSelect, onClose }: CommandSearchProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const filtered = useFilteredCommands(commands, query)

  useEffect(() => { setSelectedIndex(0) }, [query])
  useEffect(() => { inputRef.current?.focus() }, [])

  return (
    <div
      style={overlayStyle}
      onKeyDown={(e) => handleKeyDown(e, { filtered, selectedIndex, setSelectedIndex, onSelect, onClose })}
    >
      <div style={inputRowStyle}>
        <span style={{ color: 'var(--accent, #58a6ff)', fontSize: 11, flexShrink: 0 }}>bck-i-search:</span>
        <input ref={inputRef} type="text" value={query} onChange={(e) => setQuery(e.target.value)} style={inputStyle} placeholder="Type to filter history..." />
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted, #888)', cursor: 'pointer', padding: '2px 4px', fontSize: 14 }} title="Close (Esc)">&#x2715;</button>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {filtered.length === 0 && <div style={{ padding: '8px 12px', color: 'var(--text-muted, #888)' }}>No matching commands</div>}
        {filtered.slice(0, 100).map((cmd, i) => (
          <CommandItem key={i} cmd={cmd} isSelected={i === selectedIndex} onSelect={() => onSelect(cmd)} onHover={() => setSelectedIndex(i)} />
        ))}
      </div>
      <div style={{ padding: '4px 10px', borderTop: '1px solid var(--border, #333)', color: 'var(--text-muted, #888)', fontSize: 10, flexShrink: 0 }}>
        Enter to paste  ·  Arrows to navigate  ·  Esc to close
      </div>
    </div>
  )
}
