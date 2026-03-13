import { Terminal } from '@xterm/xterm'
import { unregisterTerminal } from './terminalRegistry'
import type {
  AttachedTerminalDisposables,
  TerminalSetupLifecycleContext,
  TerminalSetupRuntimeRefs,
} from './useTerminalSetup.shared'

export function cleanupTerminalSetup(
  context: TerminalSetupLifecycleContext,
  container: HTMLDivElement,
  term: Terminal,
  disposables: AttachedTerminalDisposables,
): void {
  context.refs.isReadyRef.current = false
  clearStoredAnimationFrame(context.runtimeRefs.rafIdRef)
  clearStoredAnimationFrame(context.runtimeRefs.writeRafRef)
  clearStoredTimer(context.runtimeRefs.resizeDebounceRef)
  clearStoredTimer(context.runtimeRefs.clickResetTimerRef)
  clearStoredTimer(context.runtimeRefs.osc133GraceTimerRef)
  resetRuntimeBuffers(context.runtimeRefs)
  container.removeEventListener('click', disposables.clickHandler)
  container.removeEventListener('mouseup', disposables.mouseUpHandler)
  disposeAttachedHandlers(disposables)
  context.refs.searchAddonRef.current = null
  context.refs.fitAddonRef.current = null
  unregisterTerminal(context.sessionId)
  term.dispose()
  context.refs.terminalRef.current = null
}

function resetRuntimeBuffers(runtimeRefs: TerminalSetupRuntimeRefs): void {
  runtimeRefs.writeBufferRef.current = ''
  runtimeRefs.pendingOsc133Ref.current = []
  disposeBlockDecorations(runtimeRefs)
}

function disposeBlockDecorations(runtimeRefs: TerminalSetupRuntimeRefs): void {
  for (const disposable of runtimeRefs.blockDecorationDisposablesRef.current) {
    try {
      disposable.dispose()
    } catch {
      // ignore disposal failures
    }
  }
  runtimeRefs.blockDecorationDisposablesRef.current = []
}

function disposeAttachedHandlers(disposables: AttachedTerminalDisposables): void {
  disposables.selD.dispose()
  disposables.ro.disconnect()
  disposables.titleD.dispose()
  disposables.inputD.dispose()
  disposables.histKeyD.dispose()
  disposables.oscFg.dispose()
  disposables.oscBg.dispose()
  disposables.oscCursor.dispose()
  disposables.filePathLink.dispose()
  disposables.dataCleanup()
}

function clearStoredAnimationFrame(frameRef: TerminalSetupRuntimeRefs['rafIdRef']): void {
  if (!frameRef.current) return
  cancelAnimationFrame(frameRef.current)
  frameRef.current = 0
}

function clearStoredTimer(
  timerRef: TerminalSetupRuntimeRefs['resizeDebounceRef']
  | TerminalSetupRuntimeRefs['clickResetTimerRef']
  | TerminalSetupRuntimeRefs['osc133GraceTimerRef'],
): void {
  if (timerRef.current === null) return
  clearTimeout(timerRef.current)
  timerRef.current = null
}
