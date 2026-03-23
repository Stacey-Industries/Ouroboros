import { Terminal } from '@xterm/xterm'
import type { Dispatch, SetStateAction } from 'react'

import { PASTE_CONFIRM_THRESHOLD } from './PasteConfirmation'
import {
  classifySelection,
  INITIAL_SELECTION_TOOLTIP,
} from './SelectionTooltip'
import { writeChunkedPaste } from './terminalPasteHelpers'
import type {
  TerminalSetupLifecycleContext,
  TerminalSetupRuntimeRefs,
} from './useTerminalSetup.shared'

type CustomShortcut = 'toggleSearch' | 'toggleRichInput' | 'openCmdSearch' | 'copyOrSigint' | 'paste' | 'navBlockPrev' | 'navBlockNext' | 'fontZoomIn' | 'fontZoomOut' | 'fontZoomReset' | null

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

type ShortcutHandler = (context: TerminalSetupLifecycleContext, event: KeyboardEvent, term: Terminal) => boolean

const SHORTCUT_HANDLERS: Partial<Record<NonNullable<CustomShortcut>, ShortcutHandler>> = {
  toggleSearch: (ctx) => toggleTerminalFlag(ctx.callbacks.setShowSearch),
  toggleRichInput: (ctx) => toggleTerminalFlag(ctx.callbacks.setRichInputActive),
  openCmdSearch: (ctx) => openCmdSearch(ctx),
  copyOrSigint: (ctx, _e, t) => handleCopyOrSigint(ctx, t),
  navBlockPrev: (ctx, _e, t) => handleBlockNav(ctx, t, 'prev'),
  navBlockNext: (ctx, _e, t) => handleBlockNav(ctx, t, 'next'),
  fontZoomIn: (ctx, _e, t) => handleFontZoom(ctx, t, 1),
  fontZoomOut: (ctx, _e, t) => handleFontZoom(ctx, t, -1),
  fontZoomReset: (ctx, _e, t) => handleFontZoom(ctx, t, 0),
  paste: (ctx, e) => { handlePasteShortcut(ctx, e); return false },
}

function handleCustomKey(
  context: TerminalSetupLifecycleContext,
  event: KeyboardEvent,
  term: Terminal,
): boolean {
  const shortcut = getCustomShortcut(event)
  if (!shortcut) return true
  const handler = SHORTCUT_HANDLERS[shortcut]
  return handler ? handler(context, event, term) : true
}

const CTRL_CODE_SHORTCUTS: Record<string, CustomShortcut> = {
  ArrowUp: 'navBlockPrev',
  ArrowDown: 'navBlockNext',
  Equal: 'fontZoomIn',
  NumpadAdd: 'fontZoomIn',
  Minus: 'fontZoomOut',
  NumpadSubtract: 'fontZoomOut',
  Digit0: 'fontZoomReset',
  Numpad0: 'fontZoomReset',
}

const PLAIN_CTRL_KEY_SHORTCUTS: Record<string, CustomShortcut> = {
  r: 'openCmdSearch',
  c: 'copyOrSigint',
  v: 'paste',
}

function getCustomShortcut(event: KeyboardEvent): CustomShortcut {
  if (matchesCtrlShift(event, 'F')) return 'toggleSearch'
  if (matchesCtrlShift(event, 'Enter')) return 'toggleRichInput'
  if (event.ctrlKey && !event.shiftKey && !event.altKey) {
    const fromCode = CTRL_CODE_SHORTCUTS[event.code]
    if (fromCode) return fromCode
  }
  const plainCtrlKey = getPlainCtrlKey(event)
  if (plainCtrlKey) return PLAIN_CTRL_KEY_SHORTCUTS[plainCtrlKey] ?? null
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

function handleBlockNav(
  context: TerminalSetupLifecycleContext,
  term: Terminal,
  direction: 'prev' | 'next',
): false {
  if (direction === 'prev') {
    context.commandBlocksRef.current.navigatePrev(term)
  } else {
    context.commandBlocksRef.current.navigateNext(term)
  }
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
    void writeChunkedPaste(context.sessionId, text)
  })
}

const FONT_SIZE_MIN = 8
const FONT_SIZE_MAX = 32
const FONT_SIZE_DEFAULT = 14

function handleFontZoom(
  context: TerminalSetupLifecycleContext,
  term: Terminal,
  delta: -1 | 0 | 1,
): false {
  const currentSize = term.options.fontSize ?? FONT_SIZE_DEFAULT

  let newSize: number
  if (delta === 0) {
    // Reset to default
    newSize = FONT_SIZE_DEFAULT
  } else {
    newSize = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, currentSize + delta))
  }

  if (newSize !== currentSize) {
    term.options.fontSize = newSize
    // Trigger fit to recalculate terminal dimensions
    context.fit()
  }

  return false
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
