/**
 * TerminalInstance — wraps a single xterm.js Terminal for one PTY session.
 *
 * Delegates to extracted hooks and sub-components:
 * - useTerminalHistory: shell history, Fuse search, Up/Down navigation
 * - useTerminalCompletions: Tab completion (files, git, subcommands)
 * - useTerminalSetup: bootstrap xterm, OSC 133, data/input bridges, cleanup
 * - TerminalToolbar: floating action buttons (sync, split, record, multi-line)
 */

import React, { useEffect, useRef, useCallback, useState } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import type { SearchAddon } from '@xterm/addon-search'
import { useProject } from '../../contexts/ProjectContext'
import '@xterm/xterm/css/xterm.css'
import {
  TerminalContextMenu,
  INITIAL_TERMINAL_CONTEXT_MENU,
} from './TerminalContextMenu'
import type { TerminalContextMenuState } from './TerminalContextMenu'
import { CompletionOverlay } from './CompletionOverlay'
import {
  SelectionTooltip,
  INITIAL_SELECTION_TOOLTIP,
} from './SelectionTooltip'
import type { SelectionTooltipState } from './SelectionTooltip'
import { CommandSearchOverlay } from './CommandHistorySearch'
import { TerminalSearchBar } from './SearchBar'
import { CopyButton } from './CopyButton'
import { PasteConfirmBanner } from './PasteConfirmation'
import { RichInput } from './RichInput'
import { useCommandBlocks } from './useCommandBlocks'
import type { CommandBlock as RichCommandBlock } from './useCommandBlocks'
import { CommandBlockOverlay } from './CommandBlockOverlay'
import { BlockNavigator } from './BlockNavigator'
import { useTerminalHistory } from './useTerminalHistory'
import { useTerminalCompletions } from './useTerminalCompletions'
import { useTerminalSetup } from './useTerminalSetup'
import {
  SyncButton,
  SplitButton,
  RecordingButton,
  MultiLineButton,
} from './TerminalToolbar'

export interface TerminalInstanceProps {
  sessionId: string
  isActive: boolean
  onTitleChange?: (sessionId: string, title: string) => void
  isRecording?: boolean
  onToggleRecording?: (sessionId: string) => void
  onSplit?: (sessionId: string) => void
  syncInput?: boolean
  allSessionIds?: string[]
  onToggleSync?: () => void
  cwd?: string
  commandBlocksEnabled?: boolean
  promptPattern?: string
}

export function TerminalInstance({
  sessionId,
  isActive,
  onTitleChange,
  isRecording = false,
  onToggleRecording,
  onSplit,
  syncInput = false,
  allSessionIds = [],
  onToggleSync,
  cwd,
  commandBlocksEnabled = true,
  promptPattern,
}: TerminalInstanceProps): React.ReactElement {
  const { projectRoot } = useProject()
  const projectRootRef = useRef(projectRoot)
  useEffect(() => { projectRootRef.current = projectRoot }, [projectRoot])

  // ── Refs ────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const isReadyRef = useRef(false)

  const syncInputRef = useRef(syncInput)
  const allSessionIdsRef = useRef(allSessionIds)
  useEffect(() => { syncInputRef.current = syncInput }, [syncInput])
  useEffect(() => { allSessionIdsRef.current = allSessionIds }, [allSessionIds])

  // ── UI state ───────────────────────────────────────────────────────
  const [showSearch, setShowSearch] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [richInputActive, setRichInputActive] = useState(false)
  const [contextMenu, setContextMenu] = useState<TerminalContextMenuState>(
    INITIAL_TERMINAL_CONTEXT_MENU,
  )
  const [pendingPaste, setPendingPaste] = useState<string | null>(null)
  const [selectionTooltip, setSelectionTooltip] = useState<SelectionTooltipState>(
    INITIAL_SELECTION_TOOLTIP,
  )

  // ── Command blocks ─────────────────────────────────────────────────
  const commandBlocks = useCommandBlocks({
    enabled: commandBlocksEnabled ?? true,
    promptPattern,
  })
  const commandBlocksRef = useRef(commandBlocks)
  useEffect(() => { commandBlocksRef.current = commandBlocks }, [commandBlocks])

  // ── History hook ───────────────────────────────────────────────────
  // (completionState is needed by history for inline suggestions)
  const completionHook = useTerminalCompletions({
    sessionId,
    currentLineRef: { current: '' } as React.MutableRefObject<string>,
    isHistorySuggestionRef: { current: false } as React.MutableRefObject<boolean>,
    cwd,
  })

  const historyHook = useTerminalHistory({
    setCompletions: completionHook.state.setCompletions,
    setCompletionIndex: completionHook.state.setCompletionIndex,
    setCompletionVisible: completionHook.state.setCompletionVisible,
    setCompletionPos: completionHook.state.setCompletionPos,
    completionVisibleRef: completionHook.state.completionVisibleRef,
    completionIndexRef: completionHook.state.completionIndexRef,
    completionsRef: completionHook.state.completionsRef,
  })

  // ── Completions hook (re-init with real refs from history) ─────────
  const completions = useTerminalCompletions({
    sessionId,
    currentLineRef: historyHook.historyRefs.currentLineRef,
    isHistorySuggestionRef: historyHook.suggestionControls.isHistorySuggestionRef,
    cwd,
  })

  // ── Setup hook ─────────────────────────────────────────────────────
  const { fit, syncTheme } = useTerminalSetup({
    sessionId,
    refs: { containerRef, terminalRef, fitAddonRef, searchAddonRef, isReadyRef },
    callbacks: {
      onTitleChange,
      setPendingPaste,
      setShowSearch,
      setRichInputActive,
      setShowCmdSearch: historyHook.cmdSearch.setShowCmdSearch,
      setCmdHistory: historyHook.cmdSearch.setCmdHistory,
      setSelectionTooltip,
    },
    completionState: completions.state,
    historyRefs: historyHook.historyRefs,
    suggestionControls: historyHook.suggestionControls,
    handleTabCompletionRef: completions.actions.handleTabCompletionRef,
    syncInputRef,
    allSessionIdsRef,
    projectRootRef,
    commandBlocksRef,
  })

  // ── Fit when becoming active ───────────────────────────────────────
  useEffect(() => {
    if (isActive) {
      requestAnimationFrame(() => requestAnimationFrame(fit))
    }
  }, [isActive, fit])

  // ── Theme updates ─────────────────────────────────────────────────
  useEffect(() => {
    if (!window.electronAPI?.theme?.onChange) return
    return window.electronAPI.theme.onChange(() => {
      requestAnimationFrame(syncTheme)
    })
  }, [syncTheme])

  useEffect(() => {
    const handler = () => requestAnimationFrame(syncTheme)
    window.addEventListener('agent-ide:theme-applied', handler)
    return () => window.removeEventListener('agent-ide:theme-applied', handler)
  }, [syncTheme])

  // ── Context menu ──────────────────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const term = terminalRef.current
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      hasSelection: term ? term.getSelection().length > 0 : false,
    })
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu(INITIAL_TERMINAL_CONTEXT_MENU)
  }, [])

  // ── Paste confirmation ────────────────────────────────────────────
  const handlePasteConfirm = useCallback(() => {
    if (pendingPaste) {
      void window.electronAPI.pty.write(sessionId, pendingPaste)
    }
    setPendingPaste(null)
  }, [pendingPaste, sessionId])

  const handlePasteCancel = useCallback(() => setPendingPaste(null), [])

  useEffect(() => {
    if (!pendingPaste) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setPendingPaste(null) }
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [pendingPaste])

  // ── Rich input ────────────────────────────────────────────────────
  const handleRichInputSubmit = useCallback((text: string) => {
    void window.electronAPI.pty.write(sessionId, text + '\r')
    setRichInputActive(false)
    terminalRef.current?.focus()
  }, [sessionId])

  const handleRichInputCancel = useCallback(() => {
    setRichInputActive(false)
    terminalRef.current?.focus()
  }, [])

  // ── Command search ────────────────────────────────────────────────
  const handleCmdSearchSelect = useCallback((cmd: string) => {
    historyHook.cmdSearch.setShowCmdSearch(false)
    void window.electronAPI.pty.write(sessionId, cmd)
  }, [sessionId, historyHook.cmdSearch])

  const handleCmdSearchClose = useCallback(() => {
    historyHook.cmdSearch.setShowCmdSearch(false)
    terminalRef.current?.focus()
  }, [historyHook.cmdSearch])

  useEffect(() => {
    if (!historyHook.cmdSearch.showCmdSearch) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        historyHook.cmdSearch.setShowCmdSearch(false)
        terminalRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [historyHook.cmdSearch.showCmdSearch, historyHook.cmdSearch])

  // ── Selection tooltip ─────────────────────────────────────────────
  const handleTooltipOpenUrl = useCallback((url: string) => {
    void window.electronAPI.app.openExternal(url)
  }, [])

  const handleTooltipOpenFile = useCallback((filePath: string) => {
    window.dispatchEvent(
      new CustomEvent('agent-ide:open-file', { detail: { filePath } }),
    )
  }, [])

  const handleTooltipDismiss = useCallback(() => {
    setSelectionTooltip(INITIAL_SELECTION_TOOLTIP)
  }, [])

  // ── Command block overlay ─────────────────────────────────────────
  const handleCopyBlockOutput = useCallback((block: RichCommandBlock) => {
    const term = terminalRef.current
    if (!term) return
    void navigator.clipboard.writeText(commandBlocks.getBlockOutput(block, term))
  }, [commandBlocks])

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        display: isActive ? 'flex' : 'none',
        flexDirection: 'column',
        backgroundColor: 'var(--term-bg, var(--bg))',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={handleContextMenu}
    >
      {showSearch && searchAddonRef.current && (
        <TerminalSearchBar
          searchAddon={searchAddonRef.current}
          onClose={() => setShowSearch(false)}
        />
      )}

      {!showSearch && (
        <CopyButton terminal={terminalRef.current} visible={isHovered} />
      )}

      {onToggleSync && (
        <SyncButton
          syncInput={syncInput}
          isHovered={isHovered}
          showSearch={showSearch}
          onToggleSync={onToggleSync}
        />
      )}

      {onSplit && (
        <SplitButton
          sessionId={sessionId}
          isHovered={isHovered}
          showSearch={showSearch}
          onSplit={onSplit}
        />
      )}

      {onToggleRecording && (
        <RecordingButton
          sessionId={sessionId}
          isRecording={isRecording}
          isHovered={isHovered}
          showSearch={showSearch}
          onToggleRecording={onToggleRecording}
        />
      )}

      <div
        ref={containerRef}
        style={{ width: '100%', flex: '1 1 0', minHeight: 0, overflow: 'hidden' }}
        aria-label="Terminal"
        data-session-id={sessionId}
      />

      {commandBlocksEnabled && (
        <CommandBlockOverlay
          blocks={commandBlocks.blocks}
          terminal={terminalRef.current}
          onToggleCollapse={commandBlocks.toggleCollapse}
          onCopyOutput={handleCopyBlockOutput}
          activeBlockIndex={commandBlocks.activeBlockIndex}
        />
      )}

      {commandBlocksEnabled && (
        <BlockNavigator
          totalBlocks={commandBlocks.blocks.length}
          activeIndex={commandBlocks.activeBlockIndex}
          onNavigateUp={() => {
            const t = terminalRef.current
            if (t) commandBlocks.navigatePrev(t)
          }}
          onNavigateDown={() => {
            const t = terminalRef.current
            if (t) commandBlocks.navigateNext(t)
          }}
          visible={commandBlocks.blocks.length >= 2}
        />
      )}

      {completions.state.completionVisible && (
        <CompletionOverlay
          completions={completions.state.completions}
          selectedIndex={completions.state.completionIndex}
          visible={completions.state.completionVisible}
          position={completions.state.completionPos}
          onSelect={(value) => {
            const type = completions.state.completions.find((c) => c.value === value)?.type ?? 'file'
            completions.actions.applyCompletion(value, type)
          }}
          onNavigate={(delta) => {
            const max = completions.state.completions.length - 1
            const next = Math.max(0, Math.min(completions.state.completionIndex + delta, max))
            completions.state.setCompletionIndex(next)
            completions.state.completionIndexRef.current = next
          }}
          onDismiss={() => {
            completions.state.setCompletionVisible(false)
            completions.state.completionVisibleRef.current = false
            historyHook.suggestionControls.isHistorySuggestionRef.current = false
            completions.state.setCompletions([])
          }}
        />
      )}

      {pendingPaste && (
        <PasteConfirmBanner
          text={pendingPaste}
          onConfirm={handlePasteConfirm}
          onCancel={handlePasteCancel}
        />
      )}

      <TerminalContextMenu
        state={contextMenu}
        terminal={terminalRef.current}
        sessionId={sessionId}
        onClose={closeContextMenu}
      />

      <SelectionTooltip
        state={selectionTooltip}
        onOpenUrl={handleTooltipOpenUrl}
        onOpenFile={handleTooltipOpenFile}
        onDismiss={handleTooltipDismiss}
      />

      {historyHook.cmdSearch.showCmdSearch && (
        <CommandSearchOverlay
          commands={historyHook.cmdSearch.cmdHistory}
          onSelect={handleCmdSearchSelect}
          onClose={handleCmdSearchClose}
        />
      )}

      {!richInputActive && (
        <MultiLineButton
          isHovered={isHovered}
          showSearch={showSearch}
          onClick={() => setRichInputActive(true)}
        />
      )}

      <RichInput
        sessionId={sessionId}
        onSubmit={handleRichInputSubmit}
        onCancel={handleRichInputCancel}
        visible={richInputActive}
      />
    </div>
  )
}
