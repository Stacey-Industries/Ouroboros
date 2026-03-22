import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { Terminal } from '@xterm/xterm'
import { INITIAL_TERMINAL_CONTEXT_MENU } from './TerminalContextMenu'
import type { TerminalContextMenuState } from './TerminalContextMenu'
import { INITIAL_SELECTION_TOOLTIP } from './SelectionTooltip'
import type { SelectionTooltipState } from './SelectionTooltip'
import { writeChunkedPaste } from './terminalPasteHelpers'
import { useTerminalHistory } from './useTerminalHistory'

export function useLatestRef<T>(value: T): React.MutableRefObject<T> {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  }, [value])
  return ref
}

export function useThemeSync(syncTheme: () => void): void {
  useEffect(() => {
    if (!window.electronAPI?.theme?.onChange) {
      return undefined
    }
    return window.electronAPI.theme.onChange(() => {
      requestAnimationFrame(syncTheme)
    })
  }, [syncTheme])

  useEffect(() => {
    const handler = () => requestAnimationFrame(syncTheme)
    window.addEventListener('agent-ide:theme-applied', handler)
    return () => window.removeEventListener('agent-ide:theme-applied', handler)
  }, [syncTheme])
}

export function useContextMenuState(
  terminalRef: React.RefObject<Terminal | null>,
): {
  contextMenu: TerminalContextMenuState
  handleContextMenu: (event: React.MouseEvent) => void
  closeContextMenu: () => void
} {
  const [contextMenu, setContextMenu] = useState<TerminalContextMenuState>(
    INITIAL_TERMINAL_CONTEXT_MENU,
  )

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const terminal = terminalRef.current
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      hasSelection: terminal ? terminal.getSelection().length > 0 : false,
    })
  }, [terminalRef])

  const closeContextMenu = useCallback(() => {
    setContextMenu(INITIAL_TERMINAL_CONTEXT_MENU)
  }, [])

  return { contextMenu, handleContextMenu, closeContextMenu }
}

export function usePendingPaste(sessionId: string): {
  pendingPaste: string | null
  setPendingPaste: React.Dispatch<React.SetStateAction<string | null>>
  handlePasteConfirm: () => void
  handlePasteSingleLine: () => void
  handlePasteCancel: () => void
} {
  const [pendingPaste, setPendingPaste] = useState<string | null>(null)

  const handlePasteConfirm = useCallback(() => {
    if (pendingPaste) {
      void writeChunkedPaste(sessionId, pendingPaste)
    }
    setPendingPaste(null)
  }, [pendingPaste, sessionId])

  const handlePasteSingleLine = useCallback(() => {
    if (pendingPaste) {
      const collapsed = pendingPaste.replace(/[\r\n]+/g, ' ').trim()
      void writeChunkedPaste(sessionId, collapsed)
    }
    setPendingPaste(null)
  }, [pendingPaste, sessionId])

  const handlePasteCancel = useCallback(() => setPendingPaste(null), [])

  useEffect(() => {
    if (!pendingPaste) {
      return undefined
    }
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setPendingPaste(null)
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [pendingPaste])

  return { pendingPaste, setPendingPaste, handlePasteConfirm, handlePasteSingleLine, handlePasteCancel }
}

export function useRichInputState(
  sessionId: string,
  terminalRef: React.RefObject<Terminal | null>,
): {
  richInputActive: boolean
  setRichInputActive: React.Dispatch<React.SetStateAction<boolean>>
  openRichInput: () => void
  handleRichInputSubmit: (text: string) => void
  handleRichInputCancel: () => void
} {
  const [richInputActive, setRichInputActive] = useState(false)
  const focusTerminal = useCallback(() => terminalRef.current?.focus(), [terminalRef])

  const handleRichInputSubmit = useCallback((text: string) => {
    void (async () => {
      await writeChunkedPaste(sessionId, text)
      await window.electronAPI.pty.write(sessionId, '\r')
      setRichInputActive(false)
      focusTerminal()
    })()
  }, [focusTerminal, sessionId])

  const handleRichInputCancel = useCallback(() => {
    setRichInputActive(false)
    focusTerminal()
  }, [focusTerminal])

  const openRichInput = useCallback(() => setRichInputActive(true), [])

  return {
    richInputActive,
    setRichInputActive,
    openRichInput,
    handleRichInputSubmit,
    handleRichInputCancel,
  }
}

export function useSelectionTooltipState(): {
  selectionTooltip: SelectionTooltipState
  setSelectionTooltip: React.Dispatch<React.SetStateAction<SelectionTooltipState>>
  handleTooltipOpenUrl: (url: string) => void
  handleTooltipOpenFile: (filePath: string) => void
  handleTooltipDismiss: () => void
} {
  const [selectionTooltip, setSelectionTooltip] = useState<SelectionTooltipState>(
    INITIAL_SELECTION_TOOLTIP,
  )

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

  return {
    selectionTooltip,
    setSelectionTooltip,
    handleTooltipOpenUrl,
    handleTooltipOpenFile,
    handleTooltipDismiss,
  }
}

export function useCommandSearchActions(
  sessionId: string,
  cmdSearch: ReturnType<typeof useTerminalHistory>['cmdSearch'],
  terminalRef: React.RefObject<Terminal | null>,
): {
  handleCmdSearchSelect: (command: string) => void
  handleCmdSearchClose: () => void
} {
  const focusTerminal = useCallback(() => terminalRef.current?.focus(), [terminalRef])

  const handleCmdSearchClose = useCallback(() => {
    cmdSearch.setShowCmdSearch(false)
    focusTerminal()
  }, [cmdSearch, focusTerminal])

  const handleCmdSearchSelect = useCallback((command: string) => {
    cmdSearch.setShowCmdSearch(false)
    void window.electronAPI.pty.write(sessionId, command)
  }, [cmdSearch, sessionId])

  useEffect(() => {
    if (!cmdSearch.showCmdSearch) {
      return undefined
    }
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        handleCmdSearchClose()
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [cmdSearch.showCmdSearch, handleCmdSearchClose])

  return { handleCmdSearchSelect, handleCmdSearchClose }
}
