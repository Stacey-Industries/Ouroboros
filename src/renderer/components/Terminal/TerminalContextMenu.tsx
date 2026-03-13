/**
 * TerminalContextMenu — right-click context menu for terminal instances.
 */

import React, { useEffect, useRef } from 'react'
import type { Terminal } from '@xterm/xterm'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TerminalContextMenuState {
  visible: boolean
  x: number
  y: number
  hasSelection: boolean
}

export const INITIAL_TERMINAL_CONTEXT_MENU: TerminalContextMenuState = {
  visible: false, x: 0, y: 0, hasSelection: false,
}

export interface TerminalContextMenuProps {
  state: TerminalContextMenuState
  terminal: Terminal | null
  sessionId: string
  onClose: () => void
}

// ─── Dismiss hooks ────────────────────────────────────────────────────────────

function useDismissOnClickOutside(
  visible: boolean, menuRef: React.RefObject<HTMLDivElement | null>, onClose: () => void,
): void {
  useEffect(() => {
    if (!visible) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  }, [visible, onClose, menuRef])
}

function useDismissOnEscapeAndScroll(visible: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    const onScroll = () => onClose()
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [visible, onClose])
}

function useViewportBounds(
  visible: boolean, menuRef: React.RefObject<HTMLDivElement | null>, x: number, y: number,
): void {
  useEffect(() => {
    if (!visible || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const adjX = rect.right > window.innerWidth ? window.innerWidth - rect.width - 4 : x
    const adjY = rect.bottom > window.innerHeight ? window.innerHeight - rect.height - 4 : y
    if (adjX !== x || adjY !== y) {
      menuRef.current.style.left = `${adjX}px`
      menuRef.current.style.top = `${adjY}px`
    }
  }, [visible, x, y, menuRef])
}

// ─── Menu item definitions ────────────────────────────────────────────────────

interface MenuItemDef {
  label: string; shortcut?: string
  action: () => void; disabled?: boolean; separator?: boolean
}

function buildMenuItems(
  terminal: Terminal, sessionId: string, hasSelection: boolean, onClose: () => void,
): MenuItemDef[] {
  return [
    { label: 'Copy', shortcut: 'Ctrl+C', disabled: !hasSelection, action() {
      const sel = terminal.getSelection()
      if (sel) void navigator.clipboard.writeText(sel)
      onClose()
    }},
    { label: 'Paste', shortcut: 'Ctrl+V', separator: true, action() {
      void navigator.clipboard.readText().then((t) => {
        if (t) { void window.electronAPI.pty.write(sessionId, t); terminal.focus() }
      })
      onClose()
    }},
    { label: 'Select All', shortcut: 'Ctrl+A', separator: true, action() {
      terminal.selectAll(); onClose()
    }},
    { label: 'Clear', shortcut: 'Ctrl+L', action() {
      void window.electronAPI.pty.write(sessionId, '\x0c'); onClose()
    }},
  ]
}

// ─── MenuItem component ──────────────────────────────────────────────────────

function MenuItem({ item }: { item: MenuItemDef }): React.ReactElement {
  return (
    <div
      role="menuitem"
      tabIndex={item.disabled ? undefined : -1}
      aria-disabled={item.disabled}
      onClick={item.disabled ? undefined : item.action}
      style={{
        padding: '6px 12px', cursor: item.disabled ? 'default' : 'pointer',
        color: item.disabled ? 'var(--text-faint, var(--text-muted))' : 'var(--text)',
        whiteSpace: 'nowrap', userSelect: 'none',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: '16px', opacity: item.disabled ? 0.4 : 1,
      }}
      onMouseEnter={(e) => { if (!item.disabled) e.currentTarget.style.backgroundColor = 'rgba(var(--accent-rgb, 88, 166, 255), 0.15)' }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      <span>{item.label}</span>
      {item.shortcut && <span style={{ fontSize: '0.6875rem', color: 'var(--text-faint)', fontFamily: 'var(--font-ui)' }}>{item.shortcut}</span>}
    </div>
  )
}

// ─── Separator ────────────────────────────────────────────────────────────────

function Separator(): React.ReactElement {
  return <div style={{ height: '1px', margin: '4px 8px', background: 'var(--border-muted, var(--border))' }} />
}

// ─── Component ────────────────────────────────────────────────────────────────

const menuStyle: React.CSSProperties = {
  minWidth: '180px', padding: '4px 0',
  background: 'var(--bg-secondary, var(--bg))',
  border: '1px solid var(--border)', borderRadius: '6px',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
  fontFamily: 'var(--font-ui)', fontSize: '0.8125rem',
}

export function TerminalContextMenu({
  state, terminal, sessionId, onClose,
}: TerminalContextMenuProps): React.ReactElement | null {
  const menuRef = useRef<HTMLDivElement>(null)

  useDismissOnClickOutside(state.visible, menuRef, onClose)
  useDismissOnEscapeAndScroll(state.visible, onClose)
  useViewportBounds(state.visible, menuRef, state.x, state.y)

  if (!state.visible || !terminal) return null

  const items = buildMenuItems(terminal, sessionId, state.hasSelection, onClose)

  return (
    <div ref={menuRef} role="menu" style={{ position: 'fixed', left: state.x, top: state.y, zIndex: 9999, ...menuStyle }}>
      {items.map((item) => (
        <React.Fragment key={item.label}>
          {item.separator && <Separator />}
          <MenuItem item={item} />
        </React.Fragment>
      ))}
    </div>
  )
}
