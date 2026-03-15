/**
 * shellIntegrationAddon.ts — Custom xterm.js addon that parses OSC 633
 * sequences (VS Code shell integration protocol) into structured events.
 *
 * OSC 633 sub-commands:
 *   A — Prompt start
 *   B — Command start (after prompt, user has typed command)
 *   C — Command executed (output begins)
 *   D;N — Command finished with exit code N
 *   E;text — Command line text
 *   P;Key=Value — Property (e.g., Cwd=/path)
 */

import type { ITerminalAddon, Terminal } from '@xterm/xterm'

export interface CommandRecord {
  id: string
  commandText: string
  cwd: string
  promptStartRow: number
  commandStartRow: number
  executionStartRow: number
  commandFinishedRow: number
  exitCode: number
  startTime: number
  endTime: number
  status: 'running' | 'complete'
}

export type ShellIntegrationEvent =
  | { type: 'promptStart'; row: number }
  | { type: 'commandStart'; row: number }
  | { type: 'commandExecuted'; row: number }
  | { type: 'commandFinished'; row: number; exitCode: number }
  | { type: 'commandLine'; text: string }
  | { type: 'cwd'; path: string }

export class ShellIntegrationAddon implements ITerminalAddon {
  private _terminal: Terminal | null = null
  private _commands: CommandRecord[] = []
  private _currentCommand: Partial<CommandRecord> | null = null
  private _currentCwd = ''
  private _listeners: Array<(event: ShellIntegrationEvent) => void> = []
  private _commandListeners: Array<(cmd: CommandRecord) => void> = []
  private _disposables: Array<{ dispose(): void }> = []
  private _commandCounter = 0

  get commands(): ReadonlyArray<CommandRecord> {
    return this._commands
  }

  get currentCommand(): Partial<CommandRecord> | null {
    return this._currentCommand
  }

  get currentCwd(): string {
    return this._currentCwd
  }

  get isActive(): boolean {
    return this._terminal !== null && this._commandCounter > 0
  }

  activate(terminal: Terminal): void {
    this._terminal = terminal
    // Register OSC 633 handler
    const handler = terminal.parser.registerOscHandler(633, (data: string) => {
      this._handleOsc633(data)
      return true // consumed
    })
    this._disposables.push(handler)
  }

  dispose(): void {
    for (const d of this._disposables) d.dispose()
    this._disposables = []
    this._listeners = []
    this._commandListeners = []
    this._terminal = null
  }

  /** Subscribe to all shell integration events. Returns an unsubscribe function. */
  onEvent(cb: (event: ShellIntegrationEvent) => void): () => void {
    this._listeners.push(cb)
    return () => {
      this._listeners = this._listeners.filter((l) => l !== cb)
    }
  }

  /** Subscribe to completed command records. Returns an unsubscribe function. */
  onCommand(cb: (cmd: CommandRecord) => void): () => void {
    this._commandListeners.push(cb)
    return () => {
      this._commandListeners = this._commandListeners.filter((l) => l !== cb)
    }
  }

  /** Reset all tracked state (e.g., on terminal clear). */
  reset(): void {
    this._commands = []
    this._currentCommand = null
    this._commandCounter = 0
  }

  private _emit(event: ShellIntegrationEvent): void {
    for (const l of this._listeners) {
      try {
        l(event)
      } catch {
        // Listener errors should not break the addon
      }
    }
  }

  private _handleOsc633(data: string): void {
    if (!this._terminal) return
    const cursorRow =
      this._terminal.buffer.active.cursorY +
      this._terminal.buffer.active.baseY

    // Parse: first char is the sub-command (A/B/C/D/E/P)
    const subCmd = data[0]
    const params = data.length > 2 ? data.substring(2) : ''

    switch (subCmd) {
      case 'A': // Prompt start
        this._emit({ type: 'promptStart', row: cursorRow })
        this._currentCommand = {
          id: `cmd-${++this._commandCounter}`,
          promptStartRow: cursorRow,
          cwd: this._currentCwd,
          startTime: Date.now(),
          status: 'running',
        }
        break

      case 'B': // Command start (after prompt, before execution)
        this._emit({ type: 'commandStart', row: cursorRow })
        if (this._currentCommand) {
          this._currentCommand.commandStartRow = cursorRow
        }
        break

      case 'C': // Command executed (output begins)
        this._emit({ type: 'commandExecuted', row: cursorRow })
        if (this._currentCommand) {
          this._currentCommand.executionStartRow = cursorRow
        }
        break

      case 'D': { // Command finished with exit code
        const exitCode = params ? parseInt(params, 10) : 0
        this._emit({ type: 'commandFinished', row: cursorRow, exitCode })
        if (this._currentCommand) {
          this._currentCommand.commandFinishedRow = cursorRow
          this._currentCommand.exitCode = exitCode
          this._currentCommand.endTime = Date.now()
          this._currentCommand.status = 'complete'
          const record = this._currentCommand as CommandRecord
          this._commands.push(record)
          for (const l of this._commandListeners) {
            try {
              l(record)
            } catch {
              // Listener errors should not break the addon
            }
          }
          this._currentCommand = null
        }
        break
      }

      case 'E': // Command line text
        this._emit({ type: 'commandLine', text: params })
        if (this._currentCommand) {
          this._currentCommand.commandText = params
        }
        break

      case 'P': { // Property (e.g., Cwd=...)
        const eqIdx = params.indexOf('=')
        if (eqIdx !== -1) {
          const key = params.substring(0, eqIdx)
          const value = params.substring(eqIdx + 1)
          if (key === 'Cwd') {
            this._currentCwd = value
            this._emit({ type: 'cwd', path: value })
          }
        }
        break
      }
    }
  }
}
