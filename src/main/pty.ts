import { BrowserWindow } from 'electron'
import fs from 'fs/promises'
import * as pty from 'node-pty'

import { getConfigValue } from './config'
import { dispatchActivationEvent } from './extensions'
import { buildShellEnvWithIntegration, getDefaultArgs, getDefaultShell, resolveSpawnOptions } from './ptyEnv'
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
export const sessions = new Map<string, PtySession>()
const sessionWindowMap = new Map<string, number>()

export interface SessionRegistration {
  id: string
  proc: pty.IPty
  cwd: string
  shell: string
  win: BrowserWindow
}

export function cleanupSession(id: string): void {
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

export function scheduleStartupCommand(id: string, proc: pty.IPty, command: string, delay: number): void {
  setTimeout(() => {
    if (sessions.has(id)) {
      proc.write(command + '\r')
    }
  }, delay)
}

export function registerSession(registration: SessionRegistration): void {
  sessions.set(registration.id, {
    id: registration.id,
    process: registration.proc,
    cwd: registration.cwd,
    shell: registration.shell,
  })
  sessionWindowMap.set(registration.id, registration.win.id)
  attachSessionListeners(registration.id, registration.proc, registration.win)
}

export function notifyTerminalCreated(id: string, cwd: string): void {
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
export function escapePowerShellArg(arg: string): string {
  // In PowerShell single-quoted strings, the only special character is
  // the single-quote itself, which is escaped by doubling it.
  return `'${arg.replace(/'/g, "''")}'`
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
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path uses process PID, not user input
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

export type { AgentPtyOptions, AgentPtyResult } from './ptyAgent'
export { spawnAgentPty } from './ptyAgent'
export { spawnClaudePty, spawnCodexPty } from './ptySpawn'
