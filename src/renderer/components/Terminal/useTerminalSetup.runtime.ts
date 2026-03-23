import { useCallback, useRef } from 'react'

import { buildXtermTheme } from './terminalHelpers'
import type {
  TerminalRefs,
  TerminalSetupRuntimeRefs,
} from './useTerminalSetup.shared'

export function useTerminalSetupRuntimeRefs(): TerminalSetupRuntimeRefs {
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

export function useTerminalFitHandlers(
  sessionId: string,
  refs: TerminalRefs,
  runtimeRefs: TerminalSetupRuntimeRefs,
): { fit: () => void; syncTheme: () => void } {
  const fitNow = useCallback(() => {
    if (!refs.isReadyRef.current) return
    const addon = refs.fitAddonRef.current
    const term = refs.terminalRef.current
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
      queuePtyResize(sessionId, term.cols, term.rows, runtimeRefs.resizeDebounceRef)
    } catch {
      // fit can throw if the container has zero dimensions
    }
  }, [refs.fitAddonRef, refs.isReadyRef, refs.terminalRef, runtimeRefs.resizeDebounceRef, sessionId])

  const fit = useCallback(() => {
    if (!refs.isReadyRef.current) return
    if (runtimeRefs.rafIdRef.current) cancelAnimationFrame(runtimeRefs.rafIdRef.current)
    runtimeRefs.rafIdRef.current = requestAnimationFrame(() => {
      runtimeRefs.rafIdRef.current = 0
      fitNow()
    })
  }, [fitNow, refs.isReadyRef, runtimeRefs.rafIdRef])

  const syncTheme = useCallback(() => {
    const term = refs.terminalRef.current
    if (!term) return
    term.options = { theme: buildXtermTheme() }
  }, [refs.terminalRef])

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
