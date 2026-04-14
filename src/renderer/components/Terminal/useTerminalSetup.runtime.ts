import { useCallback, useRef } from 'react'

import { buildXtermTheme } from './terminalHelpers'
import type {
  TerminalRefs,
  TerminalSetupRuntimeRefs,
} from './useTerminalSetup.shared'

export function useTerminalSetupRuntimeRefs(): TerminalSetupRuntimeRefs {
  'use no memo'
  return {
    rafIdRef: useRef(0),
    resizeDebounceRef: useRef<ReturnType<typeof setTimeout> | null>(null),
    clickCountRef: useRef(0),
    clickResetTimerRef: useRef<ReturnType<typeof setTimeout> | null>(null),
    osc133EnabledRef: useRef<boolean | null>(null),
    osc133GraceTimerRef: useRef<ReturnType<typeof setTimeout> | null>(null),
    osc133FirstOutputRef: useRef(false),
    currentBlockRef: useRef(null),
    blockDecorationDisposablesRef: useRef<Array<{ dispose(): void }>>([]),
    writeBufferRef: useRef(''),
    writeRafRef: useRef(0),
    pendingOsc133Ref: useRef([]),
  }
}

function restoreScrollPosition(
  term: import('@xterm/xterm').Terminal,
  isAtBottom: boolean,
  offsetFromBottom: number,
): void {
  if (isAtBottom) term.scrollToBottom()
  else if (offsetFromBottom > 0) {
    const newTarget = term.buffer.active.baseY - offsetFromBottom
    if (newTarget >= 0) term.scrollToLine(newTarget)
  }
}

function useFitNow(sessionId: string, refs: TerminalRefs, resizeDebounceRef: TerminalSetupRuntimeRefs['resizeDebounceRef']): () => void {
  const { fitAddonRef, isReadyRef, terminalRef } = refs
  return useCallback(() => {
    if (!isReadyRef.current) return
    const addon = fitAddonRef.current
    const term = terminalRef.current
    if (!addon || !term) return
    try {
      const proposed = addon.proposeDimensions()
      if (!proposed) return
      if (proposed.cols === term.cols && proposed.rows === term.rows) return
      const buffer = term.buffer.active
      const isAtBottom = buffer.viewportY >= buffer.baseY
      const offsetFromBottom = buffer.baseY - buffer.viewportY
      addon.fit()
      restoreScrollPosition(term, isAtBottom, offsetFromBottom)
      queuePtyResize(sessionId, term.cols, term.rows, resizeDebounceRef)
    } catch {
      // fit can throw if the container has zero dimensions
    }
  }, [fitAddonRef, isReadyRef, terminalRef, resizeDebounceRef, sessionId])
}

export function useTerminalFitHandlers(
  sessionId: string,
  refs: TerminalRefs,
  runtimeRefs: TerminalSetupRuntimeRefs,
): { fit: () => void; syncTheme: () => void } {
  'use no memo'
  const { isReadyRef, terminalRef } = refs
  const { rafIdRef, resizeDebounceRef } = runtimeRefs
  const fitNow = useFitNow(sessionId, refs, resizeDebounceRef)

  const fit = useCallback(() => {
    if (!isReadyRef.current) return
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = 0
      fitNow()
    })
  }, [fitNow, isReadyRef, rafIdRef])

  const syncTheme = useCallback(() => {
    const term = terminalRef.current
    if (!term) return
    term.options = { theme: buildXtermTheme() }
  }, [terminalRef])

  return { fit, syncTheme }
}

function queuePtyResize(
  sessionId: string,
  cols: number,
  rows: number,
  resizeDebounceRef: TerminalSetupRuntimeRefs['resizeDebounceRef'],
): void {
  if (resizeDebounceRef.current !== null) clearTimeout(resizeDebounceRef.current)
  resizeDebounceRef.current = setTimeout(() => {
    resizeDebounceRef.current = null
    void window.electronAPI.pty.resize(sessionId, cols, rows)
  }, 50)
}
