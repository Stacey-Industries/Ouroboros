import { Terminal } from '@xterm/xterm'
import type { TerminalSetupLifecycleContext } from './useTerminalSetup.shared'

type CompletionKind = 'cmd' | 'dir' | 'file'

export function setupKeyHandler(
  context: TerminalSetupLifecycleContext,
  term: Terminal,
): { dispose(): void } {
  return term.onKey(({ domEvent, key }) => {
    if (handleTabInKey(context, domEvent)) return
    if (handleCompletionNav(context, domEvent, key)) return
    if (handleHistoryArrows(context, domEvent)) return
    resetHistoryPos(context, domEvent.code)
    if (handleEnter(context, key)) return
    if (handleBackspaceKey(context, key)) return
    trackPrintableKey(context, key)
  })
}

function handleTabInKey(
  context: TerminalSetupLifecycleContext,
  domEvent: KeyboardEvent,
): boolean {
  if (domEvent.key !== 'Tab') return false
  domEvent.preventDefault()

  if (!context.completionState.completionVisibleRef.current) {
    void context.handleTabCompletionRef.current?.()
    return true
  }

  const length = context.completionState.completionsRef.current.length
  const nextIndex = (context.completionState.completionIndexRef.current + 1) % length
  context.completionState.completionIndexRef.current = nextIndex
  context.completionState.setCompletionIndex(nextIndex)
  return true
}

function handleCompletionNav(
  context: TerminalSetupLifecycleContext,
  domEvent: KeyboardEvent,
  key: string,
): boolean {
  if (!context.completionState.completionVisibleRef.current) return false
  if (domEvent.code === 'ArrowDown') return moveCompletionSelection(context, domEvent, 1)
  if (domEvent.code === 'ArrowUp') return moveCompletionSelection(context, domEvent, -1)
  if (key === '\r' || key === '\n') {
    domEvent.preventDefault()
    applySelectedCompletion(context)
    return true
  }
  if (domEvent.key === 'Escape') {
    domEvent.preventDefault()
    dismissCompletions(context)
    return true
  }

  dismissCompletions(context)
  return false
}

function moveCompletionSelection(
  context: TerminalSetupLifecycleContext,
  domEvent: KeyboardEvent,
  delta: number,
): boolean {
  domEvent.preventDefault()
  const maxIndex = context.completionState.completionsRef.current.length - 1
  const currentIndex = context.completionState.completionIndexRef.current
  const nextIndex = delta > 0
    ? Math.min(currentIndex + 1, maxIndex)
    : Math.max(currentIndex - 1, 0)
  context.completionState.completionIndexRef.current = nextIndex
  context.completionState.setCompletionIndex(nextIndex)
  return true
}

function applySelectedCompletion(context: TerminalSetupLifecycleContext): void {
  const selected = context.completionState.completionsRef.current[
    context.completionState.completionIndexRef.current
  ]
  if (!selected) {
    dismissCompletions(context)
    return
  }
  if (selected.type === 'cmd') {
    void window.electronAPI.pty.write(context.sessionId, '\x15' + selected.value)
    context.historyRefs.currentLineRef.current = selected.value
    dismissCompletions(context)
    return
  }

  appendCompletionSelection(context, selected.value, selected.type)
  dismissCompletions(context)
}

function appendCompletionSelection(
  context: TerminalSetupLifecycleContext,
  value: string,
  type: CompletionKind,
): void {
  const line = context.historyRefs.currentLineRef.current
  const currentWord = line.split(/\s+/).pop() ?? ''
  const suffix = value.slice(currentWord.length)
  const trailer = type === 'dir' ? '/' : ' '
  void window.electronAPI.pty.write(context.sessionId, suffix + trailer)
  context.historyRefs.currentLineRef.current = line + suffix + trailer
}

function dismissCompletions(context: TerminalSetupLifecycleContext): void {
  context.completionState.setCompletionVisible(false)
  context.completionState.completionVisibleRef.current = false
  context.suggestionControls.isHistorySuggestionRef.current = false
  context.completionState.setCompletions([])
}

function handleHistoryArrows(
  context: TerminalSetupLifecycleContext,
  domEvent: KeyboardEvent,
): boolean {
  if (domEvent.code === 'ArrowUp') return moveHistorySelection(context, domEvent, 1)
  if (domEvent.code === 'ArrowDown') return moveHistorySelection(context, domEvent, -1)
  return false
}

function moveHistorySelection(
  context: TerminalSetupLifecycleContext,
  domEvent: KeyboardEvent,
  delta: 1 | -1,
): boolean {
  const history = context.historyRefs.historyRef.current
  const nextIndex = context.historyRefs.histPosRef.current + delta

  if (delta > 0 && (history.length === 0 || nextIndex >= history.length)) return false
  if (delta < 0 && context.historyRefs.histPosRef.current < 0) return false

  domEvent.preventDefault()
  context.historyRefs.histPosRef.current = nextIndex
  const entry = nextIndex < 0 ? '' : history[nextIndex]
  void window.electronAPI.pty.write(context.sessionId, '\x15' + entry)
  context.historyRefs.currentLineRef.current = entry
  return true
}

function resetHistoryPos(
  context: TerminalSetupLifecycleContext,
  code: string,
): void {
  if (!['ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(code)) {
    context.historyRefs.histPosRef.current = -1
  }
}

function handleEnter(
  context: TerminalSetupLifecycleContext,
  key: string,
): boolean {
  if (key !== '\r' && key !== '\n') return false

  const command = context.historyRefs.currentLineRef.current.trim()
  if (command.length > 0 && command.length < 500) {
    const history = context.historyRefs.historyRef.current
    if (history[0] !== command) {
      context.historyRefs.historyRef.current = [
        command,
        ...history.filter((entry) => entry !== command),
      ].slice(0, 500)
    }
  }

  context.historyRefs.currentLineRef.current = ''
  context.suggestionControls.searchHistorySuggestionsRef.current?.('')
  return true
}

function handleBackspaceKey(
  context: TerminalSetupLifecycleContext,
  key: string,
): boolean {
  if (key !== '\x7f' && key !== '\b') return false

  const currentLineRef = context.historyRefs.currentLineRef
  if (currentLineRef.current.length > 0) currentLineRef.current = currentLineRef.current.slice(0, -1)
  context.suggestionControls.searchHistorySuggestionsRef.current?.(currentLineRef.current)
  return true
}

function trackPrintableKey(
  context: TerminalSetupLifecycleContext,
  key: string,
): void {
  if (key.length !== 1 || key.charCodeAt(0) < 32) return
  context.historyRefs.currentLineRef.current += key
  context.suggestionControls.searchHistorySuggestionsRef.current?.(
    context.historyRefs.currentLineRef.current,
  )
}
