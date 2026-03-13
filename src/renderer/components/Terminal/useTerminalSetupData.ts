import { Terminal } from '@xterm/xterm'
import {
  OSC133_GRACE_MS,
  OSC133_RE,
} from './terminalHelpers'
import type { CommandBlock } from './terminalHelpers'
import { PASTE_CONFIRM_THRESHOLD } from './PasteConfirmation'
import type {
  TerminalSetupLifecycleContext,
  TerminalSetupRuntimeRefs,
} from './useTerminalSetup.shared'

export function setupDataBridge(
  context: TerminalSetupLifecycleContext,
  term: Terminal,
): () => void {
  return window.electronAPI.pty.onData(context.sessionId, (data) => {
    const stripped = parseAndStripOsc133(context.runtimeRefs, data)
    context.runtimeRefs.writeBufferRef.current += stripped
    if (context.runtimeRefs.writeRafRef.current) return
    context.runtimeRefs.writeRafRef.current = requestAnimationFrame(() => {
      context.runtimeRefs.writeRafRef.current = 0
      flushPendingTerminalWrites(context, term)
    })
  })
}

export function setupInputBridge(
  context: TerminalSetupLifecycleContext,
  term: Terminal,
): { dispose(): void } {
  return term.onData((data) => {
    if (data === '\r' || data === '\n') trackCommandOnEnter(context, term)
    if (data.length > PASTE_CONFIRM_THRESHOLD) {
      context.callbacks.setPendingPaste(data)
      return
    }
    writeInputData(context, data)
  })
}

function parseAndStripOsc133(
  runtimeRefs: TerminalSetupRuntimeRefs,
  raw: string,
): string {
  if (!runtimeRefs.osc133FirstOutputRef.current) {
    runtimeRefs.osc133FirstOutputRef.current = true
    scheduleOsc133GraceTimeout(runtimeRefs)
  }
  if (runtimeRefs.osc133EnabledRef.current === false) return raw

  OSC133_RE.lastIndex = 0
  let result = raw
  let match: RegExpExecArray | null
  const matches: Array<{ sequence: string; param: string | undefined; full: string }> = []

  while ((match = OSC133_RE.exec(raw)) !== null) {
    matches.push({ sequence: match[1], param: match[2], full: match[0] })
  }

  for (const oscEvent of matches) {
    runtimeRefs.pendingOsc133Ref.current.push({
      sequence: oscEvent.sequence,
      param: oscEvent.param,
    })
    result = result.replace(oscEvent.full, '')
  }

  return result
}

function scheduleOsc133GraceTimeout(runtimeRefs: TerminalSetupRuntimeRefs): void {
  if (runtimeRefs.osc133EnabledRef.current !== null) return
  runtimeRefs.osc133GraceTimerRef.current = setTimeout(() => {
    if (runtimeRefs.osc133EnabledRef.current === null) runtimeRefs.osc133EnabledRef.current = false
    runtimeRefs.osc133GraceTimerRef.current = null
  }, OSC133_GRACE_MS)
}

function flushPendingTerminalWrites(
  context: TerminalSetupLifecycleContext,
  term: Terminal,
): void {
  const buffer = context.runtimeRefs.writeBufferRef.current
  if (buffer) {
    context.runtimeRefs.writeBufferRef.current = ''
    term.write(buffer)
    context.commandBlocksRef.current.handleData(buffer, term)
  }
  flushPendingOsc133(context, term)
}

function flushPendingOsc133(
  context: TerminalSetupLifecycleContext,
  term: Terminal,
): void {
  const pending = context.runtimeRefs.pendingOsc133Ref.current
  if (pending.length === 0) return

  context.runtimeRefs.pendingOsc133Ref.current = []
  for (const oscEvent of pending) {
    handleOsc133(context.runtimeRefs, oscEvent.sequence, oscEvent.param, term)
    context.commandBlocksRef.current.handleOsc133(oscEvent.sequence, oscEvent.param, term)
  }
}

function handleOsc133(
  runtimeRefs: TerminalSetupRuntimeRefs,
  sequence: string,
  param: string | undefined,
  term: Terminal,
): void {
  const absRow = term.buffer.active.viewportY + term.buffer.active.cursorY

  if (sequence === 'A') {
    runtimeRefs.currentBlockRef.current = createCommandBlock(absRow)
    runtimeRefs.osc133EnabledRef.current = true
    clearStoredTimer(runtimeRefs.osc133GraceTimerRef)
    return
  }
  if (sequence === 'C' && runtimeRefs.currentBlockRef.current) {
    runtimeRefs.currentBlockRef.current.outputRow = absRow
    return
  }
  if (sequence !== 'D') return

  const block = runtimeRefs.currentBlockRef.current
  if (!block) return
  block.exitCode = param !== undefined ? parseInt(param, 10) : 0
  block.complete = true
  registerBlockDecoration(runtimeRefs, block, term)
  runtimeRefs.currentBlockRef.current = null
}

function createCommandBlock(promptRow: number): CommandBlock {
  return { promptRow, outputRow: null, exitCode: -1, complete: false }
}

function registerBlockDecoration(
  runtimeRefs: TerminalSetupRuntimeRefs,
  block: CommandBlock,
  term: Terminal,
): void {
  if (!block.complete) return

  try {
    const absCursor = term.buffer.active.viewportY + term.buffer.active.cursorY
    const offset = block.promptRow - absCursor
    const height = Math.min(Math.max(1, absCursor - block.promptRow + 1), term.rows * 3)
    const marker = term.registerMarker(offset)
    if (!marker) return
    const dec = term.registerDecoration({
      marker,
      x: 0,
      width: term.cols,
      height,
      layer: 'bottom',
    })
    if (!dec) return

    dec.onRender((element) => {
      element.style.cssText = [
        'border-left:2px solid var(--border,#333)',
        'background:var(--bg-secondary,rgba(30,30,30,0.25))',
        'pointer-events:none',
        'box-sizing:border-box',
        'width:100%',
        'height:100%',
      ].join(';')
    })
    runtimeRefs.blockDecorationDisposablesRef.current.push(dec, marker)
  } catch {
    // ignore decoration failures
  }
}

function trackCommandOnEnter(
  context: TerminalSetupLifecycleContext,
  term: Terminal,
): void {
  try {
    const buffer = term.buffer.active
    const line = buffer.getLine(buffer.viewportY + buffer.cursorY)
    const text = line?.translateToString(true).trim()
    if (!text || text.length >= 500) return

    const commands = context.historyRefs.sessionCommandsRef.current
    if (commands[0] === text) return

    context.historyRefs.sessionCommandsRef.current = [
      text,
      ...commands.filter((command) => command !== text),
    ].slice(0, 200)
  } catch {
    // ignore history tracking failures
  }
}

function writeInputData(
  context: TerminalSetupLifecycleContext,
  data: string,
): void {
  void window.electronAPI.pty.write(context.sessionId, data)
  if (!context.syncInputRef.current) return

  for (const sessionId of context.allSessionIdsRef.current) {
    if (sessionId !== context.sessionId) void window.electronAPI.pty.write(sessionId, data)
  }
}

function clearStoredTimer(
  timerRef: TerminalSetupRuntimeRefs['osc133GraceTimerRef'],
): void {
  if (timerRef.current === null) return
  clearTimeout(timerRef.current)
  timerRef.current = null
}
