import React, { useCallback, useEffect, useRef, useState } from 'react'

import type { CodexModelOption } from '../../types/electron'

function useClickOutside(
  menuRef: React.RefObject<HTMLDivElement | null>,
  anchorRef: React.RefObject<HTMLButtonElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      const target = event.target as Node
      if (menuRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [anchorRef, menuRef, onClose])
}

function useCodexModels(): CodexModelOption[] {
  const [models, setModels] = useState<CodexModelOption[]>([])
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    if (typeof window === 'undefined' || !('electronAPI' in window)) return
    loadedRef.current = true
    window.electronAPI.codex.listModels().then(setModels).catch(() => {})
  }, [])

  return models
}

export function CodexModelMenu({ anchorRef, onSelect, onClose }: {
  anchorRef: React.RefObject<HTMLButtonElement | null>
  onSelect: (value: string) => void
  onClose: () => void
}): React.ReactElement {
  const menuRef = useRef<HTMLDivElement>(null)
  const models = useCodexModels()

  useClickOutside(menuRef, anchorRef, onClose)

  const handleSelect = useCallback((value: string) => {
    onSelect(value)
    onClose()
  }, [onClose, onSelect])

  return (
    <div
      ref={menuRef}
      role="menu"
      className="absolute top-full left-0 mt-0.5 z-50 min-w-[220px] max-h-[280px] overflow-y-auto rounded border border-border-semantic bg-surface-panel shadow-lg py-1"
      style={{ fontFamily: 'var(--font-ui)' }}
    >
      <div className="px-2 py-1 text-[9px] font-medium uppercase tracking-wider text-text-semantic-muted">
        Select Codex model
      </div>
      {models.map((model) => (
        <button
          key={model.id}
          role="menuitem"
          className="w-full text-left px-3 py-1 text-[11px] text-text-semantic-primary hover:bg-surface-raised transition-colors duration-100 cursor-pointer"
          onClick={() => handleSelect(model.id)}
          title={model.description}
        >
          {model.name}
        </button>
      ))}
    </div>
  )
}
