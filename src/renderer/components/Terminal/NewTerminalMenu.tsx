/**
 * NewTerminalMenu — dropdown shown when clicking the "+" button in the terminal tab bar.
 * Offers Terminal, Claude Code, and Codex options with hover submenus for model selection.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import type { ModelProvider, CodexModelOption } from '../../types/electron'

// ─── Model data hooks ────────────────────────────────────────────────────────

interface ModelOption {
  value: string
  label: string
  group: string
}

const ANTHROPIC_MODELS: ModelOption[] = [
  { value: 'opus[1m]', label: 'Opus 4.6 (1M)', group: 'Anthropic' },
  { value: 'opus', label: 'Opus 4.6 (200K)', group: 'Anthropic' },
  { value: 'sonnet', label: 'Sonnet 4.6 (200K)', group: 'Anthropic' },
  { value: 'haiku', label: 'Haiku 4.5 (200K)', group: 'Anthropic' },
]

function buildAllModelOptions(providers: ModelProvider[]): ModelOption[] {
  const providerModels = providers
    .filter((p) => p.enabled && p.models.length > 0)
    .flatMap((p) =>
      p.models.map((m) => ({
        value: `${p.id}:${m.id}`,
        label: `${p.name} / ${m.name}`,
        group: p.name,
      })),
    )
  return [...ANTHROPIC_MODELS, ...providerModels]
}

function useClaudeModels(): ModelOption[] {
  const [models, setModels] = useState<ModelOption[]>(ANTHROPIC_MODELS)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    if (typeof window === 'undefined' || !('electronAPI' in window)) return
    loadedRef.current = true
    window.electronAPI.config
      .get('modelProviders')
      .then((providers: ModelProvider[]) => {
        if (providers?.length) setModels(buildAllModelOptions(providers))
      })
      .catch(() => {})
  }, [])

  return models
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupByName(models: ModelOption[]): Map<string, ModelOption[]> {
  const groups = new Map<string, ModelOption[]>()
  for (const m of models) {
    const list = groups.get(m.group) ?? []
    list.push(m)
    groups.set(m.group, list)
  }
  return groups
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function TerminalIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <path d="M4.5 5.5L7 8L4.5 10.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="9" y1="10.5" x2="11.5" y2="10.5" strokeLinecap="round" />
    </svg>
  )
}

function ChevronRightIcon(): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3.5 2L6.5 5L3.5 8" />
    </svg>
  )
}

// ─── Submenu components ──────────────────────────────────────────────────────

function ClaudeSubmenu({ models, onSelect }: {
  models: ModelOption[]
  onSelect: (value: string) => void
}): React.ReactElement {
  const groups = groupByName(models)

  return (
    <div className="absolute left-full top-0 -mt-1 ml-0.5 z-50 min-w-[180px] max-h-[280px] overflow-y-auto rounded border border-border-semantic bg-surface-panel shadow-lg py-1">
      {Array.from(groups.entries()).map(([group, items]) => (
        <div key={group}>
          <div className="px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-text-semantic-muted opacity-60">
            {group}
          </div>
          {items.map((m) => (
            <button
              key={m.value}
              role="menuitem"
              className="w-full text-left px-3 py-1 text-[11px] text-text-semantic-primary hover:bg-surface-raised transition-colors duration-100 cursor-pointer"
              onClick={() => onSelect(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

function CodexSubmenu({ models, onSelect }: {
  models: CodexModelOption[]
  onSelect: (value: string) => void
}): React.ReactElement {
  return (
    <div className="absolute left-full top-0 -mt-1 ml-0.5 z-50 min-w-[200px] max-h-[280px] overflow-y-auto rounded border border-border-semantic bg-surface-panel shadow-lg py-1">
      {models.map((model) => (
        <button
          key={model.id}
          role="menuitem"
          className="w-full text-left px-3 py-1 text-[11px] text-text-semantic-primary hover:bg-surface-raised transition-colors duration-100 cursor-pointer"
          onClick={() => onSelect(model.id)}
          title={model.description}
        >
          {model.name}
        </button>
      ))}
    </div>
  )
}

// ─── Main menu ───────────────────────────────────────────────────────────────

export interface NewTerminalMenuProps {
  anchorRef: React.RefObject<HTMLButtonElement | null>
  onNew: () => void
  onNewClaude: (providerModel?: string) => void
  onNewCodex: (model?: string) => void
  onClose: () => void
}

const MENU_ITEM =
  'w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-text-semantic-primary hover:bg-surface-raised transition-colors duration-100 cursor-pointer'

export function NewTerminalMenu({
  anchorRef,
  onNew,
  onNewClaude,
  onNewCodex,
  onClose,
}: NewTerminalMenuProps): React.ReactElement {
  const menuRef = useRef<HTMLDivElement>(null)
  const [submenu, setSubmenu] = useState<'claude' | 'codex' | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const claudeModels = useClaudeModels()
  const codexModels = useCodexModels()

  // Position the menu below the anchor button using fixed positioning
  // (escapes overflow:hidden on the terminal header)
  useEffect(() => {
    if (!anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 2, left: rect.left })
  }, [anchorRef])

  // Click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      const target = e.target as Node
      if (menuRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [anchorRef, onClose])

  // Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleNew = useCallback(() => {
    onNew()
    onClose()
  }, [onNew, onClose])

  const handleClaude = useCallback(() => {
    onNewClaude()
    onClose()
  }, [onNewClaude, onClose])

  const handleClaudeModel = useCallback(
    (model: string) => {
      onNewClaude(model)
      onClose()
    },
    [onNewClaude, onClose],
  )

  const handleCodex = useCallback(() => {
    onNewCodex()
    onClose()
  }, [onNewCodex, onClose])

  const handleCodexModel = useCallback(
    (model: string) => {
      onNewCodex(model)
      onClose()
    },
    [onNewCodex, onClose],
  )

  if (!pos) return <></>

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-50 min-w-[200px] rounded border border-border-semantic bg-surface-panel shadow-lg py-1"
      style={{ fontFamily: 'var(--font-ui)', top: pos.top, left: pos.left }}
    >
      {/* Plain terminal */}
      <button role="menuitem" className={MENU_ITEM} onClick={handleNew}>
        <TerminalIcon />
        <span>Terminal</span>
        <span className="ml-auto text-text-semantic-muted text-[10px] opacity-60">Ctrl+Shift+`</span>
      </button>

      <div className="h-px bg-border-semantic my-1" />

      {/* Claude Code — click for default, hover for model submenu */}
      <div
        className="relative"
        onMouseEnter={() => setSubmenu('claude')}
        onMouseLeave={() => setSubmenu(null)}
      >
        <button role="menuitem" className={MENU_ITEM} onClick={handleClaude}>
          <span className="flex-shrink-0 text-interactive-accent" style={{ fontSize: '10px', lineHeight: 1 }}>
            &#9670;
          </span>
          <span>Claude Code</span>
          <span className="ml-auto text-text-semantic-muted">
            <ChevronRightIcon />
          </span>
        </button>
        {submenu === 'claude' && (
          <ClaudeSubmenu models={claudeModels} onSelect={handleClaudeModel} />
        )}
      </div>

      {/* Codex — click for default, hover for model submenu */}
      <div
        className="relative"
        onMouseEnter={() => setSubmenu('codex')}
        onMouseLeave={() => setSubmenu(null)}
      >
        <button role="menuitem" className={MENU_ITEM} onClick={handleCodex}>
          <span
            className="flex-shrink-0 text-[var(--accent-blue,var(--accent))]"
            style={{ fontSize: '10px', lineHeight: 1 }}
          >
            &#9671;
          </span>
          <span>Codex</span>
          {codexModels.length > 0 && (
            <span className="ml-auto text-text-semantic-muted">
              <ChevronRightIcon />
            </span>
          )}
        </button>
        {submenu === 'codex' && codexModels.length > 0 && (
          <CodexSubmenu models={codexModels} onSelect={handleCodexModel} />
        )}
      </div>
    </div>
  )
}
