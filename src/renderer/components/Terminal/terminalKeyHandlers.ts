/**
 * terminalKeyHandlers â€” extracted key event handling logic for the terminal.
 * Handles Tab completion navigation, history arrows, custom shortcuts (Ctrl+R,
 * Ctrl+C, Ctrl+V, Ctrl+Shift+F, Ctrl+Shift+Enter).
 */

import type { Terminal } from '@xterm/xterm'
import { PASTE_CONFIRM_THRESHOLD } from './PasteConfirmation'
import { writeChunkedPaste } from './terminalPasteHelpers'
import type { CompletionState } from './useTerminalCompletions'
import type { HistoryRefs, HistorySuggestionControls } from './useTerminalHistory'

export interface KeyHandlerDeps {
  sessionId: string
  completionState: CompletionState
  historyRefs: HistoryRefs
  suggestionControls: HistorySuggestionControls
  handleTabCompletionRef: { current: (() => Promise<void>) | null }
  setShowSearch: React.Dispatch<React.SetStateAction<boolean>>
  setRichInputActive: React.Dispatch<React.SetStateAction<boolean>>
  setShowCmdSearch: React.Dispatch<React.SetStateAction<boolean>>
  setCmdHistory: React.Dispatch<React.SetStateAction<string[]>>
  setPendingPaste: React.Dispatch<React.SetStateAction<string | null>>
}

type CustomKeyHandler = (
  event: KeyboardEvent,
  term: Terminal,
  deps: KeyHandlerDeps,
) => boolean | undefined

const CUSTOM_KEY_HANDLERS: ReadonlyArray<CustomKeyHandler> = [
  handleSearchShortcut,
  handleRichInputShortcut,
  handleCommandSearchShortcut,
  handleCopyShortcut,
  handlePasteShortcut,
]

/** Attach term.onKey handler for history/completions. Returns disposable. */
export function attachOnKeyHandler(
  term: Terminal,
  deps: KeyHandlerDeps,
) {
  return term.onKey((e) => {
    const { domEvent, key } = e
    if (handleTab(domEvent, deps)) return
    if (handleCompletionNav(domEvent, key, deps)) return
    if (handleArrows(domEvent, deps)) return
    resetHistoryPos(domEvent.code, deps)
    if (handleEnter(key, deps)) return
    if (handleBackspace(key, deps)) return
    trackPrintable(key, deps)
  })
}

/** Attach customKeyEventHandler for shortcuts. */
export function attachCustomKeyHandler(
  term: Terminal,
  deps: KeyHandlerDeps,
): void {
  term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
    if (e.type !== 'keydown') return true
    return processCustomKey(e, term, deps)
  })
}

function handleTab(domEvent: KeyboardEvent, d: KeyHandlerDeps): boolean {
  if (domEvent.key !== 'Tab') return false

  domEvent.preventDefault()
  const cs = d.completionState

  if (cs.completionVisibleRef.current) {
    const len = cs.completionsRef.current.length
    const next = (cs.completionIndexRef.current + 1) % len
    cs.completionIndexRef.current = next
    cs.setCompletionIndex(next)
  } else {
    void d.handleTabCompletionRef.current?.()
  }

  return true
}

function handleCompletionNav(
  domEvent: KeyboardEvent,
  key: string,
  d: KeyHandlerDeps,
): boolean {
  const cs = d.completionState
  if (!cs.completionVisibleRef.current) return false

  if (domEvent.code === 'ArrowDown') {
    domEvent.preventDefault()
    const max = cs.completionsRef.current.length - 1
    const next = Math.min(cs.completionIndexRef.current + 1, max)
    cs.completionIndexRef.current = next
    cs.setCompletionIndex(next)
    return true
  }

  if (domEvent.code === 'ArrowUp') {
    domEvent.preventDefault()
    const prev = Math.max(cs.completionIndexRef.current - 1, 0)
    cs.completionIndexRef.current = prev
    cs.setCompletionIndex(prev)
    return true
  }

  if (key === '\r' || key === '\n') {
    domEvent.preventDefault()
    applySelected(d)
    return true
  }

  if (domEvent.key === 'Escape') {
    dismiss(d)
    return true
  }

  dismiss(d)
  return false
}

function applySelected(d: KeyHandlerDeps): void {
  const cs = d.completionState
  const sel = cs.completionsRef.current[cs.completionIndexRef.current]

  if (sel) {
    if (sel.type === 'cmd') {
      void window.electronAPI.pty.write(d.sessionId, '\x15' + sel.value)
      d.historyRefs.currentLineRef.current = sel.value
    } else {
      const line = d.historyRefs.currentLineRef.current
      const word = line.split(/\s+/).pop() ?? ''
      const suffix = sel.value.slice(word.length)
      const trailer = sel.type === 'dir' ? '/' : ' '
      void window.electronAPI.pty.write(d.sessionId, suffix + trailer)
      d.historyRefs.currentLineRef.current = line + suffix + trailer
    }
  }

  dismiss(d)
}

function dismiss(d: KeyHandlerDeps): void {
  d.completionState.setCompletionVisible(false)
  d.completionState.completionVisibleRef.current = false
  d.suggestionControls.isHistorySuggestionRef.current = false
  d.completionState.setCompletions([])
}

function handleArrows(domEvent: KeyboardEvent, d: KeyHandlerDeps): boolean {
  if (domEvent.code === 'ArrowUp') return handleArrowUp(domEvent, d)
  if (domEvent.code === 'ArrowDown') return handleArrowDown(domEvent, d)
  return false
}

function handleArrowUp(domEvent: KeyboardEvent, d: KeyHandlerDeps): boolean {
  const h = d.historyRefs.historyRef.current
  if (h.length === 0) return false

  const next = d.historyRefs.histPosRef.current + 1
  if (next >= h.length) return false

  domEvent.preventDefault()
  d.historyRefs.histPosRef.current = next
  void window.electronAPI.pty.write(d.sessionId, '\x15' + h[next])
  d.historyRefs.currentLineRef.current = h[next]
  return true
}

function handleArrowDown(domEvent: KeyboardEvent, d: KeyHandlerDeps): boolean {
  if (d.historyRefs.histPosRef.current < 0) return false

  domEvent.preventDefault()
  const prev = d.historyRefs.histPosRef.current - 1
  d.historyRefs.histPosRef.current = prev

  if (prev < 0) {
    void window.electronAPI.pty.write(d.sessionId, '\x15')
    d.historyRefs.currentLineRef.current = ''
  } else {
    const entry = d.historyRefs.historyRef.current[prev]
    void window.electronAPI.pty.write(d.sessionId, '\x15' + entry)
    d.historyRefs.currentLineRef.current = entry
  }

  return true
}

function resetHistoryPos(code: string, d: KeyHandlerDeps): void {
  const skip = ['ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']
  if (!skip.includes(code)) d.historyRefs.histPosRef.current = -1
}

function handleEnter(key: string, d: KeyHandlerDeps): boolean {
  if (key !== '\r' && key !== '\n') return false

  const cmd = d.historyRefs.currentLineRef.current.trim()
  if (cmd.length > 0 && cmd.length < 500) {
    const h = d.historyRefs.historyRef.current
    if (h[0] !== cmd) {
      d.historyRefs.historyRef.current = [cmd, ...h.filter((c) => c !== cmd)].slice(0, 500)
    }
  }

  d.historyRefs.currentLineRef.current = ''
  d.suggestionControls.searchHistorySuggestionsRef.current?.('')
  return true
}

function handleBackspace(key: string, d: KeyHandlerDeps): boolean {
  if (key !== '\x7f' && key !== '\b') return false

  const cl = d.historyRefs.currentLineRef
  if (cl.current.length > 0) cl.current = cl.current.slice(0, -1)
  d.suggestionControls.searchHistorySuggestionsRef.current?.(cl.current)
  return true
}

function trackPrintable(key: string, d: KeyHandlerDeps): void {
  if (key.length !== 1 || key.charCodeAt(0) < 32) return

  d.historyRefs.currentLineRef.current += key
  d.suggestionControls.searchHistorySuggestionsRef.current?.(
    d.historyRefs.currentLineRef.current,
  )
}

function processCustomKey(
  e: KeyboardEvent,
  term: Terminal,
  d: KeyHandlerDeps,
): boolean {
  for (const handler of CUSTOM_KEY_HANDLERS) {
    const result = handler(e, term, d)
    if (result !== undefined) return result
  }

  return true
}

function handleSearchShortcut(e: KeyboardEvent, _term: Terminal, d: KeyHandlerDeps): boolean | undefined {
  if (!matchesCtrlShiftShortcut(e, 'F')) return undefined
  d.setShowSearch((prev) => !prev)
  return false
}

function handleRichInputShortcut(e: KeyboardEvent, _term: Terminal, d: KeyHandlerDeps): boolean | undefined {
  if (!matchesCtrlShiftShortcut(e, 'Enter')) return undefined
  d.setRichInputActive((prev) => !prev)
  return false
}

function handleCommandSearchShortcut(e: KeyboardEvent, _term: Terminal, d: KeyHandlerDeps): boolean | undefined {
  if (!matchesCtrlShortcut(e, 'r')) return undefined
  openCmdSearch(d)
  return false
}

function handleCopyShortcut(e: KeyboardEvent, term: Terminal, d: KeyHandlerDeps): boolean | undefined {
  if (!matchesCtrlShortcut(e, 'c')) return undefined
  return handleCopyOrSigint(term, d)
}

function handlePasteShortcut(e: KeyboardEvent, _term: Terminal, d: KeyHandlerDeps): boolean | undefined {
  if (!matchesCtrlShortcut(e, 'v')) return undefined
  handlePaste(e, d)
  return false
}

function matchesCtrlShiftShortcut(event: KeyboardEvent, key: string): boolean {
  return event.ctrlKey && event.shiftKey && event.key === key
}

function matchesCtrlShortcut(event: KeyboardEvent, key: string): boolean {
  return event.ctrlKey && !event.shiftKey && !event.altKey && event.key === key
}

function openCmdSearch(d: KeyHandlerDeps): void {
  d.setShowCmdSearch(true)
  void window.electronAPI.shellHistory.read().then((result) => {
    const fileHistory = result.commands ?? []
    const seen = new Set<string>()
    const merged: string[] = []
    const all = [...d.historyRefs.sessionCommandsRef.current, ...fileHistory]

    for (const c of all) {
      if (c && !seen.has(c)) {
        seen.add(c)
        merged.push(c)
      }
    }

    d.setCmdHistory(merged)
  })
}

function handleCopyOrSigint(term: Terminal, d: KeyHandlerDeps): boolean {
  const selection = term.getSelection()
  if (selection) {
    void navigator.clipboard.writeText(selection)
    term.clearSelection()
    return false
  }

  d.historyRefs.currentLineRef.current = ''
  d.suggestionControls.searchHistorySuggestionsRef.current?.('')
  return true
}

function handlePaste(e: KeyboardEvent, d: KeyHandlerDeps): void {
  e.preventDefault()
  void navigator.clipboard.readText().then((text) => {
    if (!text) return

    if (text.length > PASTE_CONFIRM_THRESHOLD) {
      d.setPendingPaste(text)
    } else {
      void writeChunkedPaste(d.sessionId, text)
    }
  })
}
