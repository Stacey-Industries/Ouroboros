/**
 * TerminalContextMenu — right-click context menu for terminal instances.
 *
 * Items:
 * - Copy (enabled only when xterm has a selection)
 * - Paste
 * - Clear (sends Ctrl+L to PTY)
 * - Select All
 *
 * Dismisses on click outside, Escape keydown, and scroll — same pattern
 * as FileTree/ContextMenu.tsx.
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
  visible: false,
  x: 0,
  y: 0,
  hasSelection: false,
}

export interface TerminalContextMenuProps {
  state: TerminalContextMenuState
  terminal: Terminal | null
  sessionId: string
  onClose: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TerminalContextMenu({
  state,
  terminal,
  sessionId,
  onClose,
}: TerminalContextMenuProps): React.ReactElement | null {
  const menuRef = useRef<HTMLDivElement>(null)

  // Dismiss on click outside
  useEffect(() => {
    if (!state.visible) return
    function handleClickOutside(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside, true)
    return () => document.removeEventListener('mousedown', handleClickOutside, true)
  }, [state.visible, onClose])

  // Dismiss on Escape
  useEffect(() => {
    if (!state.visible) return
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [state.visible, onClose])

  // Dismiss on scroll
  useEffect(() => {
    if (!state.visible) return
    function handleScroll(): void {
      onClose()
    }
    document.addEventListener('scroll', handleScroll, true)
    return () => document.removeEventListener('scroll', handleScroll, true)
  }, [state.visible, onClose])

  // Keep menu within viewport bounds
  useEffect(() => {
    if (!state.visible || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let adjustedX = state.x
    let adjustedY = state.y
    if (rect.right > vw) {
      adjustedX = vw - rect.width - 4
    }
    if (rect.bottom > vh) {
      adjustedY = vh - rect.height - 4
    }
    if (adjustedX !== state.x || adjustedY !== state.y) {
      menuRef.current.style.left = `${adjustedX}px`
      menuRef.current.style.top = `${adjustedY}px`
    }
  }, [state.visible, state.x, state.y])

  if (!state.visible || !terminal) return null

  function handleCopy(): void {
    if (!terminal) return
    const selection = terminal.getSelection()
    if (selection) {
      void navigator.clipboard.writeText(selection)
    }
    onClose()
  }

  function handlePaste(): void {
    void navigator.clipboard.readText().then((text) => {
      if (!text) return
      void window.electronAPI.pty.write(sessionId, text)
      // Re-focus the terminal after paste so the user can keep typing
      terminal?.focus()
    })
    onClose()
  }

  function handleClear(): void {
    // Ctrl+L — clear the screen
    void window.electronAPI.pty.write(sessionId, '\x0c')
    onClose()
  }

  function handleSelectAll(): void {
    if (!terminal) return
    terminal.selectAll()
    onClose()
  }

  interface MenuItemDef {
    label: string
    shortcut?: string
    action: () => void
    disabled?: boolean
    separator?: boolean
  }

  const items: MenuItemDef[] = [
    {
      label: 'Copy',
      shortcut: 'Ctrl+C',
      action: handleCopy,
      disabled: !state.hasSelection,
    },
    {
      label: 'Paste',
      shortcut: 'Ctrl+V',
      action: handlePaste,
      separator: true,
    },
    {
      label: 'Select All',
      shortcut: 'Ctrl+A',
      action: handleSelectAll,
      separator: true,
    },
    {
      label: 'Clear',
      shortcut: 'Ctrl+L',
      action: handleClear,
    },
  ]

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed',
        left: state.x,
        top: state.y,
        zIndex: 9999,
        minWidth: '180px',
        padding: '4px 0',
        background: 'var(--bg-secondary, var(--bg))',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
        fontFamily: 'var(--font-ui)',
        fontSize: '0.8125rem',
      }}
    >
      {items.map((item) => (
        <React.Fragment key={item.label}>
          {item.separator && (
            <div
              style={{
                height: '1px',
                margin: '4px 8px',
                background: 'var(--border-muted, var(--border))',
              }}
            />
          )}
          <div
            role="menuitem"
            tabIndex={item.disabled ? undefined : -1}
            aria-disabled={item.disabled}
            onClick={item.disabled ? undefined : item.action}
            style={{
              padding: '6px 12px',
              cursor: item.disabled ? 'default' : 'pointer',
              color: item.disabled ? 'var(--text-faint, var(--text-muted))' : 'var(--text)',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '16px',
              opacity: item.disabled ? 0.4 : 1,
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) {
                e.currentTarget.style.backgroundColor =
                  'rgba(var(--accent-rgb, 88, 166, 255), 0.15)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span
                style={{
                  fontSize: '0.6875rem',
                  color: 'var(--text-faint)',
                  fontFamily: 'var(--font-ui)',
                }}
              >
                {item.shortcut}
              </span>
            )}
          </div>
        </React.Fragment>
      ))}
    </div>
  )
}
