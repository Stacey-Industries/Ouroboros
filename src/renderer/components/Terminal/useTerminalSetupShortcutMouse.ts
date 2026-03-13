import type { Dispatch, SetStateAction } from 'react'
import { Terminal } from '@xterm/xterm'
import { PASTE_CONFIRM_THRESHOLD } from './PasteConfirmation'
import {
  INITIAL_SELECTION_TOOLTIP,
  classifySelection,
} from './SelectionTooltip'
import type {
  TerminalSetupLifecycleContext,
  TerminalSetupRuntimeRefs,
} from './useTerminalSetup.shared'

type CustomShortcut = 'toggleSearch' | 'toggleRichInput' | 'openCmdSearch' | 'copyOrSigint' | 'paste' | null

export function setupCustomKeyHandler(
  context: TerminalSetupLifecycleContext,
  term: Terminal,
): void {
  term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
    if (event.type !== 'keydown') return true
    return handleCustomKey(context, event, term)
  })
}

export function handleMouseUp(
  context: TerminalSetupLifecycleContext,
  event: MouseEvent,
  term: Terminal,
): void {
  setTimeout(() => {
    const selected = term.getSelection()
    if (!selected) {
      context.callbacks.setSelectionTooltip(INITIAL_SELECTION_TOOLTIP)
      return
    }

    const action = classifySelection(selected)
    if (!action) {
      context.callbacks.setSelectionTooltip(INITIAL_SELECTION_TOOLTIP)
      return
    }

    context.callbacks.setSelectionTooltip({
      visible: true,
      x: event.clientX,
      y: event.clientY - 28,
      text: selected,
      action,
    })
  }, 10)
}

export function handleClick(
  runtimeRefs: TerminalSetupRuntimeRefs,
  event: MouseEvent,
  container: HTMLDivElement,
  term: Terminal,
): void {
  runtimeRefs.clickCountRef.current += 1
  scheduleClickReset(runtimeRefs)
  if (runtimeRefs.clickCountRef.current < 3) return
  tripleClickSelect(runtimeRefs, event, container, term)
}

function handleCustomKey(
  context: TerminalSetupLifecycleContext,
  event: KeyboardEvent,
  term: Terminal,
): boolean {
  const shortcut = getCustomShortcut(event)
  if (!shortcut) return true
  if (shortcut === 'toggleSearch') return toggleTerminalFlag(context.callbacks.setShowSearch)
  if (shortcut === 'toggleRichInput') return toggleTerminalFlag(context.callbacks.setRichInputActive)
  if (shortcut === 'openCmdSearch') return openCmdSearch(context)
  if (shortcut === 'copyOrSigint') return handleCopyOrSigint(context, term)
  handlePasteShortcut(context, event)
  return false
}

function getCustomShortcut(event: KeyboardEvent): CustomShortcut {
  if (matchesCtrlShift(event, 'F')) return 'toggleSearch'
  if (matchesCtrlShift(event, 'Enter')) return 'toggleRichInput'

  const plainCtrlKey = getPlainCtrlKey(event)
  if (plainCtrlKey === 'r') return 'openCmdSearch'
  if (plainCtrlKey === 'c') return 'copyOrSigint'
  if (plainCtrlKey === 'v') return 'paste'
  return null
}

function matchesCtrlShift(event: KeyboardEvent, key: string): boolean {
  return event.ctrlKey && event.shiftKey && event.key === key
}

function getPlainCtrlKey(event: KeyboardEvent): string | null {
  if (!event.ctrlKey || event.shiftKey || event.altKey) return null
  return event.key
}

function toggleTerminalFlag(
  setter: Dispatch<SetStateAction<boolean>>,
): false {
  setter((previous) => !previous)
  return false
}

function openCmdSearch(context: TerminalSetupLifecycleContext): false {
  context.callbacks.setShowCmdSearch(true)
  void window.electronAPI.shellHistory.read().then((result) => {
    const fileHistory = result.commands ?? []
    const seen = new Set<string>()
    const merged: string[] = []
    for (const command of [...context.historyRefs.sessionCommandsRef.current, ...fileHistory]) {
      if (!command || seen.has(command)) continue
      seen.add(command)
      merged.push(command)
    }
    context.callbacks.setCmdHistory(merged)
  })
  return false
}

function handleCopyOrSigint(
  context: TerminalSetupLifecycleContext,
  term: Terminal,
): boolean {
  const selection = term.getSelection()
  if (selection) {
    void navigator.clipboard.writeText(selection)
    term.clearSelection()
    return false
  }

  context.historyRefs.currentLineRef.current = ''
  context.suggestionControls.searchHistorySuggestionsRef.current?.('')
  return true
}

function handlePasteShortcut(
  context: TerminalSetupLifecycleContext,
  event: KeyboardEvent,
): void {
  event.preventDefault()
  void navigator.clipboard.readText().then((text) => {
    if (!text) return
    if (text.length > PASTE_CONFIRM_THRESHOLD) {
      context.callbacks.setPendingPaste(text)
      return
    }
    void window.electronAPI.pty.write(context.sessionId, text)
  })
}

function scheduleClickReset(runtimeRefs: TerminalSetupRuntimeRefs): void {
  clearStoredTimer(runtimeRefs.clickResetTimerRef)
  runtimeRefs.clickResetTimerRef.current = setTimeout(() => {
    runtimeRefs.clickCountRef.current = 0
    runtimeRefs.clickResetTimerRef.current = null
  }, 300)
}

function tripleClickSelect(
  runtimeRefs: TerminalSetupRuntimeRefs,
  event: MouseEvent,
  container: HTMLDivElement,
  term: Terminal,
): void {
  runtimeRefs.clickCountRef.current = 0
  clearStoredTimer(runtimeRefs.clickResetTimerRef)
  const buffer = term.buffer.active
  const cellHeight = (container.clientHeight / term.rows) || 16
  const row = Math.floor(event.offsetY / cellHeight)
  const bufferRow = buffer.viewportY + row
  const line = buffer.getLine(bufferRow)
  if (line) term.select(0, bufferRow, line.translateToString(false).length)
  event.preventDefault()
}

function clearStoredTimer(
  timerRef: TerminalSetupRuntimeRefs['clickResetTimerRef'],
): void {
  if (timerRef.current === null) return
  clearTimeout(timerRef.current)
  timerRef.current = null
}
