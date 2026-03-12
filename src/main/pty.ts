import * as pty from 'node-pty'
import { BrowserWindow, dialog } from 'electron'
import os from 'os'
import fs from 'fs/promises'
import { getConfigValue, type ClaudeCliSettings } from './config'

export interface PtySession {
  id: string
  process: pty.IPty
  cwd: string
  shell: string
}

// ─── Recording ────────────────────────────────────────────────────────────────

export interface AsciicastEvent {
  time: number   // elapsed seconds since recording start
  data: string   // raw PTY output chunk
}

interface RecordingState {
  startTime: number           // Date.now() when recording started
  startTimeSec: number        // Unix timestamp in seconds for header
  events: AsciicastEvent[]
  cols: number
  rows: number
  dataCleanup: (() => void) | null
}

const recordings = new Map<string, RecordingState>()

const sessions = new Map<string, PtySession>()

// Track which window (by BrowserWindow.id) owns each PTY session
const sessionWindowMap = new Map<string, number>()

function getDefaultShell(): string {
  if (process.platform === 'win32') {
    // Prefer PowerShell for better ConPTY + PSReadLine history support
    // powershell.exe is always available on Windows 10+
    return 'powershell.exe'
  }
  return process.env.SHELL ?? '/bin/bash'
}

function getDefaultArgs(shell: string): string[] {
  if (process.platform === 'win32') {
    const base = shell.toLowerCase()
    if (base.includes('powershell') || base.includes('pwsh')) {
      return ['-NoLogo'] // Clean startup, PSReadLine loads automatically
    }
    return []
  }
  // Interactive login shell for proper readline + env loading
  return ['-l', '-i']
}

export interface SpawnOptions {
  cwd?: string
  cols?: number
  rows?: number
  env?: Record<string, string>
  startupCommand?: string
}

export function spawnPty(
  id: string,
  win: BrowserWindow,
  options: SpawnOptions = {}
): { success: boolean; error?: string } {
  if (sessions.has(id)) {
    return { success: false, error: `Session ${id} already exists` }
  }

  const configShell = getConfigValue('shell')
  const shell = configShell || getDefaultShell()
  const args = getDefaultArgs(shell)
  const cwd = options.cwd ?? os.homedir()
  const cols = options.cols ?? 80
  const rows = options.rows ?? 24

  // Build history-related env vars based on shell type so readline/zsh
  // history works regardless of whether the user's shell profile sets them.
  const shellLower = shell.toLowerCase()
  const isZsh = shellLower.includes('zsh')
  const isFish = shellLower.includes('fish')
  const isPowerShell = shellLower.includes('pwsh') || shellLower.includes('powershell')

  const historyEnv: Record<string, string> = {}
  // PSReadLine (PowerShell) handles history automatically via registry — no env needed.
  // fish has its own history mechanism — no POSIX env vars needed.
  // For bash, zsh, and unknown POSIX shells: inject history env vars.
  if (!isPowerShell && !isFish) {
    if (isZsh) {
      historyEnv.HISTFILE = `${os.homedir()}/.zsh_history`
      historyEnv.SAVEHIST = '10000'
    } else {
      // bash or unknown POSIX shell
      historyEnv.HISTFILE = `${os.homedir()}/.bash_history`
    }
    historyEnv.HISTSIZE = '10000'
    historyEnv.HISTFILESIZE = '10000'
    historyEnv.HISTCONTROL = 'ignoredups:erasedups'
  }

  const configPrompt = getConfigValue('customPrompt') as string
  const configPreset = getConfigValue('promptPreset') as string

  const PS1_PRESETS: Record<string, string> = {
    default: '',  // Don't override — use shell default
    minimal: '$ ',
    git: '\\[\\e[32m\\]\\u\\[\\e[0m\\]@\\[\\e[34m\\]\\h\\[\\e[0m\\] \\[\\e[33m\\]\\w\\[\\e[0m\\]\\$(git branch 2>/dev/null | grep "\\* " | sed "s/* /:/") $ ',
    powerline: '\\[\\e[44;37m\\] \\u \\[\\e[0m\\]\\[\\e[34m\\]\\[\\e[0m\\] \\[\\e[42;30m\\] \\w \\[\\e[0m\\]\\[\\e[32m\\]\\[\\e[0m\\] ',
    custom: configPrompt,
  }

  const promptEnv: Record<string, string> = {}
  if (process.platform !== 'win32') {  // PS1 doesn't apply to PowerShell
    const preset = configPreset || 'default'
    const ps1 = preset === 'custom' ? configPrompt : PS1_PRESETS[preset] ?? ''
    if (ps1) {
      promptEnv['PS1'] = ps1
      promptEnv['PROMPT'] = ps1  // zsh uses PROMPT (or PS1)
    }
  }

  try {
    const proc = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        ...historyEnv,
        ...promptEnv,
        ...options.env
      } as Record<string, string>
    })

    const session: PtySession = { id, process: proc, cwd, shell }
    sessions.set(id, session)
    sessionWindowMap.set(id, win.id)

    proc.onData((data: string) => {
      if (!win.isDestroyed()) {
        win.webContents.send(`pty:data:${id}`, data)
      }
    })

    proc.onExit(({ exitCode, signal }) => {
      sessions.delete(id)
      sessionWindowMap.delete(id)
      if (!win.isDestroyed()) {
        win.webContents.send(`pty:exit:${id}`, { exitCode, signal })
      }
    })

    if (options.startupCommand) {
      // Delay to let shell profile/rc files finish loading
      setTimeout(() => {
        if (sessions.has(id)) {
          proc.write(options.startupCommand + '\r')
        }
      }, 600)
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

export function killPty(id: string): { success: boolean; error?: string } {
  const session = sessions.get(id)
  if (!session) {
    return { success: false, error: `Session ${id} not found` }
  }
  try {
    session.process.kill()
    sessions.delete(id)
    sessionWindowMap.delete(id)
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

export function killAllPtySessions(): void {
  for (const [id, session] of sessions) {
    try {
      session.process.kill()
    } catch {
      // Ignore kill errors on shutdown
    }
    sessions.delete(id)
    sessionWindowMap.delete(id)
  }
}

/** Kill only PTY sessions owned by a specific window (used on per-window close). */
export function killPtySessionsForWindow(windowId: number): void {
  for (const [sessionId, winId] of sessionWindowMap) {
    if (winId !== windowId) continue
    const session = sessions.get(sessionId)
    if (session) {
      try {
        session.process.kill()
      } catch {
        // Ignore kill errors on shutdown
      }
      sessions.delete(sessionId)
    }
    sessionWindowMap.delete(sessionId)
  }
}

export interface ActiveSessionInfo {
  id: string
  cwd: string
}

export function getActiveSessions(): ActiveSessionInfo[] {
  return Array.from(sessions.values()).map(s => ({ id: s.id, cwd: s.cwd }))
}

// ─── CWD query ────────────────────────────────────────────────────────────────

/**
 * Returns the current working directory of the PTY process.
 *
 * Strategy (cross-platform):
 * - Windows: Use node-pty's `process` field as a best-effort name; fall back
 *   to the spawn-time CWD stored on the session. There is no reliable way to
 *   read the CWD of an arbitrary process on Windows without WMI/PowerShell
 *   invocation, so we return the stored spawn-time CWD for Windows.
 * - Linux: read /proc/<pid>/cwd symlink.
 * - macOS: lsof is unavailable in sandboxed contexts; fall back to spawn CWD.
 */
export async function getPtyCwd(id: string): Promise<{ success: boolean; cwd?: string; error?: string }> {
  const session = sessions.get(id)
  if (!session) {
    return { success: false, error: `Session ${id} not found` }
  }

  const pid = session.process.pid

  if (process.platform === 'linux') {
    try {
      const link = await fs.readlink(`/proc/${pid}/cwd`)
      return { success: true, cwd: link }
    } catch {
      // Fallback to spawn-time cwd
      return { success: true, cwd: session.cwd }
    }
  }

  // Windows and macOS: return the spawn-time cwd stored on the session.
  // The session.cwd is updated in spawnPty so this reflects the initial directory.
  return { success: true, cwd: session.cwd }
}

// ─── Recording ────────────────────────────────────────────────────────────────

export function startPtyRecording(
  id: string,
  win: BrowserWindow
): { success: boolean; error?: string } {
  const session = sessions.get(id)
  if (!session) {
    return { success: false, error: `Session ${id} not found` }
  }
  if (recordings.has(id)) {
    return { success: false, error: `Session ${id} is already recording` }
  }

  const now = Date.now()
  const events: AsciicastEvent[] = []

  // Subscribe to PTY data to capture output with timestamps.
  // We add a second listener on top of the existing one — node-pty supports
  // multiple onData listeners (each call to onData registers a new one).
  const dataDisposable = session.process.onData((data: string) => {
    if (!recordings.has(id)) return
    const rec = recordings.get(id)!
    const elapsed = (Date.now() - rec.startTime) / 1000
    rec.events.push({ time: elapsed, data })
  })

  const state: RecordingState = {
    startTime: now,
    startTimeSec: Math.floor(now / 1000),
    events,
    cols: session.process.cols,
    rows: session.process.rows,
    dataCleanup: () => dataDisposable.dispose(),
  }

  recordings.set(id, state)

  // Notify renderer that recording has started
  if (!win.isDestroyed()) {
    win.webContents.send(`pty:recordingState:${id}`, { recording: true })
  }

  return { success: true }
}

export async function stopPtyRecording(
  id: string,
  win: BrowserWindow
): Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }> {
  const rec = recordings.get(id)
  if (!rec) {
    return { success: false, error: `Session ${id} is not recording` }
  }

  // Stop capturing
  rec.dataCleanup?.()
  recordings.delete(id)

  // Notify renderer
  if (!win.isDestroyed()) {
    win.webContents.send(`pty:recordingState:${id}`, { recording: false })
  }

  // Build asciicast v2 content
  const header = JSON.stringify({
    version: 2,
    width: rec.cols,
    height: rec.rows,
    timestamp: rec.startTimeSec,
    title: 'Terminal Recording',
  })

  const eventLines = rec.events.map((e) =>
    JSON.stringify([parseFloat(e.time.toFixed(6)), 'o', e.data])
  )

  const content = [header, ...eventLines].join('\n') + '\n'

  // Prompt user to save
  try {
    const result = await dialog.showSaveDialog(win, {
      title: 'Save Terminal Recording',
      defaultPath: `terminal-recording-${Date.now()}.cast`,
      filters: [
        { name: 'Asciicast', extensions: ['cast'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })

    if (result.canceled || !result.filePath) {
      return { success: true, cancelled: true }
    }

    await fs.writeFile(result.filePath, content, 'utf-8')
    return { success: true, filePath: result.filePath }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Claude CLI command builder ───────────────────────────────────────────────

/** Returns just the flag arguments (no 'claude' prefix) for direct spawn use. */
export function buildClaudeArgs(settings: ClaudeCliSettings): string[] {
  const args: string[] = []

  if (settings.permissionMode && settings.permissionMode !== 'default') {
    args.push('--permission-mode', settings.permissionMode)
  }
  if (settings.model) {
    args.push('--model', settings.model)
  }
  if (settings.effort) {
    args.push('--effort', settings.effort)
  }
  if (settings.verbose) {
    args.push('--verbose')
  }
  if (settings.maxBudgetUsd > 0) {
    args.push('--max-budget-usd', String(settings.maxBudgetUsd))
  }
  if (settings.allowedTools) {
    args.push('--allowedTools', settings.allowedTools)
  }
  if (settings.disallowedTools) {
    args.push('--disallowedTools', settings.disallowedTools)
  }
  if (settings.appendSystemPrompt) {
    args.push('--append-system-prompt', settings.appendSystemPrompt)
  }
  for (const dir of settings.addDirs ?? []) {
    args.push('--add-dir', dir)
  }
  if (settings.chrome) {
    args.push('--chrome')
  }
  if (settings.worktree) {
    args.push('--worktree')
  }
  if (settings.dangerouslySkipPermissions) {
    args.push('--dangerously-skip-permissions')
  }

  return args
}

/**
 * Spawns a Claude Code session directly — no visible shell prompt, no typed command.
 *
 * On Windows: spawns PowerShell with -Command so Claude starts immediately.
 * On Unix: spawns the `claude` binary directly.
 */
export function spawnClaudePty(
  id: string,
  win: BrowserWindow,
  settings: ClaudeCliSettings,
  options: SpawnOptions & { initialPrompt?: string } = {}
): { success: boolean; error?: string } {
  if (sessions.has(id)) {
    return { success: false, error: `Session ${id} already exists` }
  }

  const cwd = options.cwd ?? os.homedir()
  const cols = options.cols ?? 80
  const rows = options.rows ?? 24

  const claudeArgs = buildClaudeArgs(settings)

  let shell: string
  let args: string[]

  if (process.platform === 'win32') {
    // PowerShell: -NoLogo -NoExit -Command runs claude immediately,
    // then leaves the shell open after claude exits (useful for follow-up commands).
    const claudeCmd = ['claude', ...claudeArgs].join(' ')
    shell = 'powershell.exe'
    args = ['-NoLogo', '-NoExit', '-Command', claudeCmd]
  } else {
    // Unix: spawn claude directly — no shell wrapper needed.
    shell = 'claude'
    args = claudeArgs
  }

  try {
    const proc = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        ...options.env
      } as Record<string, string>
    })

    const session: PtySession = { id, process: proc, cwd, shell }
    sessions.set(id, session)
    sessionWindowMap.set(id, win.id)

    proc.onData((data: string) => {
      if (!win.isDestroyed()) win.webContents.send(`pty:data:${id}`, data)
    })

    proc.onExit(({ exitCode, signal }) => {
      sessions.delete(id)
      sessionWindowMap.delete(id)
      if (!win.isDestroyed()) win.webContents.send(`pty:exit:${id}`, { exitCode, signal })
    })

    // Write initial prompt to Claude after startup delay (Claude CLI needs time to initialize)
    if (options.initialPrompt) {
      setTimeout(() => {
        if (sessions.has(id)) {
          proc.write(options.initialPrompt + '\r')
        }
      }, 1500)
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

export function buildClaudeCommand(settings: ClaudeCliSettings): string {
  const parts: string[] = ['claude']

  if (settings.permissionMode && settings.permissionMode !== 'default') {
    parts.push(`--permission-mode ${settings.permissionMode}`)
  }
  if (settings.model) {
    parts.push(`--model ${settings.model}`)
  }
  if (settings.effort) {
    parts.push(`--effort ${settings.effort}`)
  }
  if (settings.verbose) {
    parts.push('--verbose')
  }
  if (settings.maxBudgetUsd > 0) {
    parts.push(`--max-budget-usd ${settings.maxBudgetUsd}`)
  }
  if (settings.allowedTools) {
    parts.push(`--allowedTools "${settings.allowedTools}"`)
  }
  if (settings.disallowedTools) {
    parts.push(`--disallowedTools "${settings.disallowedTools}"`)
  }
  if (settings.appendSystemPrompt) {
    // Escape quotes in the prompt
    const escaped = settings.appendSystemPrompt.replace(/"/g, '\\"')
    parts.push(`--append-system-prompt "${escaped}"`)
  }
  if (settings.addDirs.length > 0) {
    parts.push(`--add-dir ${settings.addDirs.map(d => `"${d}"`).join(' ')}`)
  }
  if (settings.chrome) {
    parts.push('--chrome')
  }
  if (settings.worktree) {
    parts.push('--worktree')
  }
  if (settings.dangerouslySkipPermissions) {
    parts.push('--dangerously-skip-permissions')
  }

  return parts.join(' ')
}
