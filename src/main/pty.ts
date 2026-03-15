import { BrowserWindow } from 'electron'
import fs from 'fs/promises'
import * as pty from 'node-pty'
import { type ClaudeCliSettings, getConfigValue } from './config'
import { dispatchActivationEvent } from './extensions'
import { buildClaudeArgs } from './ptyClaude'
import { buildBaseEnv, buildShellEnvWithIntegration, getDefaultArgs, getDefaultShell, resolveSpawnOptions } from './ptyEnv'
import { startPtyRecording as startRecording, stopPtyRecording as stopRecording, type RecordingState } from './ptyRecording'

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
}

function attachSessionListeners(id: string, proc: pty.IPty, win: BrowserWindow): void {
  proc.onData((data: string) => {
    if (!win.isDestroyed()) {
      win.webContents.send(`pty:data:${id}`, data)
    }
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

function buildClaudeLaunchArgs(baseArgs: string[], resumeMode?: 'continue' | string): { shell: string; args: string[] } {
  const claudeArgs = [...baseArgs]
  if (resumeMode === 'continue') {
    claudeArgs.push('--continue')
  } else if (resumeMode) {
    claudeArgs.push('--resume', resumeMode)
  }

  if (process.platform === 'win32') {
    return {
      shell: 'powershell.exe',
      args: ['-NoLogo', '-NoExit', '-Command', ['claude', ...claudeArgs].join(' ')],
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
      env: buildBaseEnv(options.env),
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
