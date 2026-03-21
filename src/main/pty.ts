import { BrowserWindow } from 'electron'
import fs from 'fs/promises'
import * as pty from 'node-pty'

import { type ClaudeCliSettings, type CodexCliSettings, getConfigValue } from './config'
import { dispatchActivationEvent } from './extensions'
import type { StreamJsonEvent, StreamJsonResultEvent } from './orchestration/providers/streamJsonTypes'
import { type AgentBridgeHandle,createAgentBridge } from './ptyAgentBridge'
import { buildClaudeArgs } from './ptyClaude'
import { buildCodexArgs, buildCodexCommand, buildCodexLaunchArgs } from './ptyCodex'
import { buildBaseEnv, buildProviderEnv, buildShellEnvWithIntegration, getDefaultArgs, getDefaultShell, resolveSpawnOptions } from './ptyEnv'
import { terminalOutputBuffer } from './ptyOutputBuffer'
import { type RecordingState,startPtyRecording as startRecording, stopPtyRecording as stopRecording } from './ptyRecording'
import { ptyBatcher } from './web/ptyBatcher'
import { broadcastToWebClients } from './web/webServer'

export interface PtySession {
  id: string
  process: pty.IPty
  cwd: string
  shell: string
}

export interface SpawnOptions {
  cwd?: string
  cols?: number
  rows?: number
  env?: Record<string, string>
  startupCommand?: string
  /** 'continue' = --continue (resume latest session in cwd), or a UUID string = --resume <id> */
  resumeMode?: 'continue' | string
}

export interface ActiveSessionInfo {
  id: string
  cwd: string
}

export { buildClaudeArgs, buildClaudeCommand } from './ptyClaude'
export { buildCodexArgs, buildCodexCommand } from './ptyCodex'
export type { AsciicastEvent } from './ptyRecording'

const recordings = new Map<string, RecordingState>()
const sessions = new Map<string, PtySession>()
const sessionWindowMap = new Map<string, number>()

interface SessionRegistration {
  id: string
  proc: pty.IPty
  cwd: string
  shell: string
  win: BrowserWindow
}

function cleanupSession(id: string): void {
  sessions.delete(id)
  sessionWindowMap.delete(id)
  terminalOutputBuffer.removeSession(id)
  ptyBatcher.removeSession(id)
}

function handleSessionExit(
  id: string,
  win: BrowserWindow,
  exitCode: number,
  signal: number,
): void {
  if (!sessions.has(id)) {
    return
  }

  cleanupSession(id)
  if (!win.isDestroyed()) {
    win.webContents.send(`pty:exit:${id}`, { exitCode, signal })
  }
  broadcastToWebClients(`pty:exit:${id}`, { exitCode, signal })
}

function attachSessionListeners(id: string, proc: pty.IPty, win: BrowserWindow): void {
  proc.onData((data: string) => {
    if (!win.isDestroyed()) {
      win.webContents.send(`pty:data:${id}`, data)
    }
    ptyBatcher.append(id, data)
    terminalOutputBuffer.append(id, data)
  })

  proc.onExit(({ exitCode, signal }) => {
    handleSessionExit(id, win, exitCode, signal)
  })
}

function scheduleStartupCommand(id: string, proc: pty.IPty, command: string, delay: number): void {
  setTimeout(() => {
    if (sessions.has(id)) {
      proc.write(command + '\r')
    }
  }, delay)
}

function registerSession(registration: SessionRegistration): void {
  sessions.set(registration.id, {
    id: registration.id,
    process: registration.proc,
    cwd: registration.cwd,
    shell: registration.shell,
  })
  sessionWindowMap.set(registration.id, registration.win.id)
  attachSessionListeners(registration.id, registration.proc, registration.win)
}

function notifyTerminalCreated(id: string, cwd: string): void {
  dispatchActivationEvent('onTerminalCreate', { id, cwd }).catch(() => {})
}

/**
 * Escape a single argument for safe use inside a PowerShell command string.
 * Handles all PowerShell metacharacters — not just backticks — to prevent
 * command injection via crafted CLI arguments (e.g. appendSystemPrompt).
 *
 * Security: wraps every argument in single-quotes and doubles any embedded
 * single-quotes, which is the only safe quoting strategy for PowerShell.
 * Single-quoted strings in PowerShell are literal — no variable expansion,
 * no backtick escapes, no subexpression evaluation.
 */
function escapePowerShellArg(arg: string): string {
  // In PowerShell single-quoted strings, the only special character is
  // the single-quote itself, which is escaped by doubling it.
  return `'${arg.replace(/'/g, "''")}'`
}

function buildClaudeLaunchArgs(baseArgs: string[], resumeMode?: 'continue' | string): { shell: string; args: string[] } {
  const claudeArgs = [...baseArgs]
  if (resumeMode === 'continue') {
    claudeArgs.push('--continue')
  } else if (resumeMode) {
    claudeArgs.push('--resume', resumeMode)
  }

  if (process.platform === 'win32') {
    // Security: use single-quote escaping for each argument to prevent
    // command injection through PowerShell metacharacters.
    const escaped = ['claude', ...claudeArgs].map(escapePowerShellArg).join(' ')
    return {
      shell: 'powershell.exe',
      args: ['-NoLogo', '-NoExit', '-Command', `& ${escaped}`],
    }
  }

  return { shell: 'claude', args: claudeArgs }
}

export function spawnPty(
  id: string,
  win: BrowserWindow,
  options: SpawnOptions = {}
): { success: boolean; error?: string } {
  if (sessions.has(id)) {
    return { success: false, error: `Session ${id} already exists` }
  }

  const shell = (getConfigValue('shell') as string) || getDefaultShell()
  const { cwd, cols, rows } = resolveSpawnOptions(options)
  try {
    const { env: shellEnv, shellArgs } = buildShellEnvWithIntegration(shell, options.env)
    // shellArgs is non-null for PowerShell (replaces default args to dot-source
    // the integration script). For bash/zsh, shellArgs is null and integration
    // is injected via environment variables (BASH_ENV, etc.)
    const finalArgs = shellArgs ?? getDefaultArgs(shell)
    const proc = pty.spawn(shell, finalArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: shellEnv,
    })

    registerSession({ id, proc, cwd, shell, win })
    if (options.startupCommand) {
      scheduleStartupCommand(id, proc, options.startupCommand, 100)
    }
    notifyTerminalCreated(id, cwd)
    return { success: true }
  } catch (error) {
    cleanupSession(id)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function writeToPty(id: string, data: string): { success: boolean; error?: string } {
  const session = sessions.get(id)
  if (!session) {
    return { success: false, error: `Session ${id} not found` }
  }

  try {
    session.process.write(data)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function resizePty(
  id: string,
  cols: number,
  rows: number
): { success: boolean; error?: string } {
  const session = sessions.get(id)
  if (!session) {
    return { success: false, error: `Session ${id} not found` }
  }

  try {
    session.process.resize(cols, rows)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function killPty(id: string): { success: boolean; error?: string } {
  const session = sessions.get(id)
  if (!session) {
    return { success: false, error: `Session ${id} not found` }
  }

  try {
    session.process.kill()
    cleanupSession(id)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function killAllPtySessions(): void {
  for (const [id, session] of sessions) {
    try {
      session.process.kill()
    } catch {
      // Ignore kill errors on shutdown.
    }
    cleanupSession(id)
  }
}

export function killPtySessionsForWindow(windowId: number): void {
  for (const [sessionId, ownerWindowId] of sessionWindowMap) {
    if (ownerWindowId !== windowId) {
      continue
    }

    const session = sessions.get(sessionId)
    if (session) {
      try {
        session.process.kill()
      } catch {
        // Ignore kill errors on shutdown.
      }
    }
    cleanupSession(sessionId)
  }
}

export function getActiveSessions(): ActiveSessionInfo[] {
  return Array.from(sessions.values()).map((session) => ({ id: session.id, cwd: session.cwd }))
}

export async function getPtyCwd(id: string): Promise<{ success: boolean; cwd?: string; error?: string }> {
  const session = sessions.get(id)
  if (!session) {
    return { success: false, error: `Session ${id} not found` }
  }

  if (process.platform !== 'linux') {
    return { success: true, cwd: session.cwd }
  }

  try {
    const link = await fs.readlink(`/proc/${session.process.pid}/cwd`)
    return { success: true, cwd: link }
  } catch {
    return { success: true, cwd: session.cwd }
  }
}

export function startPtyRecording(
  id: string,
  win: BrowserWindow
): { success: boolean; error?: string } {
  return startRecording(id, sessions, recordings, win)
}

export async function stopPtyRecording(
  id: string,
  win: BrowserWindow
): Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }> {
  return stopRecording(id, recordings, win)
}

// ---- Agent PTY (PTY-backed Claude session with structured event bridge) ---

export interface AgentPtyOptions {
  /** Claude CLI prompt to send */
  prompt: string
  /** Working directory */
  cwd?: string
  /** Terminal column count */
  cols?: number
  /** Terminal row count */
  rows?: number
  /** Extra environment variables */
  env?: Record<string, string>
  /** Claude CLI model override */
  model?: string
  /** Permission mode */
  permissionMode?: string
  /** Skip permissions */
  dangerouslySkipPermissions?: boolean
  /** Resume session ID */
  resumeSessionId?: string
  /** Continue latest session */
  continueSession?: boolean
  /** Effort level override: 'low' | 'medium' | 'high' | 'max', or a numeric string for explicit --max-turns */
  effort?: string
  /** Callback for structured events parsed from stream-json output */
  onEvent?: (event: StreamJsonEvent) => void
}

export interface AgentPtyResult {
  success: boolean
  error?: string
  /** PTY session ID (same as the `id` argument) */
  sessionId?: string
  /** The agent bridge handle — can be used to dispose resources */
  bridge?: AgentBridgeHandle
  /** Resolves when the Claude session completes (with result or null) */
  result?: Promise<StreamJsonResultEvent | null>
}

/**
 * Build the Claude CLI args for stream-json mode in a PTY context.
 * Similar to `buildStreamJsonArgs` in claudeStreamJsonRunner.ts but adapted
 * for PTY-based execution.
 */
function buildAgentPtyClaudeArgs(options: AgentPtyOptions): { shell: string; args: string[] } {
  const cliArgs: string[] = [
    '-p',
    '--verbose',
    '--output-format',
    'stream-json',
  ]

  if (options.model) {
    cliArgs.push('--model', options.model)
  }
  if (options.permissionMode) {
    cliArgs.push('--permission-mode', options.permissionMode)
  }
  if (options.dangerouslySkipPermissions) {
    cliArgs.push('--dangerously-skip-permissions')
  }
  if (options.continueSession) {
    cliArgs.push('--continue')
  }
  if (options.resumeSessionId) {
    cliArgs.push('--resume', options.resumeSessionId)
  }

  // Map effort level to --max-turns flag
  if (options.effort) {
    const effortMap: Record<string, number> = { low: 3, medium: 10, high: 25 }
    const mapped = effortMap[options.effort]
    if (mapped !== undefined) {
      cliArgs.push('--max-turns', String(mapped))
    } else if (options.effort !== 'max') {
      // Treat as a numeric string — pass directly
      cliArgs.push('--max-turns', options.effort)
    }
    // 'max' means unlimited — no flag needed
  }

  if (process.platform === 'win32') {
    // Security: use single-quote escaping for each argument to prevent
    // command injection through PowerShell metacharacters.
    const escaped = ['claude', ...cliArgs].map(escapePowerShellArg).join(' ')
    return {
      shell: 'powershell.exe',
      args: ['-NoLogo', '-Command', `& ${escaped}`],
    }
  }

  return { shell: 'claude', args: cliArgs }
}

/**
 * Spawn a PTY session running Claude in stream-json mode.
 *
 * The PTY output flows two ways:
 * 1. To the renderer via `pty:data:{id}` IPC (normal xterm rendering)
 * 2. Through an AgentBridge that parses NDJSON lines into StreamJsonEvent objects
 *
 * The prompt is written to PTY stdin after a brief delay to let the process start,
 * followed by EOF (Ctrl+D) to signal end of input.
 */
export function spawnAgentPty(
  id: string,
  win: BrowserWindow,
  options: AgentPtyOptions,
): AgentPtyResult {
  if (sessions.has(id)) {
    return { success: false, error: `Session ${id} already exists` }
  }

  const { cwd, cols, rows } = resolveSpawnOptions({
    cwd: options.cwd,
    cols: options.cols,
    rows: options.rows,
  })
  const launch = buildAgentPtyClaudeArgs(options)

  try {
    const proc = pty.spawn(launch.shell, launch.args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: buildBaseEnv({ ...buildProviderEnv('agentChat'), ...options.env }),
    })

    // Register the PTY session (attaches normal data/exit listeners for xterm)
    registerSession({ id, proc, cwd, shell: launch.shell, win })

    // Create the result promise before attaching the bridge
    let resolveResult: (value: StreamJsonResultEvent | null) => void
    let rejectResult: (reason: unknown) => void
    let settled = false
    const resultPromise = new Promise<StreamJsonResultEvent | null>((resolve, reject) => {
      resolveResult = resolve
      rejectResult = reject
    })

    // Create the agent bridge for parsing structured events from PTY output
    const originalDispose = { fn: (() => {}) as () => void }
    const bridge = createAgentBridge({
      sessionId: id,
      onEvent: (event) => {
        options.onEvent?.(event)
      },
      onComplete: (result, exitCode) => {
        if (settled) return
        settled = true
        if (result) {
          resolveResult(result)
        } else if (exitCode && exitCode !== 0) {
          rejectResult(new Error(`Claude Code exited with code ${exitCode}`))
        } else {
          resolveResult(null)
        }
      },
    })

    // Wrap dispose to also resolve the promise if still pending
    originalDispose.fn = bridge.dispose.bind(bridge)
    bridge.dispose = () => {
      if (!settled) {
        settled = true
        resolveResult(null)
      }
      originalDispose.fn()
    }

    // Capture early PTY output for diagnostics
    let earlyOutput = ''
    const captureLimit = 2000

    // Tap into PTY data to also feed the bridge (dual streaming)
    proc.onData((data: string) => {
      if (earlyOutput.length < captureLimit) {
        earlyOutput += data
      }
      bridge.feed(data)
    })

    // Wire exit to the bridge
    proc.onExit(({ exitCode }) => {
      if (exitCode && exitCode !== 0) {
        console.error(`[agent-pty] session ${id} exited with code ${exitCode}. Early output:\n${earlyOutput.slice(0, captureLimit)}`)
      }
      bridge.handleExit(exitCode)
    })

    // Write prompt to PTY stdin after a brief delay for process startup.
    // Send the prompt text followed by EOF so Claude reads from stdin.
    // Windows: Ctrl+Z (\x1a) is EOF; Unix: Ctrl+D (\x04)
    const eofChar = process.platform === 'win32' ? '\x1a' : '\x04'
    setTimeout(() => {
      if (sessions.has(id)) {
        proc.write(options.prompt)
        proc.write(eofChar)
      }
    }, 150)

    notifyTerminalCreated(id, cwd)

    return {
      success: true,
      sessionId: id,
      bridge,
      result: resultPromise,
    }
  } catch (error) {
    cleanupSession(id)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function spawnClaudePty(
  id: string,
  win: BrowserWindow,
  settings: ClaudeCliSettings,
  options: SpawnOptions & { initialPrompt?: string } = {}
): { success: boolean; error?: string } {
  if (sessions.has(id)) {
    return { success: false, error: `Session ${id} already exists` }
  }

  const { cwd, cols, rows } = resolveSpawnOptions(options)
  const launch = buildClaudeLaunchArgs(buildClaudeArgs(settings), options.resumeMode)
  try {
    const proc = pty.spawn(launch.shell, launch.args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: buildBaseEnv({ ...buildProviderEnv('terminal'), ...options.env }),
    })

    registerSession({ id, proc, cwd, shell: launch.shell, win })
    if (options.initialPrompt) {
      scheduleStartupCommand(id, proc, options.initialPrompt, 300)
    }
    notifyTerminalCreated(id, cwd)
    return { success: true }
  } catch (error) {
    cleanupSession(id)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function spawnCodexPty(
  id: string,
  win: BrowserWindow,
  settings: CodexCliSettings,
  options: SpawnOptions & { initialPrompt?: string; resumeThreadId?: string } = {},
): { success: boolean; error?: string } {
  if (sessions.has(id)) {
    return { success: false, error: `Session ${id} already exists` }
  }

  const { cwd, cols, rows } = resolveSpawnOptions(options)
  const launch = buildCodexLaunchArgs(buildCodexArgs(settings), options.resumeThreadId)

  try {
    const proc = pty.spawn(launch.shell, launch.args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: buildBaseEnv(options.env),
    })

    registerSession({ id, proc, cwd, shell: launch.shell, win })
    if (options.initialPrompt) {
      scheduleStartupCommand(id, proc, options.initialPrompt, 500)
    }
    notifyTerminalCreated(id, cwd)
    return { success: true }
  } catch (error) {
    cleanupSession(id)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}
